import { source_status } from "@prisma/client";
import { SystemHealthService } from "./system-health-service";

export class AdminDashboardService {
  constructor({ prisma }) {
    this.prisma = prisma;
  }

  async getSystemData() {
    const [videoCount, activeSources, userCount, recentRuns] = await Promise.all([
      this.prisma.videos.count({ where: { status: "active" } }),
      this.prisma.data_sources.count({ where: { status: { not: source_status.disabled } } }),
      this.prisma.users.count({ where: { is_active: true } }),
      this.prisma.sync_runs.findMany({
        take: 10,
        orderBy: { created_at: "desc" },
        select: {
          id: true,
          status: true,
          trigger: true,
          notes: true,
          retry_of_run_id: true,
          videos_scanned: true,
          videos_deleted: true,
          videos_created: true,
          videos_updated: true,
          embeddings_created: true,
          created_at: true,
          finished_at: true,
          error_count: true,
          data_source: { select: { name: true } }
        }
      })
    ]);

    const health = await new SystemHealthService({ prisma: this.prisma }).getHealthSummary();

    return {
      stats: {
        totalVideosIndexed: videoCount,
        activeDataSources: activeSources,
        activeUsers: userCount
      },
      health,
      recentRuns: recentRuns.map((run) => ({
        id: run.id,
        sourceName: run.data_source?.name || "Unknown",
        status: run.status,
        trigger: run.trigger,
        notes: run.notes,
        retryOfRunId: run.retry_of_run_id,
        createdAt: run.created_at,
        finishedAt: run.finished_at,
        errorCount: run.error_count,
        videosScanned: run.videos_scanned,
        videosProcessed: run.videos_deleted,
        videosCreated: run.videos_created,
        videosUpdated: run.videos_updated,
        embeddingsCreated: run.embeddings_created,
        canRetry: ["failed", "partial"].includes(run.status)
      }))
    };
  }

  async listUsers() {
    const rows = await this.prisma.users.findMany({
      orderBy: [{ is_active: "desc" }, { updated_at: "desc" }],
      select: {
        id: true,
        full_name: true,
        email: true,
        role: true,
        avatar_initials: true,
        last_login_at: true,
        is_active: true
      }
    });

    return rows.map((row) => ({
      id: row.id,
      name: row.full_name,
      email: row.email,
      role: row.role,
      avatar: row.avatar_initials || row.full_name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase(),
      lastLoginAt: row.last_login_at,
      isActive: row.is_active
    }));
  }

  async listSyncErrors({ status = null, limit = 20 } = {}) {
    const rows = await this.prisma.sync_errors.findMany({
      where: {
        ...(status ? { status } : {})
      },
      orderBy: [{ created_at: "desc" }],
      take: Math.max(1, Math.min(Number(limit) || 20, 100)),
      select: {
        id: true,
        sync_run_id: true,
        status: true,
        stage: true,
        error_code: true,
        error_message: true,
        retry_count: true,
        created_at: true,
        updated_at: true,
        resolved_at: true,
        data_source: { select: { id: true, name: true } },
        video: { select: { id: true, title: true, vimeo_video_id: true } }
      }
    });

    return rows.map((row) => ({
      id: row.id,
      syncRunId: row.sync_run_id,
      status: row.status,
      stage: row.stage,
      errorCode: row.error_code,
      message: row.error_message,
      retryCount: row.retry_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      resolvedAt: row.resolved_at,
      source: row.data_source
        ? {
            id: row.data_source.id,
            name: row.data_source.name
          }
        : null,
      video: row.video
        ? {
            id: row.video.id,
            title: row.video.title,
            vimeoId: row.video.vimeo_video_id
          }
        : null
    }));
  }

  async updateSyncErrorStatus({ id, status }) {
    const allowed = new Set(["open", "retrying", "resolved", "ignored"]);
    if (!allowed.has(status)) {
      throw new Error("Invalid sync error status.");
    }

    const row = await this.prisma.sync_errors.update({
      where: { id },
      data: {
        status,
        resolved_at: status === "resolved" ? new Date() : null,
        updated_at: new Date()
      },
      select: {
        id: true,
        sync_run_id: true,
        status: true,
        stage: true,
        error_message: true,
        updated_at: true,
        resolved_at: true
      }
    });

    return {
      id: row.id,
      syncRunId: row.sync_run_id,
      status: row.status,
      stage: row.stage,
      message: row.error_message,
      updatedAt: row.updated_at,
      resolvedAt: row.resolved_at
    };
  }
}
