import { source_platform, source_status, sync_error_status, sync_run_status, sync_run_trigger } from "@prisma/client";
import { VimeoClient } from "./vimeo-client";
import { OpenAiService } from "./openai-service";
import { TranscriptService } from "./transcript-service";
import { EmbeddingService } from "./embedding-service";
import { VideoCategorizationService } from "./video-categorization-service";
import { env } from "../config/env";
import { decryptSecret, encryptSecret } from "../security/secrets";
import { AdminAiConfigService } from "./admin-ai-config-service";
import { createSyncLogger } from "../logging/sync-logger";

const toDateOrNull = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const buildVideoSummary = ({ video, tags }) =>
  [
    `Title: ${video.title || ""}`,
    `Description: ${video.description || ""}`,
    `Folder: ${video.folder_name || ""}`,
    `Tags: ${(tags || []).join(", ")}`
  ]
    .join("\n")
    .trim();

const PROGRESS_FLUSH_EVERY = 5;
const PROGRESS_FLUSH_MS = 4000;
const DEFAULT_SYNC_CONCURRENCY = 2;
const MAX_SYNC_CONCURRENCY = 10;

export class VideoSyncService {
  constructor({ prisma, logger = null }) {
    this.prisma = prisma;
    this.logger = logger || createSyncLogger({ service: "video-sync" });
  }

  async ensureDefaultDataSource() {
    const existing = await this.prisma.data_sources.findFirst({
      where: {
        platform: source_platform.vimeo
      },
      orderBy: { created_at: "asc" }
    });
    if (existing) return existing;
    if (!env.vimeoAccessToken) return null;

    return this.prisma.data_sources.create({
      data: {
        name: "Primary Vimeo Source",
        platform: source_platform.vimeo,
        access_token_encrypted: encryptSecret(env.vimeoAccessToken),
        status: source_status.connected
      }
    });
  }

  async getDataSources({ dataSourceId = null } = {}) {
    if (dataSourceId) {
      const source = await this.prisma.data_sources.findUnique({ where: { id: dataSourceId } });
      return source ? [source] : [];
    }

    const all = await this.prisma.data_sources.findMany({
      where: { platform: source_platform.vimeo, status: { not: source_status.disabled } },
      orderBy: { created_at: "asc" }
    });

    if (all.length > 0) return all;
    const fallback = await this.ensureDefaultDataSource();
    return fallback ? [fallback] : [];
  }

  async createSyncRun({ dataSourceId, initiatedByUserId = null, trigger = sync_run_trigger.manual, retryOfRunId = null }) {
    return this.prisma.sync_runs.create({
      data: {
        data_source_id: dataSourceId,
        initiated_by_user_id: initiatedByUserId,
        retry_of_run_id: retryOfRunId,
        trigger,
        status: sync_run_status.running,
        started_at: new Date()
      }
    });
  }

  async recordSyncError({ syncRunId, dataSourceId, videoId = null, stage, error, payload = {} }) {
    await this.prisma.sync_errors.create({
      data: {
        sync_run_id: syncRunId,
        data_source_id: dataSourceId,
        video_id: videoId,
        stage,
        status: sync_error_status.open,
        error_code: error?.code || null,
        error_message: error?.message || "Unknown sync error",
        payload
      }
    });
  }

