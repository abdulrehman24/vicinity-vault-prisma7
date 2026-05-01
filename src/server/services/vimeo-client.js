import { env } from "../config/env";

const VIMEO_API_BASE = "https://api.vimeo.com";
const SERVICE_UNAVAILABLE_STATUS = 503;
const INITIAL_503_RETRY_MS = 30_000;
const FOLLOWUP_503_RETRY_MS = 60_000;
const MAX_503_RETRIES = 6;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const parseRetryAfterToMs = (headerValue) => {
  if (!headerValue) return null;
  const numeric = Number(headerValue);
  if (Number.isFinite(numeric) && numeric >= 0) {
    return numeric * 1000;
  }
  const date = new Date(headerValue);
  if (Number.isNaN(date.getTime())) return null;
  const diff = date.getTime() - Date.now();
  return diff > 0 ? diff : null;
};

const parseTags = (tagPayload) => {
  if (!Array.isArray(tagPayload)) return [];
  return tagPayload
    .map((tag) => {
      if (typeof tag === "string") return tag;
      if (typeof tag?.name === "string") return tag.name;
      return "";
    })
    .map((tag) => tag.trim())
    .filter(Boolean);
};

const pickThumbnail = (pictures) => {
  if (!Array.isArray(pictures?.sizes) || pictures.sizes.length === 0) return null;
  const largest = pictures.sizes[pictures.sizes.length - 1];
  return largest?.link || null;
};

const extractVideoIdFromUri = (uri) => {
  if (!uri) return null;
  const parts = String(uri).split("/");
  return parts[parts.length - 1] || null;
};

