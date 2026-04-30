import {
  sync_error_status,
  sync_job_status,
  sync_job_type,
  sync_run_status,
  sync_run_trigger
} from "@prisma/client";
import { VideoSyncService } from "./video-sync-service";
import { createSyncLogger } from "../logging/sync-logger";

const DEFAULT_STALE_LOCK_MS = 30 * 60 * 1000;

const asFiniteNumber = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const buildStageFlags = (runTypeTag) => {
  const tag = String(runTypeTag || "baseline_full_sync").trim();
  if (tag === "ingest_only") {
    return {
      enableTranscript: false,
      enableEmbeddings: false,
      enableCategorization: false
    };
  }
  return {
    enableTranscript: true,
    enableEmbeddings: true,
    enableCategorization: true
  };
};

export class SyncJobService {
  constructor({ prisma, logger = null, workerId = null }) {
    this.prisma = prisma;
    this.workerId = workerId || `worker-${process.pid || "unknown"}`;
    this.logger = logger || createSyncLogger({ service: "sync-job", workerId: this.workerId });
  }

  async getSyncableSources({ dataSourceId = null } = {}) {
    const syncService = new VideoSyncService({ prisma: this.prisma, logger: this.logger });
    return syncService.getDataSources({ dataSourceId });
  }

  async enqueueVimeoSync({
    dataSourceId = null,
    initiatedByUserId = null,
    trigger = sync_run_trigger.manual,
    runTypeTag = "baseline_full_sync",
    retryOfRunId = null,
    perPage = 50,
    maxPages = 0,
    testVideoLimit = null
  } = {}) {
    const sources = await this.getSyncableSources({ dataSourceId });
    if (!sources.length) {
      return {
        status: "skipped",
        reason: dataSourceId
          ? "Data source not found or unavailable."
          : "No active Vimeo data sources found.",
        jobs: []
      };
    }

    const jobs = [];
    for (const source of sources) {
      const stageFlags = buildStageFlags(runTypeTag);
      const run = await this.prisma.sync_runs.create({
        data: {
          data_source_id: source.id,
          initiated_by_user_id: initiatedByUserId,
          retry_of_run_id: retryOfRunId,
          trigger,
          status: sync_run_status.queued,
          notes: String(runTypeTag || "baseline_full_sync")
        }
      });

      const job = await this.prisma.sync_jobs.create({
        data: {
          sync_run_id: run.id,
          data_source_id: source.id,
          job_type: sync_job_type.vimeo_sync,
          status: sync_job_status.queued,
          payload: {
            dataSourceId: source.id,
            syncRunId: run.id,
            initiatedByUserId,
            trigger,
            runTypeTag: String(runTypeTag || "baseline_full_sync"),
            ...stageFlags,
            retryOfRunId,
            perPage: asFiniteNumber(perPage, 50),
            maxPages: asFiniteNumber(maxPages, 0),
            testVideoLimit: testVideoLimit === null ? null : asFiniteNumber(testVideoLimit, null)
          }
        }
      });

      jobs.push({
        jobId: job.id,
        syncRunId: run.id,
        dataSourceId: source.id,
        sourceName: source.name,
        status: job.status
      });
    }

    return {
      status: "accepted",
      jobs
    };
  }

  async enqueueRetryRun({ syncRunId, initiatedByUserId = null, perPage = 50, maxPages = 0, testVideoLimit = null }) {
    const existingRun = await this.prisma.sync_runs.findUnique({
      where: { id: syncRunId },
      select: {
        id: true,
        data_source_id: true,
        status: true
      }
    });

    if (!existingRun) {
      throw new Error("Sync run not found.");
    }

    if (![sync_run_status.failed, sync_run_status.partial].includes(existingRun.status)) {
      throw new Error("Only failed or partial sync runs can be retried.");
    }

    await this.prisma.sync_errors.updateMany({
      where: {
        sync_run_id: existingRun.id,
        status: sync_error_status.open
      },
      data: {
        status: sync_error_status.retrying,
        retry_count: { increment: 1 },
        next_retry_at: null,
        updated_at: new Date()
      }
    });

    return this.enqueueVimeoSync({
      dataSourceId: existingRun.data_source_id,
      initiatedByUserId,
      trigger: sync_run_trigger.retry,
      runTypeTag: "baseline_full_sync",
      retryOfRunId: existingRun.id,
      perPage,
      maxPages,
      testVideoLimit
    });
  }

  async recoverStaleJobs({ staleAfterMs = DEFAULT_STALE_LOCK_MS } = {}) {
    const staleBefore = new Date(Date.now() - staleAfterMs);
    const result = await this.prisma.sync_jobs.updateMany({
      where: {
        status: sync_job_status.running,
        locked_at: { lt: staleBefore }
      },
      data: {
        status: sync_job_status.queued,
        locked_at: null,
        locked_by: null,
        updated_at: new Date()
      }
    });

    await this.prisma.sync_run_videos.updateMany({
      where: {
        status: "running",
        updated_at: { lt: staleBefore }
      },
      data: {
        status: "queued",
        started_at: null,
        updated_at: new Date()
      }
    });

    return result.count;
  }

