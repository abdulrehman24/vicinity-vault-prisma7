import { source_platform, source_status } from "@prisma/client";
import { decryptSecret, encryptSecret, maskSecret } from "../security/secrets";
import { VimeoClient } from "./vimeo-client";

const normalizeAccessToken = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const unquoted = raw.replace(/^["']|["']$/g, "");
  return unquoted.replace(/^Bearer\s+/i, "").trim();
};

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
    const accessToken = normalizeAccessToken(input?.accessToken);
    if (!accessToken) {
      throw new Error("Vimeo access token is required.");
    }

    const row = await this.prisma.data_sources.create({
      data: {
        name: input.name.trim(),
        platform: source_platform.vimeo,
        status: source_status.connected,
        access_token_encrypted: encryptSecret(accessToken),
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
      const normalized = normalizeAccessToken(input.accessToken);
      // On edit, blank token means "keep current token".
      if (normalized) {
        data.access_token_encrypted = encryptSecret(normalized);
      }
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

  async testSourceConnection(id) {
    const source = await this.prisma.data_sources.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        access_token_encrypted: true
      }
    });

    if (!source) {
      throw new Error("Source not found.");
    }

    const decryptedToken = decryptSecret(source.access_token_encrypted);
    if (!decryptedToken) {
      throw new Error(`Source "${source.name}" has no valid Vimeo token saved.`);
    }

    const client = new VimeoClient(decryptedToken);

    try {
      const me = await client.request("/me");
      return {
        ok: true,
        accountName: me?.name || null,
        accountUri: me?.uri || null
      };
    } catch (error) {
      throw new Error(`Vimeo token test failed: ${error.message}`);
    }
  }
}
