import { source_status, sync_run_status, sync_run_video_status } from "@prisma/client";
import { SystemHealthService } from "./system-health-service";

export class AdminDashboardService {
  constructor({ prisma }) {
    this.prisma = prisma;
  }

  async getSystemData() {
    const [videoCount, activeSources, userCount, recentRuns] = await Promise.all([
      this.prisma.videos.count({ where: { status: "active" } }),
      this.prisma.data_sources.count({ where: { status: { not: source_status.disabled } } }),
      this.prisma.users.count({ where: { is_active: true } }),
      this.prisma.sync_runs.findMany({
        take: 10,
        orderBy: { created_at: "desc" },
        select: {
          id: true,
          status: true,
          trigger: true,
          notes: true,
          retry_of_run_id: true,
          videos_scanned: true,
          videos_deleted: true,
          videos_created: true,
          videos_updated: true,
          embeddings_created: true,
          started_at: true,
          created_at: true,
          finished_at: true,
          error_count: true,
          data_source: { select: { name: true } }
        }
      })
    ]);

    const runningRunIds = recentRuns.filter((run) => run.status === sync_run_status.running).map((run) => run.id);
    const processedByRunId = new Map();

    if (runningRunIds.length > 0) {
      const grouped = await this.prisma.sync_run_videos.groupBy({
        by: ["sync_run_id", "status"],
        where: {
          sync_run_id: { in: runningRunIds }
        },
        _count: {
          _all: true
        }
      });

      for (const row of grouped) {
        if (![sync_run_video_status.success, sync_run_video_status.failed, sync_run_video_status.skipped].includes(row.status)) {
          continue;
        }
        const current = processedByRunId.get(row.sync_run_id) || 0;
        processedByRunId.set(row.sync_run_id, current + row._count._all);
      }
    }

    const health = await new SystemHealthService({ prisma: this.prisma }).getHealthSummary();

    return {
      stats: {
        totalVideosIndexed: videoCount,
        activeDataSources: activeSources,
        activeUsers: userCount
      },
      health,
      recentRuns: recentRuns.map((run) => ({
        id: run.id,
        sourceName: run.data_source?.name || "Unknown",
        status: run.status,
        trigger: run.trigger,
        notes: run.notes,
        retryOfRunId: run.retry_of_run_id,
        startedAt: run.started_at,
        createdAt: run.created_at,
        finishedAt: run.finished_at,
        errorCount: run.error_count,
        videosScanned: run.videos_scanned,
        videosProcessed: processedByRunId.get(run.id) ?? run.videos_deleted,
        videosCreated: run.videos_created,
        videosUpdated: run.videos_updated,
        embeddingsCreated: run.embeddings_created,
        canRetry: ["failed", "partial"].includes(run.status)
      }))
    };
  }

