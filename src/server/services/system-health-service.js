import { source_platform, source_status } from "@prisma/client";
import { env } from "../config/env";

const STALE_SYNC_DAYS = 7;

const toIsoDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

export class SystemHealthService {
  constructor({ prisma }) {
    this.prisma = prisma;
  }

  async getHealthSummary() {
    const warnings = [];
    const info = [];

    if (!env.databaseUrl) {
      warnings.push({
        code: "missing_database_url",
        level: "critical",
        message: "DATABASE_URL is missing."
      });
    }

    if (!env.nextAuthSecret) {
      warnings.push({
        code: "missing_nextauth_secret",
        level: "warning",
        message: "NEXTAUTH_SECRET is missing. Sessions are not production-safe."
      });
    }

    if (!env.googleClientId || !env.googleClientSecret) {
      info.push({
        code: "google_sso_not_configured",
        message: "Google SSO credentials are missing."
      });
    }

    const [activeVimeoSources, sourcesMissingToken, lastSyncRun] = await Promise.all([
      this.prisma.data_sources.count({
        where: {
          platform: source_platform.vimeo,
          status: { not: source_status.disabled }
        }
      }),
      this.prisma.data_sources.count({
        where: {
          platform: source_platform.vimeo,
          status: { not: source_status.disabled },
          access_token_encrypted: null
        }
      }),
      this.prisma.sync_runs.findFirst({
        orderBy: { created_at: "desc" },
        select: { created_at: true, status: true }
      })
    ]);

    if (activeVimeoSources === 0) {
      warnings.push({
        code: "no_active_vimeo_sources",
        level: "warning",
        message: "No active Vimeo sources configured."
      });
    }

    if (sourcesMissingToken > 0) {
      warnings.push({
        code: "sources_missing_token",
        level: "warning",
        message: `${sourcesMissingToken} active source(s) are missing Vimeo access tokens.`
      });
    }

    if (!lastSyncRun) {
      warnings.push({
        code: "no_sync_history",
        level: "warning",
        message: "No sync runs found yet."
      });
    } else {
      const now = Date.now();
      const ageMs = now - new Date(lastSyncRun.created_at).getTime();
      const staleMs = STALE_SYNC_DAYS * 24 * 60 * 60 * 1000;
      if (ageMs > staleMs) {
        warnings.push({
          code: "stale_sync",
          level: "warning",
          message: `Latest sync is older than ${STALE_SYNC_DAYS} days.`
        });
      }
    }

    return {
      ok: warnings.every((item) => item.level !== "critical"),
      warnings,
      info,
      checks: {
        hasDatabaseUrl: Boolean(env.databaseUrl),
        hasNextAuthSecret: Boolean(env.nextAuthSecret),
        hasGoogleSso: Boolean(env.googleClientId && env.googleClientSecret),
        hasOpenAiEnvKey: Boolean(env.openaiApiKey),
        activeVimeoSources,
        sourcesMissingToken,
        lastSyncAt: toIsoDate(lastSyncRun?.created_at)
      }
    };
  }
}
