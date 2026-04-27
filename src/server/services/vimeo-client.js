import { env } from "../config/env";

const VIMEO_API_BASE = "https://api.vimeo.com";

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

    this.logger.debug?.("Vimeo request started", { path, method: init.method || "GET" });
    const response = await fetch(`${VIMEO_API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        Accept: "application/json",
        ...(init.headers || {})
      }
    });

    if (!response.ok) {
      const body = await response.text();
      this.logger.error?.("Vimeo request failed", {
        path,
        status: response.status,
        statusText: response.statusText,
        responseBody: body
      });
      throw new Error(`Vimeo API ${response.status} ${response.statusText}: ${body}`);
    }

    this.logger.debug?.("Vimeo request succeeded", { path, status: response.status });
    return response.json();
  }

  async listVideos({ page = 1, perPage = 50, maxPages = 0 } = {}) {
    const videos = [];
    const fields = [
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

    const pageLimit = Number(maxPages);
    const maxPageCount = Number.isFinite(pageLimit) && pageLimit > 0 ? pageLimit : Number.POSITIVE_INFINITY;

    let currentPage = page;
    let pagesFetched = 0;
    let hasMore = true;

    while (hasMore && pagesFetched < maxPageCount) {
      const payload = await this.request(`/me/videos?per_page=${perPage}&page=${currentPage}&fields=${encodeURIComponent(fields)}`);
      const data = Array.isArray(payload?.data) ? payload.data : [];
      this.logger.info?.("Fetched Vimeo videos page", {
        page: currentPage,
        perPage,
        received: data.length
      });

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

      pagesFetched += 1;
      currentPage += 1;
      hasMore = Boolean(payload?.paging?.next) && data.length > 0;
    }

    this.logger.info?.("Completed Vimeo videos fetch", {
      totalFetched: videos.length,
      pagesFetched,
      maxPagesRequested: Number.isFinite(pageLimit) ? pageLimit : null
    });
    return videos;
  }

  async listTextTracks(vimeoVideoId) {
    const payload = await this.request(`/videos/${vimeoVideoId}/texttracks`);
    return Array.isArray(payload?.data) ? payload.data : [];
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
