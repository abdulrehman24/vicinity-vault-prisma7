import { shortlist_visibility } from "@prisma/client";
import crypto from "node:crypto";
import { toVideoCardDto } from "./video-dto";

const DEFAULT_SHARE_EXPIRY_DAYS = 30;
const buildShareExpiry = (days = DEFAULT_SHARE_EXPIRY_DAYS) => {
  const parsed = Number(days);
  const safeDays = Number.isFinite(parsed) ? Math.max(1, Math.min(365, Math.trunc(parsed))) : DEFAULT_SHARE_EXPIRY_DAYS;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + safeDays);
  return expiresAt;
};

const toPlaylistDto = (playlist, videos = [], { includeShareToken = false } = {}) => ({
  id: playlist.id,
  name: playlist.name,
  description: playlist.description || "",
  visibility: playlist.visibility,
  shareToken: includeShareToken ? playlist.share_token || null : null,
  shareExpiresAt: playlist?.share_expires_at || null,
  shareLastAccessedAt: playlist?.share_last_accessed_at || null,
  createdAt: playlist.created_at,
  ownerUserId: playlist.owner_user_id,
  ownerName: playlist.owner_user?.full_name || "Unknown",
  videoIds: videos.map((video) => video.id),
  videos: videos.map((video) =>
    toVideoCardDto(video, {
      matchScore: 0.7,
      matchReason: "Saved in this collection."
    })
  )
});

export class PlaylistService {
  constructor({ prisma }) {
    this.prisma = prisma;
  }

  async safeCreateShareAuditLog({ shortlistId, actorUserId = null, action, detail = {} }) {
    if (!this.prisma.shortlist_share_audit_logs) return;
    try {
      await this.prisma.shortlist_share_audit_logs.create({
        data: {
          shortlist_id: shortlistId,
          actor_user_id: actorUserId,
          action,
          detail
        }
      });
    } catch {
      // Backward compatibility when DB/client does not include audit table yet.
    }
  }

  async listByVisibility({ visibility, ownerUserId = null }) {
    const rows = await this.prisma.shortlists.findMany({
      where: {
        visibility,
        ...(ownerUserId ? { owner_user_id: ownerUserId } : {})
      },
      include: {
        owner_user: true,
        shortlist_items: {
          include: {
            video: {
              include: { video_tags: true }
            }
          },
          orderBy: { created_at: "asc" }
        }
      },
      orderBy: { created_at: "desc" }
    });

    return rows.map((row) =>
      toPlaylistDto(row, row.shortlist_items.map((item) => item.video), {
        includeShareToken: Boolean(ownerUserId) && row.owner_user_id === ownerUserId
      })
    );
  }

  async listForOwner(ownerUserId) {
    const rows = await this.prisma.shortlists.findMany({
      where: {
        owner_user_id: ownerUserId,
        visibility: { in: [shortlist_visibility.private, shortlist_visibility.shared_link] }
      },
      include: {
        owner_user: true,
        shortlist_items: {
          include: {
            video: {
              include: { video_tags: true }
            }
          },
          orderBy: { created_at: "asc" }
        }
      },
      orderBy: { created_at: "desc" }
    });

    return rows.map((row) =>
      toPlaylistDto(row, row.shortlist_items.map((item) => item.video), {
        includeShareToken: true
      })
    );
  }

  async create({ ownerUserId, visibility, name, description }) {
    const row = await this.prisma.shortlists.create({
      data: {
        owner_user_id: ownerUserId,
        visibility,
        name,
        description: description || null
      },
      include: { owner_user: true }
    });
    return toPlaylistDto(row, [], { includeShareToken: true });
  }

  async delete(id, userId) {
    const list = await this.prisma.shortlists.findUnique({ where: { id } });
    if (!list) {
      throw new Error("Collection not found.");
    }
    if (list.owner_user_id !== userId) {
      throw new Error("Only the collection owner can delete this collection.");
    }
    await this.prisma.shortlists.delete({ where: { id } });
  }

  async addVideo({ shortlistId, videoId, userId }) {
    await this.assertCollectionWriteAccess(shortlistId, userId);
    await this.prisma.shortlist_items.upsert({
      where: {
        shortlist_id_video_id: {
          shortlist_id: shortlistId,
          video_id: videoId
        }
      },
      create: {
        shortlist_id: shortlistId,
        video_id: videoId,
        added_by_user_id: userId
      },
      update: {}
    });
  }

  async removeVideo({ shortlistId, videoId, userId }) {
    await this.assertCollectionWriteAccess(shortlistId, userId);
    await this.prisma.shortlist_items.delete({
      where: {
        shortlist_id_video_id: {
          shortlist_id: shortlistId,
          video_id: videoId
        }
      }
    });
  }

