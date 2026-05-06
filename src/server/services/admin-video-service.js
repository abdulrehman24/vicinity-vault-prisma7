import { decryptSecret } from "../security/secrets";
import { VimeoClient } from "./vimeo-client";
import { OpenAiService } from "./openai-service";
import { EmbeddingService } from "./embedding-service";
import { AdminAiConfigService } from "./admin-ai-config-service";
import { createSyncLogger } from "../logging/sync-logger";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const PRIVACY_ALLOWLIST = new Set(["anybody", "contacts", "nobody", "password", "unlisted", "users"]);

const asText = (value, max = 2000) => String(value || "").trim().slice(0, max);
const asOptionalText = (value, max = 2000) => {
  if (typeof value !== "string") return undefined;
  return asText(value, max);
};
const normalizeTag = (value) =>
  String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 80);

const buildSummaryText = ({ video, tags }) =>
  [
    `Title: ${video.title || ""}`,
    `Description: ${video.description || ""}`,
    `Folder: ${video.folder_name || ""}`,
    `Tags: ${(tags || []).join(", ")}`,
    `Privacy: ${video.privacy_view || ""}`
  ]
    .join("\n")
    .trim();

const mergeMetadata = (metadata, patch = {}) => ({
  ...(metadata || {}),
  ...patch
});

export class AdminVideoService {
  constructor({ prisma, logger = null }) {
    this.prisma = prisma;
    this.logger = logger || createSyncLogger({ service: "admin-videos" });
  }