  async upsertVideo({ dataSource, vimeoVideo }) {
    const existing = await this.prisma.videos.findUnique({
      where: { vimeo_video_id: vimeoVideo.vimeoVideoId },
      select: { id: true }
    });

    const metadata = {
      privacy_view: vimeoVideo.privacyView,
      folder_name: vimeoVideo.folderName,
      raw: vimeoVideo.raw || {},
      download_link: Array.isArray(vimeoVideo.raw?.download) ? vimeoVideo.raw.download[0]?.link || null : null
    };

    const video = await this.prisma.videos.upsert({
      where: { vimeo_video_id: vimeoVideo.vimeoVideoId },
      create: {
        data_source_id: dataSource.id,
        vimeo_video_id: vimeoVideo.vimeoVideoId,
        vimeo_uri: vimeoVideo.vimeoUri,
        title: vimeoVideo.title,
        description: vimeoVideo.description,
        duration_seconds: vimeoVideo.durationSeconds,
        thumbnail_url: vimeoVideo.thumbnailUrl,
        video_url: vimeoVideo.videoUrl,
        folder_name: vimeoVideo.folderName,
        privacy_view: vimeoVideo.privacyView,
        metadata_json: metadata,
        published_at: toDateOrNull(vimeoVideo.publishedAt),
        synced_at: new Date()
      },
      update: {
        data_source_id: dataSource.id,
        vimeo_uri: vimeoVideo.vimeoUri,
        title: vimeoVideo.title,
        description: vimeoVideo.description,
        duration_seconds: vimeoVideo.durationSeconds,
        thumbnail_url: vimeoVideo.thumbnailUrl,
        video_url: vimeoVideo.videoUrl,
        folder_name: vimeoVideo.folderName,
        privacy_view: vimeoVideo.privacyView,
        metadata_json: metadata,
        published_at: toDateOrNull(vimeoVideo.publishedAt),
        synced_at: new Date(),
        status: "active"
      }
    });

    await this.prisma.video_tags.deleteMany({ where: { video_id: video.id } });
    const uniqueTags = Array.from(new Set((vimeoVideo.tags || []).map((tag) => String(tag).trim()).filter(Boolean)));
    if (uniqueTags.length) {
      await this.prisma.video_tags.createMany({
        data: uniqueTags.map((tag) => ({
          video_id: video.id,
          tag
        }))
      });
    }

    return {
      video,
      isInsert: !existing
    };
  }