  async claimNextJob() {
    const job = await this.prisma.sync_jobs.findFirst({
      where: { status: sync_job_status.queued },
      orderBy: { created_at: "asc" }
    });

    if (!job) return null;

    const now = new Date();
    const claimed = await this.prisma.sync_jobs.updateMany({
      where: {
        id: job.id,
        status: sync_job_status.queued
      },
      data: {
        status: sync_job_status.running,
        attempts: { increment: 1 },
        locked_at: now,
        locked_by: this.workerId,
        started_at: job.started_at || now,
        updated_at: now
      }
    });

    if (claimed.count !== 1) return null;

    return this.prisma.sync_jobs.findUnique({ where: { id: job.id } });
  }

  async processNextJob() {
    await this.recoverStaleJobs();
    const job = await this.claimNextJob();
    if (!job) {
      return { status: "idle" };
    }

    try {
      const result = await this.processJob(job);
      const status =
        result?.status === "success"
          ? sync_job_status.success
          : result?.status === "failed"
          ? sync_job_status.failed
          : sync_job_status.partial;

      await this.prisma.sync_jobs.update({
        where: { id: job.id },
        data: {
          status,
          finished_at: new Date(),
          locked_at: null,
          locked_by: null,
          error_message: result?.error || null,
          updated_at: new Date()
        }
      });

      const runTypeTag = String(job.payload?.runTypeTag || "");
      if (status === sync_job_status.success && runTypeTag === "ingest_only") {
        const run = await this.prisma.sync_runs.create({
          data: {
            data_source_id: job.data_source_id,
            initiated_by_user_id: job.payload?.initiatedByUserId || null,
            trigger: job.payload?.trigger || sync_run_trigger.manual,
            status: sync_run_status.queued,
            notes: "enrichment_async"
          }
        });
        await this.prisma.sync_jobs.create({
          data: {
            sync_run_id: run.id,
            data_source_id: job.data_source_id,
            job_type: sync_job_type.vimeo_sync,
            status: sync_job_status.queued,
            payload: {
              dataSourceId: job.data_source_id,
              syncRunId: run.id,
              initiatedByUserId: job.payload?.initiatedByUserId || null,
              trigger: job.payload?.trigger || sync_run_trigger.manual,
              runTypeTag: "enrichment_async",
              mode: "enrich_from_run",
              parentSyncRunId: job.sync_run_id,
              enableTranscript: true,
              enableEmbeddings: true,
              enableCategorization: true
            }
          }
        });
      }

      return {
        status,
        jobId: job.id,
        syncRunId: job.sync_run_id,
        result
      };
    } catch (error) {
      const shouldRetry = job.attempts < job.max_attempts;
      const status = shouldRetry ? sync_job_status.queued : sync_job_status.failed;
      await this.prisma.sync_jobs.update({
        where: { id: job.id },
        data: {
          status,
          finished_at: shouldRetry ? null : new Date(),
          locked_at: null,
          locked_by: null,
          error_message: error.message || "Sync job failed",
          updated_at: new Date()
        }
      });

      if (job.sync_run_id && !shouldRetry) {
        const existingRun = await this.prisma.sync_runs.findUnique({
          where: { id: job.sync_run_id },
          select: { notes: true }
        });
        await this.prisma.sync_runs.update({
          where: { id: job.sync_run_id },
          data: {
            status: sync_run_status.failed,
            finished_at: new Date(),
            // Keep run-type tags stable for reporting; detailed error is in sync_jobs/sync_errors.
            notes: existingRun?.notes || null
          }
        });
      }

      this.logger.error?.("Sync job failed", {
        jobId: job.id,
        shouldRetry,
        error: error.message
      });

      return {
        status,
        jobId: job.id,
        syncRunId: job.sync_run_id,
        error: error.message
      };
    }
  }

  async processJob(job) {
    if (job.job_type !== sync_job_type.vimeo_sync) {
      throw new Error(`Unsupported sync job type: ${job.job_type}`);
    }

    const payload = job.payload || {};
    const service = new VideoSyncService({ prisma: this.prisma, logger: this.logger });
    const dataSources = await service.getDataSources({ dataSourceId: payload.dataSourceId || job.data_source_id });
    const dataSource = dataSources[0];
    if (!dataSource) {
      throw new Error("Data source for sync job was not found.");
    }

    if (payload.mode === "enrich_from_run") {
      return service.runEnrichmentForSyncRun({
        dataSource,
        existingSyncRunId: payload.syncRunId || job.sync_run_id,
        parentSyncRunId: payload.parentSyncRunId,
        initiatedByUserId: payload.initiatedByUserId || null,
        trigger: payload.trigger || sync_run_trigger.manual,
        runTypeTag: payload.runTypeTag || "enrichment_async",
        enableTranscript: payload.enableTranscript !== false,
        enableEmbeddings: payload.enableEmbeddings !== false,
        enableCategorization: payload.enableCategorization !== false
      });
    }

    return service.runForDataSource({
      dataSource,
      existingSyncRunId: payload.syncRunId || job.sync_run_id,
      initiatedByUserId: payload.initiatedByUserId || null,
      trigger: payload.trigger || sync_run_trigger.manual,
      runTypeTag: payload.runTypeTag || null,
      enableTranscript: payload.enableTranscript,
      enableEmbeddings: payload.enableEmbeddings,
      enableCategorization: payload.enableCategorization,
      retryOfRunId: payload.retryOfRunId || null,
      perPage: payload.perPage,
      maxPages: payload.maxPages,
      testVideoLimit: payload.testVideoLimit
    });
  }
}
