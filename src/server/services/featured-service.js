import { toVideoCardDto } from "./video-dto";

export class FeaturedService {
  constructor({ prisma }) {
    this.prisma = prisma;
  }

  async resolveFeaturedVideoIds(limit = 24) {
    const favoritesRanked = await this.prisma.$queryRawUnsafe(
      `
      SELECT v.id, COUNT(f.video_id) AS favorite_count
      FROM "videos" v
      JOIN "favourites" f ON f.video_id = v.id
      WHERE v.status = 'active'
      GROUP BY v.id
      ORDER BY favorite_count DESC, MAX(f.created_at) DESC
      LIMIT $1;
      `,
      limit
    );

    const ids = (favoritesRanked || []).map((row) => row.id);
    return ids;
  }

  async countFeatured(limit = 24) {
    const ids = await this.resolveFeaturedVideoIds(limit);
    return ids.length;
  }

  async listFeatured(limit = 24) {
    const ids = await this.resolveFeaturedVideoIds(limit);
    let videos = [];

    if (ids.length > 0) {
      videos = await this.prisma.videos.findMany({
        where: { id: { in: ids } },
        include: { video_tags: true }
      });
    }

    return videos.map((video) =>
      toVideoCardDto(video, {
        matchScore: 0.85,
        matchReason: "Featured because it is currently prioritized by engagement signals."
      })
    );
  }
}
