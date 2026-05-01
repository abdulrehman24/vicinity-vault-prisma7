import { source_platform, source_status, sync_error_status, sync_run_status, sync_run_trigger, sync_run_video_status } from "@prisma/client";
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

  async upsertSyncRunVideo({ syncRunId, dataSourceId, vimeoVideo, data = {} }) {
    if (!syncRunId || !vimeoVideo?.vimeoVideoId) return null;

    const createData = {
      ...data,
      ...(data.attempts?.increment ? { attempts: data.attempts.increment } : {})
    };
    const updateData = {
      ...data,
      updated_at: new Date()
    };

    return this.prisma.sync_run_videos.upsert({
      where: {
        sync_run_id_vimeo_video_id: {
          sync_run_id: syncRunId,
          vimeo_video_id: vimeoVideo.vimeoVideoId
        }
      },
      create: {
        sync_run_id: syncRunId,
        data_source_id: dataSourceId,
        vimeo_video_id: vimeoVideo.vimeoVideoId,
        payload: { title: vimeoVideo.title, videoUrl: vimeoVideo.videoUrl },
        ...createData
      },
      update: updateData
    });
  }

  async queueSyncRunVideos({ syncRunId, dataSourceId, videos }) {
    if (!syncRunId || !videos?.length) return;

    await this.prisma.sync_run_videos.createMany({
      data: videos.map((vimeoVideo) => ({
        sync_run_id: syncRunId,
        data_source_id: dataSourceId,
        vimeo_video_id: vimeoVideo.vimeoVideoId,
        status: sync_run_video_status.queued,
        payload: { title: vimeoVideo.title, videoUrl: vimeoVideo.videoUrl }
      })),
      skipDuplicates: true
    });
  }

  async markSyncRunVideo({
    syncRunId,
    dataSourceId,
    vimeoVideo,
    videoId = undefined,
    status,
    stage = null,
    errorMessage = null,
    incrementAttempts = false,
    startedAt = undefined,
    finishedAt = undefined
  }) {
    const data = {
      status,
      stage,
      error_message: errorMessage,
      ...(videoId !== undefined ? { video_id: videoId } : {}),
      ...(incrementAttempts ? { attempts: { increment: 1 } } : {}),
      ...(startedAt !== undefined ? { started_at: startedAt } : {}),
      ...(finishedAt !== undefined ? { finished_at: finishedAt } : {})
    };

    return this.upsertSyncRunVideo({ syncRunId, dataSourceId, vimeoVideo, data });
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
    const uniqueTags = Array.from(
      new Map(
        (vimeoVideo.tags || [])
          .map((tag) => String(tag || "").trim())
          .filter(Boolean)
          .map((tag) => [tag.toLowerCase(), tag])
      ).values()
    );
    if (uniqueTags.length) {
      await this.prisma.video_tags.createMany({
        data: uniqueTags.map((tag) => ({
          video_id: video.id,
          tag
        })),
        // Prevent race-condition failures when concurrent workers process the same video.
        skipDuplicates: true
      });
    }

    return {
      video,
      isInsert: !existing
    };
  }

  async runForDataSource({
    dataSource,
    existingSyncRunId = null,
    initiatedByUserId = null,
    trigger = sync_run_trigger.manual,
    runTypeTag = null,
    resetCursor = false,
    enableTranscript = true,
    enableEmbeddings = true,
    enableCategorization = true,
    retryOfRunId = null,
    targetVimeoVideoIds = null,
    perPage = 50,
    maxPages = 0,
    testVideoLimit = null
  }) {
    const syncRun = existingSyncRunId
      ? await this.prisma.sync_runs.update({
          where: { id: existingSyncRunId },
          data: {
            status: sync_run_status.running,
            started_at: new Date(),
            initiated_by_user_id: initiatedByUserId,
            trigger,
            notes: runTypeTag || undefined,
            retry_of_run_id: retryOfRunId
          }
        })
      : await this.createSyncRun({
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
    runLogger.info("Sync stage flags", {
      runTypeTag: runTypeTag || null,
      enableTranscript: Boolean(enableTranscript),
      enableEmbeddings: Boolean(enableEmbeddings),
      enableCategorization: Boolean(enableCategorization)
    });

    const counters = {
      scanned: 0,
      processed: 0,
      created: 0,
      updated: 0,
      failed: 0,
      transcriptsProcessed: 0,
      embeddingsCreated: 0
    };
    let progressTotalVideos = null;
    let lastProgressFlushAt = 0;
    let flushQueue = Promise.resolve();
    let vimeoClient = null;
    let transcriptService = null;
    let embeddingService = null;
    let categorizationService = null;

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
          videos_scanned: progressTotalVideos ?? counters.scanned,
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

      vimeoClient = new VimeoClient(decryptedSourceToken, runLogger);
      const openAiService = new OpenAiService({
        apiKey: runtimeAiConfig.openAiApiKey,
        embeddingModel: runtimeAiConfig.embeddingModel,
        transcriptionModel: runtimeAiConfig.transcriptionModel
      });
      transcriptService = new TranscriptService({
        prisma: this.prisma,
        vimeoClient,
        openAiService,
        logger: runLogger
      });
      embeddingService = new EmbeddingService({
        prisma: this.prisma,
        openAiService,
        logger: runLogger
      });
      categorizationService = new VideoCategorizationService({ prisma: this.prisma, logger: runLogger });

      runLogger.info("Marking source as syncing");
      await this.prisma.data_sources.update({
        where: { id: dataSource.id },
        data: { status: source_status.syncing, updated_at: new Date() }
      });

      if (!vimeoClient.isConfigured()) {
        throw new Error(`Data source ${dataSource.id} has no Vimeo access token configured.`);
      }

      const requestedMaxPages = Number(maxPages);
      const maxPageCount =
        Number.isFinite(requestedMaxPages) && requestedMaxPages > 0
          ? Math.floor(requestedMaxPages)
          : Number.POSITIVE_INFINITY;
      const normalizedPerPage = Math.max(1, Math.floor(Number(perPage) || 50));
      const configuredTestLimit = Number(env.syncTestVideoLimit);
      const requestedTestLimit = Number(testVideoLimit);
      const effectiveTestLimit =
        Number.isFinite(requestedTestLimit) && requestedTestLimit > 0
          ? Math.floor(requestedTestLimit)
          : Number.isFinite(configuredTestLimit) && configuredTestLimit > 0
          ? Math.floor(configuredTestLimit)
          : null;

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
      runLogger.info("Video processing workers configured", {
        workerCount
      });
      const targetedVimeoVideoIds = Array.isArray(targetVimeoVideoIds)
        ? Array.from(new Set(targetVimeoVideoIds.map((value) => String(value || "").trim()).filter(Boolean)))
        : [];
      const targetedVimeoVideoIdSet = new Set(targetedVimeoVideoIds);
      const remainingTargetedIds = new Set(targetedVimeoVideoIds);
      if (targetedVimeoVideoIdSet.size > 0) {
        runLogger.info("Targeted retry mode enabled", {
          targetCount: targetedVimeoVideoIdSet.size
        });
        progressTotalVideos = targetedVimeoVideoIdSet.size;
      }

      const processSingleVideo = async (vimeoVideo) => {
        await this.markSyncRunVideo({
          syncRunId: syncRun.id,
          dataSourceId: dataSource.id,
          vimeoVideo,
          status: sync_run_video_status.running,
          stage: "fetch_metadata",
          incrementAttempts: true,
          startedAt: new Date(),
          finishedAt: null
        });
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
            await this.markSyncRunVideo({
              syncRunId: syncRun.id,
              dataSourceId: dataSource.id,
              vimeoVideo,
              videoId: videoRecord.id,
              status: sync_run_video_status.running,
              stage: "upsert",
              errorMessage: null
            });
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
            await this.markSyncRunVideo({
              syncRunId: syncRun.id,
              dataSourceId: dataSource.id,
              vimeoVideo,
              status: sync_run_video_status.failed,
              stage: "upsert",
              errorMessage: error.message,
              finishedAt: new Date()
            });
          }

          if (canProcessVideo && videoRecord) {
            try {
              let transcriptResult = {
                transcriptId: null,
                chunksCount: 0,
                source: null,
                skipped: true,
                reason: "disabled_by_run_type"
              };

              if (enableTranscript) {
                await this.markSyncRunVideo({
                  syncRunId: syncRun.id,
                  dataSourceId: dataSource.id,
                  vimeoVideo,
                  videoId: videoRecord.id,
                  status: sync_run_video_status.running,
                  stage: "fetch_transcript"
                });
                runLogger.debug("Transcript processing started", {
                  videoId: videoRecord.id
                });
                transcriptResult = await transcriptService.processVideoTranscript(videoRecord);
                if (!transcriptResult.skipped) {
                  counters.transcriptsProcessed += 1;
                }
                runLogger.info("Transcript processing completed", {
                  videoId: videoRecord.id,
                  source: transcriptResult.source,
                  skipped: transcriptResult.skipped,
                  chunksCount: transcriptResult.chunksCount || 0
                });
              }

              const tags = vimeoVideo.tags || [];
              if (enableEmbeddings) {
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
                  await this.markSyncRunVideo({
                    syncRunId: syncRun.id,
                    dataSourceId: dataSource.id,
                    vimeoVideo,
                    videoId: videoRecord.id,
                    status: sync_run_video_status.running,
                    stage: "embed"
                  });
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
              }

              if (enableCategorization) {
                const activeTranscript = await this.prisma.transcripts.findFirst({
                  where: {
                    video_id: videoRecord.id,
                    is_active: true,
                    status: "complete"
                  },
                  select: { raw_text: true },
                  orderBy: [{ version: "desc" }, { updated_at: "desc" }]
                });
                await this.markSyncRunVideo({
                  syncRunId: syncRun.id,
                  dataSourceId: dataSource.id,
                  vimeoVideo,
                  videoId: videoRecord.id,
                  status: sync_run_video_status.running,
                  stage: "categorize"
                });
                await categorizationService.categorizeVideo({
                  videoId: videoRecord.id,
                  title: videoRecord.title,
                  description: videoRecord.description,
                  folderName: videoRecord.folder_name,
                  tags,
                  transcriptText: activeTranscript?.raw_text || ""
                });
              }
              runLogger.info("Video processing completed", {
                videoId: videoRecord.id,
                vimeoVideoId: vimeoVideo.vimeoVideoId
              });
              await this.markSyncRunVideo({
                syncRunId: syncRun.id,
                dataSourceId: dataSource.id,
                vimeoVideo,
                videoId: videoRecord.id,
                status: sync_run_video_status.success,
                stage: "categorize",
                errorMessage: null,
                finishedAt: new Date()
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
              await this.markSyncRunVideo({
                syncRunId: syncRun.id,
                dataSourceId: dataSource.id,
                vimeoVideo,
                videoId: videoRecord?.id || undefined,
                status: sync_run_video_status.failed,
                stage: "fetch_transcript",
                errorMessage: error.message,
                finishedAt: new Date()
              });
            }
          }
        } finally {
          counters.processed += 1;
          await queueRunProgressFlush();
          const progressTotal = progressTotalVideos ?? counters.scanned;
          const progressRemaining = Math.max(progressTotal - counters.processed, 0);
          runLogger.info("Sync run progress updated", {
            processed: counters.processed,
            total: progressTotal,
            remaining: progressRemaining,
            created: counters.created,
            updated: counters.updated,
            failed: counters.failed
          });
        }
      };

      const processVideoBatch = async ({ videos, page }) => {
        if (!videos.length) return;
        let nextVideoIndex = 0;
        const workers = Array.from({ length: Math.min(workerCount, videos.length) }, (_, workerIndex) =>
          (async () => {
            while (true) {
              const currentIndex = nextVideoIndex;
              nextVideoIndex += 1;
              if (currentIndex >= videos.length) return;
              const vimeoVideo = videos[currentIndex];
              runLogger.debug("Worker picked video", {
                workerIndex: workerIndex + 1,
                page,
                queueIndex: currentIndex + 1,
                queueLength: videos.length,
                vimeoVideoId: vimeoVideo.vimeoVideoId
              });
              await processSingleVideo(vimeoVideo);
            }
          })()
        );
        await Promise.all(workers);
      };

      const resumeEnabled =
        env.syncResumeEnabled &&
        targetedVimeoVideoIdSet.size === 0 &&
        !resetCursor &&
        Number.isFinite(Number(dataSource.sync_cursor_page)) &&
        Number(dataSource.sync_cursor_page) > 0;
      const resumeStartPage = resumeEnabled ? Math.floor(Number(dataSource.sync_cursor_page)) : 1;
      let resumeGuardVimeoId = resumeEnabled ? String(dataSource.sync_cursor_vimeo_id || "").trim() : "";
      if (resumeEnabled) {
        runLogger.info("Resuming sync from cursor", {
          startPage: resumeStartPage,
          lastVimeoVideoId: resumeGuardVimeoId || null,
          cursorUpdatedAt: dataSource.sync_cursor_updated_at || null
        });
      }

      let currentPage = resumeStartPage;
      let pagesFetched = 0;
      let hasMore = true;
      let remainingTestLimit = effectiveTestLimit;

      if (targetedVimeoVideoIdSet.size > 0) {
        const targetedVideos = [];
        for (const targetVimeoVideoId of targetedVimeoVideoIds) {
          try {
            const video = await vimeoClient.getVideoById(targetVimeoVideoId);
            targetedVideos.push(video);
            remainingTargetedIds.delete(String(video?.vimeoVideoId || "").trim());
          } catch (error) {
            counters.failed += 1;
            await this.recordSyncError({
              syncRunId: syncRun.id,
              dataSourceId: dataSource.id,
              stage: "fetch_metadata",
              error,
              payload: { vimeoVideoId: targetVimeoVideoId, targetedRetry: true }
            });
          }
        }

        await this.queueSyncRunVideos({
          syncRunId: syncRun.id,
          dataSourceId: dataSource.id,
          videos: targetedVideos
        });
        counters.scanned += targetedVideos.length;
        await queueRunProgressFlush({ force: true });
        await processVideoBatch({ videos: targetedVideos, page: 1 });
        hasMore = false;
      }

      while (targetedVimeoVideoIdSet.size === 0 && hasMore && pagesFetched < maxPageCount) {
        const pageResult = await vimeoClient.listVideosPage({ page: currentPage, perPage });
        const fetchedVideos = pageResult.videos;
        let videosToProcess =
          targetedVimeoVideoIdSet.size > 0
            ? fetchedVideos.filter((video) => targetedVimeoVideoIdSet.has(String(video?.vimeoVideoId || "").trim()))
            : fetchedVideos;

        if (resumeGuardVimeoId && currentPage === resumeStartPage) {
          const cursorIndex = videosToProcess.findIndex((video) => video.vimeoVideoId === resumeGuardVimeoId);
          if (cursorIndex >= 0) {
            videosToProcess = videosToProcess.slice(cursorIndex + 1);
            runLogger.info("Applied cursor guard on resumed page", {
              page: currentPage,
              cursorVimeoVideoId: resumeGuardVimeoId,
              skipped: cursorIndex + 1,
              remaining: videosToProcess.length
            });
          } else {
            runLogger.warn("Cursor Vimeo video id not found on resumed page", {
              page: currentPage,
              cursorVimeoVideoId: resumeGuardVimeoId
            });
          }
          resumeGuardVimeoId = "";
        }

        if (progressTotalVideos === null && Number.isFinite(pageResult.totalCount)) {
          const progressCaps = [pageResult.totalCount];
          if (effectiveTestLimit) {
            progressCaps.push(effectiveTestLimit);
          }
          if (Number.isFinite(maxPageCount)) {
            progressCaps.push(maxPageCount * normalizedPerPage);
          }
          progressTotalVideos = Math.min(...progressCaps);
          runLogger.info("Detected Vimeo total video count for progress", {
            totalFromApi: pageResult.totalCount,
            progressTotalVideos
          });
        }

        if (remainingTestLimit !== null) {
          if (remainingTestLimit <= 0) break;
          if (videosToProcess.length > remainingTestLimit) {
            videosToProcess = videosToProcess.slice(0, remainingTestLimit);
            runLogger.warn("Test video limit applied to page", {
              page: currentPage,
              fetched: fetchedVideos.length,
              processing: videosToProcess.length,
              remainingBeforePage: remainingTestLimit,
              testVideoLimit: effectiveTestLimit
            });
          }
          remainingTestLimit -= videosToProcess.length;
        }

        await this.queueSyncRunVideos({
          syncRunId: syncRun.id,
          dataSourceId: dataSource.id,
          videos: videosToProcess
        });
        counters.scanned += videosToProcess.length;
        runLogger.info("Fetched page queued for immediate processing", {
          page: currentPage,
          fetched: fetchedVideos.length,
          processing: videosToProcess.length,
          scannedSoFar: counters.scanned,
          progressTotalVideos: progressTotalVideos ?? null
        });
        await queueRunProgressFlush({ force: true });

        await processVideoBatch({ videos: videosToProcess, page: currentPage });
        for (const processedVideo of videosToProcess) {
          remainingTargetedIds.delete(String(processedVideo?.vimeoVideoId || "").trim());
        }

        if (videosToProcess.length > 0) {
          const lastProcessedVideo = videosToProcess[videosToProcess.length - 1];
          await this.prisma.data_sources.update({
            where: { id: dataSource.id },
            data: {
              sync_cursor_page: currentPage,
              sync_cursor_vimeo_id: lastProcessedVideo.vimeoVideoId,
              sync_cursor_published_at: toDateOrNull(lastProcessedVideo.publishedAt),
              sync_cursor_updated_at: new Date()
            }
          });
        }

        pagesFetched += 1;
        hasMore = pageResult.hasMore && (targetedVimeoVideoIdSet.size === 0 || remainingTargetedIds.size > 0);
        currentPage += 1;
      }

      runLogger.info("Completed paged fetch and processing", {
        pagesFetched,
        hasMore,
        testVideoLimit: effectiveTestLimit,
        scanned: counters.scanned,
        processed: counters.processed
      });

      if (targetedVimeoVideoIdSet.size > 0 && remainingTargetedIds.size > 0) {
        counters.failed += remainingTargetedIds.size;
        const missingIds = Array.from(remainingTargetedIds);
        for (const missingVimeoVideoId of missingIds) {
          await this.recordSyncError({
            syncRunId: syncRun.id,
            dataSourceId: dataSource.id,
            stage: "fetch_metadata",
            error: new Error(`Targeted retry could not find Vimeo video ${missingVimeoVideoId}`),
            payload: { vimeoVideoId: missingVimeoVideoId, targetedRetry: true }
          });
        }
        runLogger.warn("Targeted retry could not find all requested videos", {
          missingCount: missingIds.length,
          missingVimeoVideoIds: missingIds
        });
      }

      await queueRunProgressFlush({ force: true });
      await this.prisma.sync_runs.update({
        where: { id: syncRun.id },
        data: {
          status: counters.failed > 0 ? sync_run_status.partial : sync_run_status.success,
          finished_at: new Date(),
          videos_scanned: progressTotalVideos ?? counters.scanned,
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
          videos_scanned: progressTotalVideos ?? counters.scanned,
          videos_deleted: counters.processed,
          videos_created: counters.created,
          videos_updated: counters.updated,
          transcripts_processed: counters.transcriptsProcessed,
          embeddings_created: counters.embeddingsCreated,
          error_count: counters.failed + 1,
          // Preserve run-type tag in notes for reporting; detailed failure is stored in sync_errors.
          notes: syncRun.notes || null
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

  async runEnrichmentForSyncRun({
    dataSource,
    existingSyncRunId,
    parentSyncRunId,
    initiatedByUserId = null,
    trigger = sync_run_trigger.manual,
    runTypeTag = "enrichment_async",
    enableTranscript = true,
    enableEmbeddings = true,
    enableCategorization = true
  }) {
    if (!parentSyncRunId) {
      throw new Error("parentSyncRunId is required for enrich_from_run mode.");
    }

    const syncRun = await this.prisma.sync_runs.update({
      where: { id: existingSyncRunId },
      data: {
        status: sync_run_status.running,
        started_at: new Date(),
        initiated_by_user_id: initiatedByUserId,
        trigger,
        notes: runTypeTag || "enrichment_async"
      }
    });
    const runLogger = this.logger.child?.({
      syncRunId: syncRun.id,
      dataSourceId: dataSource.id,
      dataSourceName: dataSource.name
    }) || this.logger;

    const counters = {
      scanned: 0,
      processed: 0,
      created: 0,
      updated: 0,
      failed: 0,
      transcriptsProcessed: 0,
      embeddingsCreated: 0
    };

    try {
      const aiConfigService = new AdminAiConfigService({ prisma: this.prisma });
      const runtimeAiConfig = await aiConfigService.getRuntimeConfig();
      const decryptedSourceToken = dataSource.access_token_encrypted ? decryptSecret(dataSource.access_token_encrypted) : null;
      if (!decryptedSourceToken) {
        throw new Error(`Source "${dataSource.name}" has no Vimeo access token saved.`);
      }

      const vimeoClient = new VimeoClient(decryptedSourceToken, runLogger);
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

      const parentRunVideos = await this.prisma.sync_run_videos.findMany({
        where: { sync_run_id: parentSyncRunId },
        select: {
          vimeo_video_id: true,
          payload: true
        }
      });
      counters.scanned = parentRunVideos.length;

      const enrichmentVideos = parentRunVideos.map((row) => ({
        vimeoVideoId: row.vimeo_video_id,
        title: row.payload?.title || `Vimeo Video ${row.vimeo_video_id}`,
        videoUrl: row.payload?.videoUrl || `https://vimeo.com/${row.vimeo_video_id}`,
        tags: []
      }));

      await this.queueSyncRunVideos({
        syncRunId: syncRun.id,
        dataSourceId: dataSource.id,
        videos: enrichmentVideos
      });

      for (const vimeoVideo of enrichmentVideos) {
        let videoRecord = null;
        try {
          await this.markSyncRunVideo({
            syncRunId: syncRun.id,
            dataSourceId: dataSource.id,
            vimeoVideo,
            status: sync_run_video_status.running,
            stage: "fetch_transcript",
            incrementAttempts: true,
            startedAt: new Date(),
            finishedAt: null
          });

          videoRecord = await this.prisma.videos.findUnique({
            where: { vimeo_video_id: vimeoVideo.vimeoVideoId }
          });
          if (!videoRecord) {
            throw new Error(`Video not found in DB for Vimeo ID ${vimeoVideo.vimeoVideoId}`);
          }
          const tagRows = await this.prisma.video_tags.findMany({
            where: { video_id: videoRecord.id },
            select: { tag: true }
          });
          const tags = tagRows.map((row) => row.tag).filter(Boolean);

          let transcriptResult = { transcriptId: null, skipped: true };
          if (enableTranscript) {
            transcriptResult = await transcriptService.processVideoTranscript(videoRecord);
            if (!transcriptResult.skipped) counters.transcriptsProcessed += 1;
          }

          if (enableEmbeddings) {
            const summary = buildVideoSummary({ video: videoRecord, tags });
            const metadataEmbedding = await embeddingService.embedVideo({
              videoId: videoRecord.id,
              summaryText: summary
            });
            if (!metadataEmbedding.skipped) counters.embeddingsCreated += 1;

            if (transcriptResult.transcriptId) {
              const chunkEmbedding = await embeddingService.embedTranscriptChunks({
                transcriptId: transcriptResult.transcriptId
              });
              if (!chunkEmbedding.skipped) counters.embeddingsCreated += chunkEmbedding.embedded;
            }
          }

          if (enableCategorization) {
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
          }

          await this.markSyncRunVideo({
            syncRunId: syncRun.id,
            dataSourceId: dataSource.id,
            vimeoVideo,
            videoId: videoRecord.id,
            status: sync_run_video_status.success,
            stage: "categorize",
            errorMessage: null,
            finishedAt: new Date()
          });
        } catch (error) {
          counters.failed += 1;
          await this.recordSyncError({
            syncRunId: syncRun.id,
            dataSourceId: dataSource.id,
            videoId: videoRecord?.id || null,
            stage: "fetch_transcript",
            error,
            payload: { vimeoVideoId: vimeoVideo.vimeoVideoId, parentSyncRunId }
          });
          await this.markSyncRunVideo({
            syncRunId: syncRun.id,
            dataSourceId: dataSource.id,
            vimeoVideo,
            videoId: videoRecord?.id || undefined,
            status: sync_run_video_status.failed,
            stage: "fetch_transcript",
            errorMessage: error.message,
            finishedAt: new Date()
          });
        } finally {
          counters.processed += 1;
        }
      }

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

      return {
        syncRunId: syncRun.id,
        status: counters.failed > 0 ? "partial" : "success",
        logFilePath: runLogger.filePath,
        counters
      };
    } catch (error) {
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
          notes: syncRun.notes || "enrichment_async"
        }
      });
      throw error;
    }
  }
}
