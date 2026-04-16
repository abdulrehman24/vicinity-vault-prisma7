import { source_platform, source_status } from "@prisma/client";
import { encryptSecret, maskSecret } from "../security/secrets";

export class AdminSourceService {
  constructor({ prisma }) {
    this.prisma = prisma;
  }

  toPublicDto(source) {
    return {
      id: source.id,
      name: source.name,
      platform: source.platform,
      status: source.status,
      hasAccessToken: Boolean(source.access_token_encrypted),
      accessTokenMasked: maskSecret(source.access_token_encrypted),
      lastSyncAt: source.last_sync_at,
      videoCount: source.video_count,
      createdAt: source.created_at,
      updatedAt: source.updated_at
    };
  }

  async listSources() {
    const rows = await this.prisma.data_sources.findMany({
      where: { platform: source_platform.vimeo },
      orderBy: { created_at: "asc" }
    });
    return rows.map((row) => this.toPublicDto(row));
  }

  async createSource({ input, createdByUserId = null }) {
    if (!input?.name?.trim()) {
      throw new Error("Source name is required.");
    }
    if (!input?.accessToken?.trim()) {
      throw new Error("Vimeo access token is required.");
    }

    const row = await this.prisma.data_sources.create({
      data: {
        name: input.name.trim(),
        platform: source_platform.vimeo,
        status: source_status.connected,
        access_token_encrypted: encryptSecret(input.accessToken.trim()),
        created_by_user_id: createdByUserId
      }
    });

    return this.toPublicDto(row);
  }

  async updateSource({ id, input }) {
    const data = {
      updated_at: new Date()
    };

    if (typeof input.name === "string") data.name = input.name.trim();
    if (typeof input.status === "string" && Object.values(source_status).includes(input.status)) data.status = input.status;
    if (typeof input.accessToken === "string") {
      data.access_token_encrypted = input.accessToken.trim() ? encryptSecret(input.accessToken.trim()) : null;
    }

    const row = await this.prisma.data_sources.update({
      where: { id },
      data
    });
    return this.toPublicDto(row);
  }

  async deactivateSource(id) {
    const row = await this.prisma.data_sources.update({
      where: { id },
      data: {
        status: source_status.disabled,
        updated_at: new Date()
      }
    });
    return this.toPublicDto(row);
  }
}