  async getSyncSpeedReport({
    baselineTag = "baseline_full_sync",
    afterTag = "ingest_only",
    dataSourceId = null,
    sampleSize = 3
  } = {}) {
    const normalizedSampleSize = Math.max(3, Math.min(Number(sampleSize) || 3, 20));
    const tagForEmbeddingRebuild = "enrichment_async";
    const operationWhere = dataSourceId ? { data_source_id: dataSourceId } : {};

    const completedStatuses = ["success", "partial", "failed"];
    const fetchRuns = async (tag) =>
      this.prisma.sync_runs.findMany({
        where: {
          ...operationWhere,
          status: { in: completedStatuses },
          ...(tag === tagForEmbeddingRebuild
            ? { notes: { contains: "embedding_rebuild" } }
            : { notes: { equals: tag } })
        },
        orderBy: { started_at: "desc" },
        take: normalizedSampleSize,
        select: {
          id: true,
          data_source_id: true,
          status: true,
          notes: true,
          started_at: true,
          finished_at: true,
          videos_scanned: true,
          videos_deleted: true,
          error_count: true
        }
      });

    const [baselineRunsRaw, afterRunsRaw] = await Promise.all([fetchRuns(baselineTag), fetchRuns(afterTag)]);
    const allRunIds = Array.from(new Set([...baselineRunsRaw, ...afterRunsRaw].map((run) => run.id)));
    const processedByRunId = new Map();

    if (allRunIds.length > 0) {
      const grouped = await this.prisma.sync_run_videos.groupBy({
        by: ["sync_run_id", "status"],
        where: { sync_run_id: { in: allRunIds } },
        _count: { _all: true }
      });

      for (const row of grouped) {
        if (![sync_run_video_status.success, sync_run_video_status.failed, sync_run_video_status.skipped].includes(row.status)) {
          continue;
        }
        const current = processedByRunId.get(row.sync_run_id) || 0;
        processedByRunId.set(row.sync_run_id, current + row._count._all);
      }
    }

    const toMetric = (run) => {
      const start = run.started_at ? new Date(run.started_at) : null;
      const end = run.finished_at ? new Date(run.finished_at) : null;
      const durationMinutes =
        start && end ? Math.max((end.getTime() - start.getTime()) / 60000, 0) : null;
      const videosProcessed = processedByRunId.get(run.id) ?? Number(run.videos_deleted || 0);
      const throughput = durationMinutes && durationMinutes > 0 ? videosProcessed / durationMinutes : null;

      return {
        runId: run.id,
        dataSourceId: run.data_source_id,
        status: run.status,
        runTypeTag: run.notes,
        startTime: run.started_at,
        endTime: run.finished_at,
        durationMinutes,
        videosTotal: Number(run.videos_scanned || 0),
        videosProcessed,
        throughputVideosPerMinute: throughput,
        errorCount: Number(run.error_count || 0)
      };
    };

    const baselineRuns = baselineRunsRaw.map(toMetric).filter((run) => run.durationMinutes !== null);
    const afterRuns = afterRunsRaw.map(toMetric).filter((run) => run.durationMinutes !== null);

    const median = (values) => {
      if (!values.length) return null;
      const sorted = [...values].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    };

    const baselineDurationMedian = median(baselineRuns.map((run) => run.durationMinutes).filter(Number.isFinite));
    const afterDurationMedian = median(afterRuns.map((run) => run.durationMinutes).filter(Number.isFinite));
    const baselineThroughputMedian = median(
      baselineRuns.map((run) => run.throughputVideosPerMinute).filter(Number.isFinite)
    );
    const afterThroughputMedian = median(
      afterRuns.map((run) => run.throughputVideosPerMinute).filter(Number.isFinite)
    );

    const durationImprovementPct =
      Number.isFinite(baselineDurationMedian) &&
      baselineDurationMedian > 0 &&
      Number.isFinite(afterDurationMedian)
        ? ((baselineDurationMedian - afterDurationMedian) / baselineDurationMedian) * 100
        : null;
    const throughputImprovementPct =
      Number.isFinite(baselineThroughputMedian) &&
      baselineThroughputMedian > 0 &&
      Number.isFinite(afterThroughputMedian)
        ? ((afterThroughputMedian - baselineThroughputMedian) / baselineThroughputMedian) * 100
        : null;

    return {
      baselineTag,
      afterTag,
      sampleSize: normalizedSampleSize,
      enoughData: baselineRuns.length >= 3 && afterRuns.length >= 3,
      baselineRuns,
      afterRuns,
      comparison: {
        median_duration_before: baselineDurationMedian,
        median_duration_after: afterDurationMedian,
        duration_improvement_pct: durationImprovementPct,
        median_throughput_before: baselineThroughputMedian,
        median_throughput_after: afterThroughputMedian,
        throughput_improvement_pct: throughputImprovementPct
      }
    };
  }

  async listUsers() {
    const rows = await this.prisma.users.findMany({
      orderBy: [{ is_active: "desc" }, { updated_at: "desc" }],
      select: {
        id: true,
        full_name: true,
        email: true,
        role: true,
        avatar_initials: true,
        last_login_at: true,
        is_active: true
      }
    });

    return rows.map((row) => ({
      id: row.id,
      name: row.full_name,
      email: row.email,
      role: row.role,
      avatar: row.avatar_initials || row.full_name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase(),
      lastLoginAt: row.last_login_at,
      isActive: row.is_active
    }));
  }

  async listSyncErrors({ status = null, limit = 20 } = {}) {
    const rows = await this.prisma.sync_errors.findMany({
      where: {
        ...(status ? { status } : {})
      },
      orderBy: [{ created_at: "desc" }],
      take: Math.max(1, Math.min(Number(limit) || 20, 100)),
      select: {
        id: true,
        sync_run_id: true,
        status: true,
        stage: true,
        error_code: true,
        error_message: true,
        retry_count: true,
        created_at: true,
        updated_at: true,
        resolved_at: true,
        data_source: { select: { id: true, name: true } },
        video: { select: { id: true, title: true, vimeo_video_id: true } }
      }
    });

    return rows.map((row) => ({
      id: row.id,
      syncRunId: row.sync_run_id,
      status: row.status,
      stage: row.stage,
      errorCode: row.error_code,
      message: row.error_message,
      retryCount: row.retry_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      resolvedAt: row.resolved_at,
      source: row.data_source
        ? {
            id: row.data_source.id,
            name: row.data_source.name
          }
        : null,
      video: row.video
        ? {
            id: row.video.id,
            title: row.video.title,
            vimeoId: row.video.vimeo_video_id
          }
        : null
    }));
  }

  async updateSyncErrorStatus({ id, status }) {
    const allowed = new Set(["open", "retrying", "resolved", "ignored"]);
    if (!allowed.has(status)) {
      throw new Error("Invalid sync error status.");
    }

    const row = await this.prisma.sync_errors.update({
      where: { id },
      data: {
        status,
        resolved_at: status === "resolved" ? new Date() : null,
        updated_at: new Date()
      },
      select: {
        id: true,
        sync_run_id: true,
        status: true,
        stage: true,
        error_message: true,
        updated_at: true,
        resolved_at: true
      }
    });

    return {
      id: row.id,
      syncRunId: row.sync_run_id,
      status: row.status,
      stage: row.stage,
      message: row.error_message,
      updatedAt: row.updated_at,
      resolvedAt: row.resolved_at
    };
  }
}
