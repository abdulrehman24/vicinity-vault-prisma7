import { toVideoCardDto } from "./video-dto";

export class FavoriteService {
  constructor({ prisma }) {
    this.prisma = prisma;
  }

  async listForUser(userId) {
    const rows = await this.prisma.favourites.findMany({
      where: { user_id: userId },
      include: {
        video: {
          include: { video_tags: true }
        }
      },
      orderBy: { created_at: "desc" }
    });

    return rows.map((row) =>
      toVideoCardDto(row.video, {
        matchScore: 0.9,
        matchReason: "Saved to your favorites."
      })
    );
  }

  async add(userId, videoId) {
    await this.prisma.favourites.upsert({
      where: {
        user_id_video_id: {
          user_id: userId,
          video_id: videoId
        }
      },
      create: {
        user_id: userId,
        video_id: videoId
      },
      update: {}
    });
  }

  async remove(userId, videoId) {
    await this.prisma.favourites.delete({
      where: {
        user_id_video_id: {
          user_id: userId,
          video_id: videoId
        }
      }
    });
  }
}
