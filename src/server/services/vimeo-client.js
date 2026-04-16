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

export class VimeoClient {
  constructor(accessToken = env.vimeoAccessToken) {
    this.accessToken = accessToken;
  }

  isConfigured() {
    return Boolean(this.accessToken);
  }

  async request(path, init = {}) {
    if (!this.isConfigured()) {
      throw new Error("VIMEO_ACCESS_TOKEN is missing.");
    }

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
      throw new Error(`Vimeo API ${response.status} ${response.statusText}: ${body}`);
    }

    return response.json();
  }

  async listVideos({ page = 1, perPage = 50, maxPages = 1 } = {}) {
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

    let currentPage = page;
    let pagesFetched = 0;
    let hasMore = true;

    while (hasMore && pagesFetched < maxPages) {
      const payload = await this.request(`/me/videos?per_page=${perPage}&page=${currentPage}&fields=${encodeURIComponent(fields)}`);
      const data = Array.isArray(payload?.data) ? payload.data : [];

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