  async runForDataSource({
    dataSource,
    initiatedByUserId = null,
    trigger = sync_run_trigger.manual,
    retryOfRunId = null,
    perPage = 50,
    maxPages = 0,
    testVideoLimit = null
  }) {
    const syncRun = await this.createSyncRun({
      dataSourceId: dataSource.id,
      initiatedByUserId,
      trigger,
      retryOfRunId
    });
    const runLogger = this.logger.child?.({
      syncRunId: syncRun.id,
      dataSourceId: dataSource.id,
      dataSourceName: dataSource.name
    }) || this.logger;
    runLogger.info("Sync run started", {
      trigger,
      initiatedByUserId: initiatedByUserId || null
    });

    const aiConfigService = new AdminAiConfigService({ prisma: this.prisma });
    const runtimeAiConfig = await aiConfigService.getRuntimeConfig();
    runLogger.info("Loaded runtime AI config", {
      embeddingModel: runtimeAiConfig.embeddingModel,
      transcriptionModel: runtimeAiConfig.transcriptionModel,
      hasOpenAiApiKey: Boolean(runtimeAiConfig.openAiApiKey)
    });
    const hasStoredToken = Boolean(dataSource.access_token_encrypted);
    const decryptedSourceToken = hasStoredToken ? decryptSecret(dataSource.access_token_encrypted) : null;

    if (hasStoredToken && !decryptedSourceToken) {
      throw new Error(
        `Source "${dataSource.name}" token could not be decrypted. Re-save the Vimeo token for this source (APP_SECRET_KEY likely changed).`
      );
    }

    if (!decryptedSourceToken) {
      throw new Error(
        `Source "${dataSource.name}" has no Vimeo access token saved. Edit source and save a valid token.`
      );
    }

    const sourceToken = decryptedSourceToken;

    const vimeoClient = new VimeoClient(sourceToken, runLogger);
    const openAiService = new OpenAiService({
      apiKey: runtimeAiConfig.openAiApiKey,
      embeddingModel: runtimeAiConfig.embeddingModel,
      transcriptionModel: runtimeAiConfig.transcriptionModel
    });
    const transcriptService = new TranscriptService({
      prisma: this.prisma,
      vimeoClient,
      openAiService,
      logger: runLogger
    });
    const embeddingService = new EmbeddingService({
      prisma: this.prisma,
      openAiService,
      logger: runLogger
    });
    const categorizationService = new VideoCategorizationService({ prisma: this.prisma, logger: runLogger });

    const counters = {
      scanned: 0,
      processed: 0,
      created: 0,
      updated: 0,
      failed: 0,
      transcriptsProcessed: 0,
      embeddingsCreated: 0
    };
    let lastProgressFlushAt = 0;
    let flushQueue = Promise.resolve();

    const flushRunProgress = async ({ force = false } = {}) => {
      const now = Date.now();
      const shouldFlush =
        force ||
        counters.processed === 0 ||
        counters.processed % PROGRESS_FLUSH_EVERY === 0 ||
        now - lastProgressFlushAt >= PROGRESS_FLUSH_MS;

      if (!shouldFlush) return;

      await this.prisma.sync_runs.update({
        where: { id: syncRun.id },
        data: {
          status: sync_run_status.running,
          videos_scanned: counters.scanned,
          videos_deleted: counters.processed,
          videos_created: counters.created,
          videos_updated: counters.updated,
          transcripts_processed: counters.transcriptsProcessed,
          embeddings_created: counters.embeddingsCreated,
          error_count: counters.failed
        }
      });
      lastProgressFlushAt = now;
    };

    const queueRunProgressFlush = ({ force = false } = {}) => {
      flushQueue = flushQueue
        .then(() => flushRunProgress({ force }))
        .catch((error) => {
          runLogger.warn("Sync run progress flush failed", { error: error.message });
        });
      return flushQueue;
    };

    try {
      runLogger.info("Marking source as syncing");
      await this.prisma.data_sources.update({
        where: { id: dataSource.id },
        data: { status: source_status.syncing, updated_at: new Date() }
      });

      if (!vimeoClient.isConfigured()) {
        throw new Error(`Data source ${dataSource.id} has no Vimeo access token configured.`);
      }

      const videos = await vimeoClient.listVideos({ perPage, maxPages });
      const configuredTestLimit = Number(process.env.SYNC_TEST_VIDEO_LIMIT || "");
      const requestedTestLimit = Number(testVideoLimit);
      const effectiveTestLimit =
        Number.isFinite(requestedTestLimit) && requestedTestLimit > 0
          ? Math.floor(requestedTestLimit)
          : Number.isFinite(configuredTestLimit) && configuredTestLimit > 0
          ? Math.floor(configuredTestLimit)
          : null;
      const videosToProcess = effectiveTestLimit ? videos.slice(0, effectiveTestLimit) : videos;

      if (effectiveTestLimit && videos.length > effectiveTestLimit) {
        runLogger.warn("Test video limit applied to fetched videos", {
          fetched: videos.length,
          processing: videosToProcess.length,
          testVideoLimit: effectiveTestLimit
        });
      }

      runLogger.info("Fetched videos for processing", {
        fetched: videos.length,
        processing: videosToProcess.length
      });
      counters.scanned = videosToProcess.length;
      await queueRunProgressFlush({ force: true });

      const configuredConcurrency = Number(process.env.SYNC_CONCURRENCY || "");
      const workerCount = Math.max(
        1,
        Math.min(
          MAX_SYNC_CONCURRENCY,
          Number.isFinite(configuredConcurrency) && configuredConcurrency > 0
            ? Math.floor(configuredConcurrency)
            : DEFAULT_SYNC_CONCURRENCY
        )
      );
      runLogger.info("Video processing workers started", {
        workerCount,
        queueLength: videosToProcess.length
      });

      let nextVideoIndex = 0;

      const processSingleVideo = async (vimeoVideo) => {
        runLogger.info("Processing video started", {
          vimeoVideoId: vimeoVideo.vimeoVideoId,
          title: vimeoVideo.title
        });
        try {
          let videoRecord = null;
          let canProcessVideo = true;

          try {
            runLogger.debug("Upserting video record", {
              vimeoVideoId: vimeoVideo.vimeoVideoId
            });
            const upserted = await this.upsertVideo({ dataSource, vimeoVideo });
            videoRecord = upserted.video;
            if (upserted.isInsert) counters.created += 1;
            else counters.updated += 1;
            runLogger.info("Video upserted", {
              videoId: videoRecord.id,
              vimeoVideoId: vimeoVideo.vimeoVideoId,
              action: upserted.isInsert ? "created" : "updated"
            });
          } catch (error) {
            counters.failed += 1;
            canProcessVideo = false;
            runLogger.error("Video upsert failed", {
              vimeoVideoId: vimeoVideo.vimeoVideoId,
              error: error.message
            });
            await this.recordSyncError({
              syncRunId: syncRun.id,
              dataSourceId: dataSource.id,
              stage: "upsert",
              error,
              payload: { vimeoVideoId: vimeoVideo.vimeoVideoId }
            });
          }

          if (canProcessVideo && videoRecord) {
            try {
              runLogger.debug("Transcript processing started", {
                videoId: videoRecord.id
              });
              const transcriptResult = await transcriptService.processVideoTranscript(videoRecord);
              if (!transcriptResult.skipped) {
                counters.transcriptsProcessed += 1;
              }
              runLogger.info("Transcript processing completed", {
                videoId: videoRecord.id,
                source: transcriptResult.source,
                skipped: transcriptResult.skipped,
                chunksCount: transcriptResult.chunksCount || 0
              });

              const tags = vimeoVideo.tags || [];
              const summary = buildVideoSummary({ video: videoRecord, tags });
              runLogger.debug("Metadata embedding started", {
                videoId: videoRecord.id
              });
              const metadataEmbedding = await embeddingService.embedVideo({
                videoId: videoRecord.id,
                summaryText: summary
              });
              if (!metadataEmbedding.skipped) {
                counters.embeddingsCreated += 1;
              } else {
                runLogger.warn("Metadata embedding skipped", {
                  videoId: videoRecord.id,
                  reason: metadataEmbedding.reason
                });
                await this.recordSyncError({
                  syncRunId: syncRun.id,
                  dataSourceId: dataSource.id,
                  videoId: videoRecord.id,
                  stage: "embed",
                  error: new Error(`Skipped metadata embedding: ${metadataEmbedding.reason}`),
                  payload: { vimeoVideoId: vimeoVideo.vimeoVideoId }
                });
              }

              if (transcriptResult.transcriptId) {
                runLogger.debug("Transcript chunk embedding started", {
                  videoId: videoRecord.id,
                  transcriptId: transcriptResult.transcriptId
                });
                const chunkEmbedding = await embeddingService.embedTranscriptChunks({
                  transcriptId: transcriptResult.transcriptId
                });
                if (!chunkEmbedding.skipped) {
                  counters.embeddingsCreated += chunkEmbedding.embedded;
                  runLogger.info("Transcript chunk embeddings completed", {
                    videoId: videoRecord.id,
                    transcriptId: transcriptResult.transcriptId,
                    embedded: chunkEmbedding.embedded
                  });
                } else {
                  runLogger.warn("Transcript chunk embeddings skipped", {
                    videoId: videoRecord.id,
                    transcriptId: transcriptResult.transcriptId,
                    reason: chunkEmbedding.reason
                  });
                  await this.recordSyncError({
                    syncRunId: syncRun.id,
                    dataSourceId: dataSource.id,
                    videoId: videoRecord.id,
                    stage: "embed",
                    error: new Error(`Skipped chunk embeddings: ${chunkEmbedding.reason}`),
                    payload: { transcriptId: transcriptResult.transcriptId }
                  });
                }
              }

              const activeTranscript = await this.prisma.transcripts.findFirst({
                where: {
                  video_id: videoRecord.id,
                  is_active: true,
                  status: "complete"
                },
                select: { raw_text: true },
                orderBy: [{ version: "desc" }, { updated_at: "desc" }]
              });
              await categorizationService.categorizeVideo({
                videoId: videoRecord.id,
                title: videoRecord.title,
                description: videoRecord.description,
                folderName: videoRecord.folder_name,
                tags,
                transcriptText: activeTranscript?.raw_text || ""
              });
              runLogger.info("Video processing completed", {
                videoId: videoRecord.id,
                vimeoVideoId: vimeoVideo.vimeoVideoId
              });
            } catch (error) {
              counters.failed += 1;
              runLogger.error("Video processing failed", {
                videoId: videoRecord?.id || null,
                vimeoVideoId: vimeoVideo.vimeoVideoId,
                error: error.message
              });
              await this.recordSyncError({
                syncRunId: syncRun.id,
                dataSourceId: dataSource.id,
                videoId: videoRecord?.id || null,
                stage: "fetch_transcript",
                error,
                payload: { vimeoVideoId: vimeoVideo.vimeoVideoId }
              });
            }
          }
        } finally {
          counters.processed += 1;
          await queueRunProgressFlush();
          runLogger.info("Sync run progress updated", {
            processed: counters.processed,
            total: counters.scanned,
            created: counters.created,
            updated: counters.updated,
            failed: counters.failed
          });
        }
      };

      const workers = Array.from({ length: Math.min(workerCount, videosToProcess.length || 1) }, (_, workerIndex) =>
        (async () => {
          while (true) {
            const currentIndex = nextVideoIndex;
            nextVideoIndex += 1;
            if (currentIndex >= videosToProcess.length) return;
            const vimeoVideo = videosToProcess[currentIndex];
            runLogger.debug("Worker picked video", {
              workerIndex: workerIndex + 1,
              queueIndex: currentIndex + 1,
              queueLength: videosToProcess.length,
              vimeoVideoId: vimeoVideo.vimeoVideoId
            });
            await processSingleVideo(vimeoVideo);
          }
        })()
      );

      await Promise.all(workers);

      await queueRunProgressFlush({ force: true });
      await this.prisma.sync_runs.update({
        where: { id: syncRun.id },
        data: {
          status: counters.failed > 0 ? sync_run_status.partial : sync_run_status.success,
          finished_at: new Date(),
          videos_scanned: counters.scanned,
          videos_deleted: counters.processed,
          videos_created: counters.created,
          videos_updated: counters.updated,
          transcripts_processed: counters.transcriptsProcessed,
          embeddings_created: counters.embeddingsCreated,
          error_count: counters.failed
        }
      });

      await this.prisma.data_sources.update({
        where: { id: dataSource.id },
        data: {
          last_sync_at: new Date(),
          status: source_status.connected,
          video_count: await this.prisma.videos.count({ where: { data_source_id: dataSource.id, status: "active" } })
        }
      });

      return {
        syncRunId: syncRun.id,
        status: counters.failed > 0 ? "partial" : "success",
        logFilePath: runLogger.filePath,
        counters
      };
    } catch (error) {
      runLogger.error("Sync run failed", {
        error: error.message
      });
      await this.prisma.sync_runs.update({
        where: { id: syncRun.id },
        data: {
          status: sync_run_status.failed,
          finished_at: new Date(),
          videos_scanned: counters.scanned,
          videos_deleted: counters.processed,
          videos_created: counters.created,
          videos_updated: counters.updated,
          transcripts_processed: counters.transcriptsProcessed,
          embeddings_created: counters.embeddingsCreated,
          error_count: counters.failed + 1,
          notes: error.message
        }
      });

      await this.recordSyncError({
        syncRunId: syncRun.id,
        dataSourceId: dataSource.id,
        stage: "fetch_metadata",
        error
      });

      await this.prisma.data_sources.update({
        where: { id: dataSource.id },
        data: { status: source_status.error }
      });

      return {
        syncRunId: syncRun.id,
        status: "failed",
        error: error.message,
        logFilePath: runLogger.filePath,
        counters
      };
    } finally {
      runLogger.info("Sync run finished", {
        counters
      });
    }
  }

  async runSync({
    dataSourceId = null,
    initiatedByUserId = null,
    trigger = sync_run_trigger.manual,
    retryOfRunId = null,
    perPage = 50,
    maxPages = 0,
    testVideoLimit = null
  } = {}) {
    const dataSources = await this.getDataSources({ dataSourceId });
    if (!dataSources.length) {
      return {
        status: "skipped",
        reason: "No Vimeo data source found. Add one in DB or set VIMEO_ACCESS_TOKEN."
      };
    }

    const results = [];
    for (const dataSource of dataSources) {
      const result = await this.runForDataSource({
        dataSource,
        initiatedByUserId,
        trigger,
        retryOfRunId,
        perPage,
        maxPages,
        testVideoLimit
      });
      results.push({
        dataSourceId: dataSource.id,
        ...result
      });
    }

    return {
      status: results.every((r) => r.status === "success") ? "success" : "partial",
      results
    };
  }
}