  async listVideos({
    page = 1,
    limit = DEFAULT_PAGE_SIZE,
    search = "",
    folder = "",
    sourceId = ""
  } = {}) {
    const safeLimit = Math.max(1, Math.min(MAX_PAGE_SIZE, Number(limit) || DEFAULT_PAGE_SIZE));
    const safePage = Math.max(1, Number(page) || 1);
    const skip = (safePage - 1) * safeLimit;
    const normalizedSearch = String(search || "").trim();
    const normalizedFolder = String(folder || "").trim();
    const normalizedSourceId = String(sourceId || "").trim();

    const where = {
      ...(normalizedSourceId ? { data_source_id: normalizedSourceId } : {}),
      ...(normalizedFolder ? { folder_name: { equals: normalizedFolder, mode: "insensitive" } } : {}),
      ...(normalizedSearch
        ? {
            OR: [
              { title: { contains: normalizedSearch, mode: "insensitive" } },
              { vimeo_video_id: { contains: normalizedSearch, mode: "insensitive" } },
              { video_tags: { some: { tag: { contains: normalizedSearch, mode: "insensitive" } } } }
            ]
          }
        : {})
    };

    const [items, total, folders, sources] = await Promise.all([
      this.prisma.videos.findMany({
        where,
        skip,
        take: safeLimit,
        orderBy: [{ updated_at: "desc" }],
        include: {
          data_source: { select: { id: true, name: true } },
          video_tags: { select: { tag: true }, orderBy: { tag: "asc" } },
          sync_run_videos: {
            select: { status: true, updated_at: true },
            orderBy: { updated_at: "desc" },
            take: 1
          }
        }
      }),
      this.prisma.videos.count({ where }),
      this.prisma.videos.findMany({
        where: { folder_name: { not: null } },
        distinct: ["folder_name"],
        select: { folder_name: true },
        orderBy: { folder_name: "asc" }
      }),
      this.prisma.data_sources.findMany({
        select: { id: true, name: true },
        orderBy: { name: "asc" }
      })
    ]);

    return {
      items: items.map((video) => this.toVideoDto(video)),
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.max(1, Math.ceil(total / safeLimit))
      },
      filters: {
        folders: folders.map((row) => row.folder_name).filter(Boolean),
        sources
      }
    };
  }

  async getVideoById(id) {
    const video = await this.prisma.videos.findUnique({
      where: { id },
      include: {
        data_source: true,
        video_tags: { select: { tag: true }, orderBy: { tag: "asc" } },
        sync_run_videos: {
          select: { status: true, updated_at: true },
          orderBy: { updated_at: "desc" },
          take: 1
        }
      }
    });
    if (!video) throw new Error("Video not found.");
    return this.toVideoDto(video, { includeSourceSecretInfo: true });
  }

  toVideoDto(video, { includeSourceSecretInfo = false } = {}) {
    const latestSync = video.sync_run_videos?.[0] || null;
    const metadata = video.metadata_json || {};
    return {
      id: video.id,
      vimeoVideoId: video.vimeo_video_id,
      vimeoUri: video.vimeo_uri,
      title: video.title,
      description: video.description,
      durationSeconds: video.duration_seconds,
      thumbnailUrl: video.thumbnail_url,
      videoUrl: video.video_url,
      folderName: video.folder_name,
      privacyView: video.privacy_view,
      publishedAt: video.published_at,
      syncedAt: video.synced_at,
      updatedAt: video.updated_at,
      status: video.status,
      tags: (video.video_tags || []).map((row) => row.tag),
      metadata,
      syncStatus: latestSync?.status || "unknown",
      source: video.data_source
        ? {
            id: video.data_source.id,
            name: video.data_source.name,
            ...(includeSourceSecretInfo
              ? {
                  hasAccessToken: Boolean(video.data_source.access_token_encrypted)
                }
              : {})
          }
        : null,
      editable: {
        vimeoSynced: ["title", "description", "tags"],
        localOnly: ["internalNotes", "classificationOverride", "searchKeywords", "manualCategoryOverride"]
      }
    };
  }

  validatePatchInput(input = {}) {
    if (!input || typeof input !== "object") throw new Error("Invalid payload.");
    const vimeo = input.vimeo || {};
    const localOnly = input.localOnly || {};
    const keys = Object.keys(vimeo);
    const allowedVimeoKeys = new Set(["title", "description", "tags", "privacyView"]);
    for (const key of keys) {
      if (!allowedVimeoKeys.has(key)) throw new Error(`Unsupported Vimeo field: ${key}`);
    }
    if (typeof vimeo.privacyView === "string" && !PRIVACY_ALLOWLIST.has(vimeo.privacyView)) {
      throw new Error("Unsupported privacy view value.");
    }
    if (vimeo.tags && !Array.isArray(vimeo.tags)) throw new Error("tags must be an array.");

    return {
      vimeo: {
        ...(typeof vimeo.title === "string" ? { title: asText(vimeo.title, 500) } : {}),
        ...(typeof vimeo.description === "string" ? { description: asText(vimeo.description, 5000) } : {}),
        ...(Array.isArray(vimeo.tags)
          ? { tags: Array.from(new Set(vimeo.tags.map(normalizeTag).filter(Boolean))).slice(0, 50) }
          : {}),
        ...(typeof vimeo.privacyView === "string" ? { privacyView: vimeo.privacyView } : {})
      },
      localOnly: {
        ...(asOptionalText(localOnly.internalNotes, 2000) !== undefined
          ? { internalNotes: asOptionalText(localOnly.internalNotes, 2000) }
          : {}),
        ...(asOptionalText(localOnly.classificationOverride, 200) !== undefined
          ? { classificationOverride: asOptionalText(localOnly.classificationOverride, 200) }
          : {}),
        ...(Array.isArray(localOnly.searchKeywords)
          ? {
              searchKeywords: Array.from(new Set(localOnly.searchKeywords.map((item) => asText(item, 80)).filter(Boolean))).slice(
                0,
                50
              )
            }
          : {}),
        ...(asOptionalText(localOnly.manualCategoryOverride, 200) !== undefined
          ? { manualCategoryOverride: asOptionalText(localOnly.manualCategoryOverride, 200) }
          : {})
      }
    };
  }

  async updateVideo({ id, input, adminUserId = null }) {
    const parsed = this.validatePatchInput(input);
    const video = await this.prisma.videos.findUnique({
      where: { id },
      include: {
        data_source: true,
        video_tags: { select: { tag: true } },
        transcripts: {
          where: { is_active: true, status: "complete" },
          orderBy: [{ version: "desc" }, { updated_at: "desc" }],
          take: 1,
          select: { raw_text: true }
        }
      }
    });
    if (!video) throw new Error("Video not found.");

    const log = this.logger.child?.({
      syncMode: "admin_update",
      videoId: video.id,
      vimeoVideoId: video.vimeo_video_id,
      videoTitle: video.title,
      adminUserId
    }) || this.logger;
    log.info("Admin video update started", {
      changedFields: Object.keys(parsed.vimeo),
      localOnlyFields: Object.keys(parsed.localOnly)
    });

    const token = decryptSecret(video.data_source?.access_token_encrypted);
    if (!token) throw new Error(`Source "${video.data_source?.name || "Unknown"}" has no valid Vimeo token.`);
    const client = new VimeoClient(token, log);

    const changedVimeo = parsed.vimeo;
    let tagsResult = null;

    try {
      if (Object.prototype.hasOwnProperty.call(changedVimeo, "title") || Object.prototype.hasOwnProperty.call(changedVimeo, "description")) {
        await client.updateVideoMetadata(video.vimeo_video_id, {
          title: changedVimeo.title,
          description: changedVimeo.description
        });
        log.info("Vimeo title/description update succeeded");
      }

      if (Object.prototype.hasOwnProperty.call(changedVimeo, "tags")) {
        tagsResult = await client.replaceVideoTags(video.vimeo_video_id, changedVimeo.tags || []);
        log.info("Vimeo tags replace succeeded", {
          added: tagsResult?.added || [],
          removed: tagsResult?.removed || []
        });
      }
    } catch (error) {
      log.logError?.("Vimeo update failed", error, {
        changedFields: Object.keys(changedVimeo)
      });
      throw error;
    }

    const now = new Date();
    const nextTags = Object.prototype.hasOwnProperty.call(changedVimeo, "tags")
      ? changedVimeo.tags
      : video.video_tags.map((item) => item.tag);

    const nextMetadata = mergeMetadata(video.metadata_json || {}, {
      raw: mergeMetadata(video.metadata_json?.raw || {}, {
        ...(Object.prototype.hasOwnProperty.call(changedVimeo, "title") ? { name: changedVimeo.title } : {}),
        ...(Object.prototype.hasOwnProperty.call(changedVimeo, "description") ? { description: changedVimeo.description } : {})
      }),
      ...(Object.keys(parsed.localOnly).length
        ? {
            adminLocal: mergeMetadata(video.metadata_json?.adminLocal || {}, parsed.localOnly)
          }
        : {}),
      updated_from_admin: true,
      last_vimeo_metadata_push_at: now.toISOString(),
      last_vimeo_metadata_push_result: {
        ok: true,
        changedFields: Object.keys(changedVimeo),
        tagSync: tagsResult
          ? { added: tagsResult.added || [], removed: tagsResult.removed || [], finalTags: tagsResult.finalTags || [] }
          : null
      }
    });

    let updatedVideo = null;
    let embeddingWarning = null;
    try {
      await this.prisma.$transaction(async (tx) => {
        updatedVideo = await tx.videos.update({
          where: { id: video.id },
          data: {
            ...(Object.prototype.hasOwnProperty.call(changedVimeo, "title") ? { title: changedVimeo.title } : {}),
            ...(Object.prototype.hasOwnProperty.call(changedVimeo, "description") ? { description: changedVimeo.description } : {}),
            ...(Object.prototype.hasOwnProperty.call(changedVimeo, "privacyView") ? { privacy_view: changedVimeo.privacyView } : {}),
            metadata_json: nextMetadata,
            updated_at: now
          }
        });

        if (Object.prototype.hasOwnProperty.call(changedVimeo, "tags")) {
          await tx.video_tags.deleteMany({ where: { video_id: video.id } });
          if (nextTags.length) {
            await tx.video_tags.createMany({
              data: nextTags.map((tag) => ({ video_id: video.id, tag })),
              skipDuplicates: true
            });
          }
        }
      });
      log.info("Local DB update succeeded");
    } catch (error) {
      log.logError?.("Local DB update failed after Vimeo success", error, {
        vimeoUpdated: true
      });
      throw new Error(`Vimeo updated, but local DB update failed: ${error.message}`);
    }

    try {
      const runtimeAi = await new AdminAiConfigService({ prisma: this.prisma }).getRuntimeConfig();
      const openAi = new OpenAiService({
        apiKey: runtimeAi.openAiApiKey,
        embeddingModel: runtimeAi.embeddingModel,
        transcriptionModel: runtimeAi.transcriptionModel
      });
      const embeddingService = new EmbeddingService({
        prisma: this.prisma,
        openAiService: openAi,
        logger: log
      });
      const summaryText = buildSummaryText({ video: updatedVideo, tags: nextTags });
      await embeddingService.embedVideo({
        videoId: video.id,
        summaryText
      });
      log.info("Embedding rebuild succeeded", { embeddingTextLength: summaryText.length });
    } catch (error) {
      embeddingWarning = error.message;
      log.logError?.("Embedding rebuild failed after metadata update", error);
    }

    const refreshed = await this.getVideoById(video.id);
    log.info("Admin video update finished", {
      success: true,
      embeddingWarning: embeddingWarning || null
    });
    return {
      video: refreshed,
      warnings: embeddingWarning ? [{ type: "embedding", message: embeddingWarning }] : []
    };
  }

  async rebuildVideoEmbedding({ id, adminUserId = null }) {
    const video = await this.prisma.videos.findUnique({
      where: { id },
      include: {
        video_tags: { select: { tag: true } }
      }
    });
    if (!video) throw new Error("Video not found.");
    const tags = video.video_tags.map((item) => item.tag).filter(Boolean);
    const summaryText = buildSummaryText({ video, tags });
    const log = this.logger.child?.({
      syncMode: "admin_rebuild_embedding",
      videoId: video.id,
      vimeoVideoId: video.vimeo_video_id,
      videoTitle: video.title,
      adminUserId
    }) || this.logger;
    const runtimeAi = await new AdminAiConfigService({ prisma: this.prisma }).getRuntimeConfig();
    const openAi = new OpenAiService({
      apiKey: runtimeAi.openAiApiKey,
      embeddingModel: runtimeAi.embeddingModel,
      transcriptionModel: runtimeAi.transcriptionModel
    });
    const embeddingService = new EmbeddingService({
      prisma: this.prisma,
      openAiService: openAi,
      logger: log
    });
    await embeddingService.embedVideo({
      videoId: video.id,
      summaryText
    });
    log.info("Manual video embedding rebuild succeeded", {
      embeddingTextLength: summaryText.length
    });
    return { ok: true };
  }
}