  visibilityFromKind(kind) {
    return kind === "personal" ? shortlist_visibility.private : shortlist_visibility.team;
  }

  async assertCollectionWriteAccess(shortlistId, userId) {
    const list = await this.prisma.shortlists.findUnique({
      where: { id: shortlistId },
      select: { id: true, visibility: true, owner_user_id: true }
    });

    if (!list) {
      throw new Error("Collection not found.");
    }

    if (list.visibility === shortlist_visibility.team) {
      return;
    }

    if (list.owner_user_id !== userId) {
      throw new Error("You do not have access to modify this collection.");
    }
  }

  async assertOwner(shortlistId, userId) {
    const list = await this.prisma.shortlists.findUnique({
      where: { id: shortlistId },
      select: { id: true, owner_user_id: true }
    });
    if (!list) {
      throw new Error("Collection not found.");
    }
    if (list.owner_user_id !== userId) {
      throw new Error("Only the collection owner can manage sharing.");
    }
    return list;
  }

  async getShareSettings({ shortlistId, userId }) {
    await this.assertOwner(shortlistId, userId);
    const row = await this.prisma.shortlists.findUnique({
      where: { id: shortlistId },
      select: { id: true, visibility: true, share_token: true }
    });
    return {
      shortlistId: row.id,
      visibility: row.visibility,
      isShared: row.visibility === shortlist_visibility.shared_link && Boolean(row.share_token),
      shareToken: row.share_token || null,
      shareExpiresAt: null
    };
  }

  async updateShareSettings({ shortlistId, userId, action, expiryDays = DEFAULT_SHARE_EXPIRY_DAYS }) {
    await this.assertOwner(shortlistId, userId);

    if (!["enable", "disable", "regenerate"].includes(action)) {
      throw new Error("Invalid share action.");
    }

    const current = await this.prisma.shortlists.findUnique({
      where: { id: shortlistId },
      select: { id: true, visibility: true, share_token: true }
    });

    let nextVisibility = current.visibility;
    let nextToken = current.share_token;
    let nextExpiry = null;

    if (action === "enable") {
      nextVisibility = shortlist_visibility.shared_link;
      nextToken = current.share_token || crypto.randomUUID();
      nextExpiry = buildShareExpiry(expiryDays);
    } else if (action === "disable") {
      nextVisibility = shortlist_visibility.private;
      nextToken = null;
      nextExpiry = null;
    } else if (action === "regenerate") {
      nextVisibility = shortlist_visibility.shared_link;
      nextToken = crypto.randomUUID();
      nextExpiry = buildShareExpiry(expiryDays);
    }

    const row = await this.prisma.shortlists.update({
      where: { id: shortlistId },
      data: {
        visibility: nextVisibility,
        share_token: nextToken,
        updated_at: new Date()
      },
      select: { id: true, visibility: true, share_token: true }
    });

    await this.safeCreateShareAuditLog({
      shortlistId,
      actorUserId: userId,
      action: `share_${action}`,
      detail: {
        visibility: row.visibility,
        shareTokenPresent: Boolean(row.share_token),
        shareExpiresAt: nextExpiry
      }
    });

    return {
      shortlistId: row.id,
      visibility: row.visibility,
      isShared: row.visibility === shortlist_visibility.shared_link && Boolean(row.share_token),
      shareToken: row.share_token || null,
      shareExpiresAt: null
    };
  }

  async getByShareToken(token, actorUserId = null) {
    const value = String(token || "").trim();
    if (!value) {
      throw new Error("Share token is required.");
    }

    const row = await this.prisma.shortlists.findFirst({
      where: {
        share_token: value,
        visibility: shortlist_visibility.shared_link,
        is_archived: false
      },
      include: {
        owner_user: true,
        shortlist_items: {
          include: {
            video: {
              include: { video_tags: true }
            }
          },
          orderBy: { created_at: "asc" }
        }
      }
    });

    if (!row) {
      throw new Error("Shared collection not found.");
    }

    if (typeof row.share_last_accessed_at !== "undefined") {
      try {
        await this.prisma.shortlists.update({
          where: { id: row.id },
          data: {
            share_last_accessed_at: new Date(),
            updated_at: new Date()
          }
        });
      } catch {
        // Backward compatibility when DB/client does not include this column yet.
      }
    }

    await this.safeCreateShareAuditLog({
      shortlistId: row.id,
      actorUserId,
      action: "share_accessed",
      detail: {
        via: "token"
      }
    });

    return toPlaylistDto(row, row.shortlist_items.map((item) => item.video), {
      includeShareToken: true
    });
  }
}
