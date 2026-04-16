const toTags = (videoTags) => (videoTags || []).map((tag) => tag.tag);

export const toVideoCardDto = (video, { matchScore = null, matchReason = null } = {}) => ({
  id: video.id,
  vimeoId: video.vimeo_video_id,
  title: video.title,
  description: video.description || "",
  tags: toTags(video.video_tags),
  duration: video.duration_seconds || 0,
  createdAt: video.published_at || video.created_at,
  link: video.video_url,
  thumbnail: video.thumbnail_url,
  folder: video.folder_name || "Vault",
  matchScore: matchScore ?? 0.5,
  matchReason: matchReason || "Matches because metadata and transcript context align with your query."
});

export const mergeVideoScores = ({ metadata = 0, transcript = 0, semantic = 0 }) => {
  const score = metadata * 0.45 + transcript * 0.25 + semantic * 0.3;
  return Math.max(0, Math.min(0.99, score));
};