const toIsoOrNull = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const normalizeAccessToken = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return null;

  // Accept either raw token or full "Bearer <token>" input from UI/env.
  const unquoted = raw.replace(/^["']|["']$/g, "");
  return unquoted.replace(/^Bearer\s+/i, "").trim() || null;
};

const VIDEO_FIELDS = [
  "uri",
  "name",
  "description",
  "duration",
  "created_time",
  "release_time",
  "link",
  "tags.name",
  "pictures.sizes.link",
  "privacy.view",
  "parent_folder.name",
  "metadata.connections.texttracks.uri",
  "download.link",
  "download.type"
].join(",");

export class VimeoClient {
  constructor(accessToken = env.vimeoAccessToken, logger = console) {
    this.accessToken = normalizeAccessToken(accessToken);
    this.logger = logger;
  }

  isConfigured() {
    return Boolean(this.accessToken);
  }

  async request(path, init = {}) {
    if (!this.isConfigured()) {
      throw new Error("VIMEO_ACCESS_TOKEN is missing.");
    }

    let attempt = 0;
    while (true) {
      this.logger.debug?.("Vimeo request started", {
        path,
        method: init.method || "GET",
        attempt: attempt + 1
      });

      const response = await fetch(`${VIMEO_API_BASE}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          Accept: "application/json",
          ...(init.headers || {})
        }
      });

      if (response.ok) {
        this.logger.debug?.("Vimeo request succeeded", { path, status: response.status, attempt: attempt + 1 });
        return response.json();
      }

      const body = await response.text();
      const canRetry503 = response.status === SERVICE_UNAVAILABLE_STATUS && attempt < MAX_503_RETRIES;
      if (canRetry503) {
        const retryAfterMs = parseRetryAfterToMs(response.headers.get("retry-after"));
        const fallbackMs = attempt === 0 ? INITIAL_503_RETRY_MS : FOLLOWUP_503_RETRY_MS;
        const waitMs = Math.max(fallbackMs, retryAfterMs || 0);

        this.logger.warn?.("Vimeo API 503 received; retrying request", {
          path,
          attempt: attempt + 1,
          maxRetries: MAX_503_RETRIES,
          waitSeconds: Math.round(waitMs / 1000)
        });

        attempt += 1;
        await sleep(waitMs);
        continue;
      }

      this.logger.error?.("Vimeo request failed", {
        path,
        status: response.status,
        statusText: response.statusText,
        responseBody: body,
        attempt: attempt + 1
      });
      throw new Error(`Vimeo API ${response.status} ${response.statusText}: ${body}`);
    }
  }

  async listVideos({ page = 1, perPage = 50, maxPages = 0 } = {}) {
    const videos = [];

    const pageLimit = Number(maxPages);
    const maxPageCount = Number.isFinite(pageLimit) && pageLimit > 0 ? pageLimit : Number.POSITIVE_INFINITY;

    let currentPage = page;
    let pagesFetched = 0;
    let hasMore = true;

    while (hasMore && pagesFetched < maxPageCount) {
      const pageResult = await this.listVideosPage({ page: currentPage, perPage });
      videos.push(...pageResult.videos);

      pagesFetched += 1;
      currentPage += 1;
      hasMore = pageResult.hasMore;
    }

    this.logger.info?.("Completed Vimeo videos fetch", {
      totalFetched: videos.length,
      pagesFetched,
      maxPagesRequested: Number.isFinite(pageLimit) ? pageLimit : null
    });
    return videos;
  }

  async listVideosPage({ page = 1, perPage = 50 } = {}) {
    const payload = await this.request(`/me/videos?per_page=${perPage}&page=${page}&fields=${encodeURIComponent(VIDEO_FIELDS)}`);
    const data = Array.isArray(payload?.data) ? payload.data : [];
    this.logger.info?.("Fetched Vimeo videos page", {
      page,
      perPage,
      received: data.length
    });

    const videos = [];
    for (const item of data) {
      const videoId = extractVideoIdFromUri(item.uri);
      if (!videoId) continue;

      videos.push({
        vimeoVideoId: videoId,
        vimeoUri: item.uri || null,
        title: item.name || `Vimeo Video ${videoId}`,
        description: item.description || null,
        durationSeconds: Number.isFinite(item.duration) ? item.duration : null,
        publishedAt: toIsoOrNull(item.release_time || item.created_time),
        thumbnailUrl: pickThumbnail(item.pictures),
        videoUrl: item.link || `https://vimeo.com/${videoId}`,
        folderName: item.parent_folder?.name || null,
        privacyView: item.privacy?.view || null,
        tags: parseTags(item.tags),
        raw: item
      });
    }

    const parsedTotal = Number(payload?.total);
    const totalCount = Number.isFinite(parsedTotal) && parsedTotal >= 0 ? Math.floor(parsedTotal) : null;

    return {
      videos,
      hasMore: Boolean(payload?.paging?.next) && data.length > 0,
      totalCount
    };
  }

  async listTextTracks(vimeoVideoId) {
    const payload = await this.request(`/videos/${vimeoVideoId}/texttracks`);
    return Array.isArray(payload?.data) ? payload.data : [];
  }

  async getVideoById(vimeoVideoId) {
    const normalizedId = String(vimeoVideoId || "").trim();
    if (!normalizedId) {
      throw new Error("Vimeo video id is required.");
    }
    const item = await this.request(`/videos/${normalizedId}?fields=${encodeURIComponent(VIDEO_FIELDS)}`);
    const videoId = extractVideoIdFromUri(item?.uri) || normalizedId;
    return {
      vimeoVideoId: videoId,
      vimeoUri: item?.uri || `/videos/${videoId}`,
      title: item?.name || `Vimeo Video ${videoId}`,
      description: item?.description || null,
      durationSeconds: Number.isFinite(item?.duration) ? item.duration : null,
      publishedAt: toIsoOrNull(item?.release_time || item?.created_time),
      thumbnailUrl: pickThumbnail(item?.pictures),
      videoUrl: item?.link || `https://vimeo.com/${videoId}`,
      folderName: item?.parent_folder?.name || null,
      privacyView: item?.privacy?.view || null,
      tags: parseTags(item?.tags),
      raw: item
    };
  }

  async fetchTextTrackContent(link) {
    const response = await fetch(link, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`
      }
    });
    if (!response.ok) {
      throw new Error(`Failed downloading text track: ${response.status} ${response.statusText}`);
    }
    return response.text();
  }
}
