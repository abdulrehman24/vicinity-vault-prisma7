import { source_platform, source_status, sync_error_status, sync_run_status, sync_run_trigger } from "@prisma/client";
import { OpenAiService } from "./openai-service";
import { EmbeddingService } from "./embedding-service";
import { VideoSyncService } from "./video-sync-service";
import { AdminAiConfigService } from "./admin-ai-config-service";

const buildVideoSummary = ({ video, tags }) =>
  [
    `Title: ${video.title || ""}`,
    `Description: ${video.description || ""}`,
    `Folder: ${video.folder_name || ""}`,
    `Tags: ${(tags || []).join(", ")}`
  ]
    .join("\n")
    .trim();

export class AdminOperationsService {
  constructor({ prisma, logger = console }) {
    this.prisma = prisma;
    this.logger = logger;
  }

  async truncateOperationalData() {
    await this.prisma.$executeRawUnsafe(`
      DO $$
      DECLARE
        tables_to_truncate text;
      BEGIN
        SELECT string_agg(format('%I.%I', schemaname, tablename), ', ' ORDER BY tablename)
        INTO tables_to_truncate
        FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename NOT IN ('_prisma_migrations','ai_configs','data_sources','users');

        IF tables_to_truncate IS NOT NULL THEN
          EXECUTE 'TRUNCATE TABLE ' || tables_to_truncate || ' RESTART IDENTITY CASCADE';
        END IF;
      END $$;
    `);

    const resetAt = new Date();
    const resetResult = await this.prisma.data_sources.updateMany({
      where: {
        status: {
          not: source_status.disabled
        }
      },
      data: {
        status: source_status.connected,
        updated_at: resetAt
      }
    });

    return {
      status: "success",
      message:
        "Operational tables truncated. Preserved: _prisma_migrations, ai_configs, data_sources, users. Source statuses reset to connected.",
      sourcesResetToConnected: resetResult.count
    };
  }

  async retrySyncRun({ syncRunId, initiatedByUserId = null, perPage = 50, maxPages = 0, testVideoLimit = null }) {
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

    await this.prisma.$executeRawUnsafe(
      `
      UPDATE "sync_errors"
      SET
        "status" = 'retrying'::"sync_error_status",
        "retry_count" = "retry_count" + 1,
        "next_retry_at" = NULL,
        "updated_at" = now()
      WHERE "sync_run_id" = $1::uuid AND "status" = 'open'::"sync_error_status";
      `,
      existingRun.id
    );

    const syncService = new VideoSyncService({ prisma: this.prisma, logger: this.logger });
    const result = await syncService.runSync({
      dataSourceId: existingRun.data_source_id,
      initiatedByUserId,
      trigger: sync_run_trigger.retry,
      perPage,
      maxPages,
      testVideoLimit,
      retryOfRunId: existingRun.id
    });

    const retryFailed = result?.status === "partial" || result?.results?.some((item) => item.status === "failed");
    if (!retryFailed) {
      await this.prisma.sync_errors.updateMany({
        where: {
          sync_run_id: existingRun.id,
          status: { in: [sync_error_status.open, sync_error_status.retrying] }
        },
        data: {
          status: sync_error_status.resolved,
          resolved_at: new Date(),
          updated_at: new Date()
        }
      });
    } else {
      await this.prisma.sync_errors.updateMany({
        where: {
          sync_run_id: existingRun.id,
          status: sync_error_status.retrying
        },
        data: {
          status: sync_error_status.open,
          updated_at: new Date()
        }
      });
    }

    return result;
  }

  async rebuildEmbeddings({ dataSourceId = null, initiatedByUserId = null }) {
    const aiConfigService = new AdminAiConfigService({ prisma: this.prisma });
    const runtimeAiConfig = await aiConfigService.getRuntimeConfig();
    const openAiService = new OpenAiService({
      apiKey: runtimeAiConfig.openAiApiKey,
      embeddingModel: runtimeAiConfig.embeddingModel,
      transcriptionModel: runtimeAiConfig.transcriptionModel
    });
    const embeddingService = new EmbeddingService({
      prisma: this.prisma,
      openAiService,
      logger: this.logger
    });

    if (!openAiService.isConfigured()) {
      return {
        status: "skipped",
        reason: "OpenAI API key is not configured. Set the key in Admin > AI Config.",
        results: []
      };
    }

    const dataSources = await this.prisma.data_sources.findMany({
      where: {
        platform: source_platform.vimeo,
        status: { not: source_status.disabled },
        ...(dataSourceId ? { id: dataSourceId } : {})
      },
      select: { id: true, name: true }
    });

    if (!dataSources.length) {
      return {
        status: "skipped",
        reason: "No active Vimeo data sources found for embedding rebuild.",
        results: []
      };
    }

    const results = [];
    for (const source of dataSources) {
      const run = await this.prisma.sync_runs.create({
        data: {
          data_source_id: source.id,
          initiated_by_user_id: initiatedByUserId,
          trigger: sync_run_trigger.manual,
          status: sync_run_status.running,
          started_at: new Date(),
          notes: "embedding_rebuild"
        }
      });

      const counters = {
        scanned: 0,
        embeddingsCreated: 0,
        failed: 0
      };

      try {
        const videos = await this.prisma.videos.findMany({
          where: {
            data_source_id: source.id,
            status: "active"
          },
          select: {
            id: true,
            title: true,
            description: true,
            folder_name: true,
            video_tags: { select: { tag: true } },
            transcripts: {
              where: { is_active: true, status: "complete" },
              orderBy: [{ version: "desc" }, { updated_at: "desc" }],
              take: 1,
              select: { id: true }
            }
          }
        });

        counters.scanned = videos.length;

        for (const video of videos) {
          try {
            const summary = buildVideoSummary({
              video,
              tags: (video.video_tags || []).map((item) => item.tag)
            });
            const metaResult = await embeddingService.embedVideo({
              videoId: video.id,
              summaryText: summary
            });
            if (!metaResult.skipped) {
              counters.embeddingsCreated += 1;
            }

            const activeTranscript = video.transcripts?.[0];
            if (activeTranscript?.id) {
              const chunkResult = await embeddingService.embedTranscriptChunks({
                transcriptId: activeTranscript.id
              });
              if (!chunkResult.skipped) {
                counters.embeddingsCreated += chunkResult.embedded;
              }
            }
          } catch (error) {
            counters.failed += 1;
            await this.prisma.sync_errors.create({
              data: {
                sync_run_id: run.id,
                data_source_id: source.id,
                video_id: video.id,
                stage: "embed",
                status: sync_error_status.open,
                error_message: error.message || "Embedding rebuild failed",
                payload: { operation: "embedding_rebuild" }
              }
            });
          }
        }

        await this.prisma.sync_runs.update({
          where: { id: run.id },
          data: {
            status: counters.failed > 0 ? sync_run_status.partial : sync_run_status.success,
            finished_at: new Date(),
            videos_scanned: counters.scanned,
            embeddings_created: counters.embeddingsCreated,
            error_count: counters.failed
          }
        });

        results.push({
          dataSourceId: source.id,
          sourceName: source.name,
          status: counters.failed > 0 ? "partial" : "success",
          counters
        });
      } catch (error) {
        await this.prisma.sync_runs.update({
          where: { id: run.id },
          data: {
            status: sync_run_status.failed,
            finished_at: new Date(),
            videos_scanned: counters.scanned,
            embeddings_created: counters.embeddingsCreated,
            error_count: counters.failed + 1,
            notes: error.message
          }
        });

        await this.prisma.sync_errors.create({
          data: {
            sync_run_id: run.id,
            data_source_id: source.id,
            stage: "embed",
            status: sync_error_status.open,
            error_message: error.message || "Embedding rebuild failed",
            payload: { operation: "embedding_rebuild" }
          }
        });

        results.push({
          dataSourceId: source.id,
          sourceName: source.name,
          status: "failed",
          error: error.message,
          counters
        });
      }
    }

    return {
      status: results.every((item) => item.status === "success") ? "success" : "partial",
      results
    };
  }
}
