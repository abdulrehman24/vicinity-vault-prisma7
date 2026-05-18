"use client";

import { useEffect, useState } from "react";
import SafeIcon from "@/src/common/SafeIcon";
import { notifyDataChanged } from "@/src/lib/client-api";
import { toast } from "sonner";
import ConfirmDialog from "@/src/components/ConfirmDialog";

export default function AdminPage() {
  const formatRunTriggerLabel = (trigger) => {
    const value = String(trigger || "").toLowerCase();
    if (value === "scheduled") return "Scheduled (Cron)";
    if (value === "manual") return "Manual";
    if (value === "retry") return "Retry";
    return value ? value : "Unknown";
  };

  const formatRunOperationLabel = (run) => {
    const notes = String(run?.notes || "").toLowerCase();
    if (notes.includes("embedding_rebuild")) return "Embedding Rebuild";
    if (notes.includes("delete_local_only")) return "Delete";
    if (notes.includes("delete_only_reconcile")) return "Delete Reconcile";
    if (notes.includes("sync_new_enrich")) return "Sync New";
    if (notes.includes("ingest_only")) return "Ingest Only";
    if (notes.includes("baseline_full_sync")) return "Full Sync";
    return "Vimeo Sync";
  };

  const [activeTab, setActiveTab] = useState("system");
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRebuildingEmbeddings, setIsRebuildingEmbeddings] = useState(false);
  const [retryingRunId, setRetryingRunId] = useState(null);
  const [sourceRebuildId, setSourceRebuildId] = useState(null);
  const [sourceTestId, setSourceTestId] = useState(null);
  const [syncingSourceIds, setSyncingSourceIds] = useState([]);
  const [isAddingSource, setIsAddingSource] = useState(false);
  const [isDeletingSource, setIsDeletingSource] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");
  const [pageError, setPageError] = useState("");
  const [pageSuccess, setPageSuccess] = useState("");

  const [systemData, setSystemData] = useState({
    stats: { totalVideosIndexed: 0, activeDataSources: 0, activeUsers: 0 },
    health: {
      ok: true,
      warnings: [],
      info: [],
      checks: {
        hasDatabaseUrl: false,
        hasNextAuthSecret: false,
        hasGoogleSso: false,
        hasOpenAiEnvKey: false,
        activeVimeoSources: 0,
        sourcesMissingToken: 0,
        lastSyncAt: null
      }
    },
    recentRuns: []
  });
  const [syncErrors, setSyncErrors] = useState([]);
  const [syncLogs, setSyncLogs] = useState({
    enabled: true,
    lines: [],
    lineCount: 0,
    filePath: null,
    message: "",
    truncated: false
  });
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [syncErrorFilter, setSyncErrorFilter] = useState("open");
  const [errorActionId, setErrorActionId] = useState(null);
  const [isRetryingAllErrors, setIsRetryingAllErrors] = useState(false);
  const [sources, setSources] = useState([]);
  const [users, setUsers] = useState([]);
  const [genres, setGenres] = useState([]);
  const [videosData, setVideosData] = useState({
    items: [],
    pagination: { page: 1, limit: 25, total: 0, totalPages: 1 },
    filters: { folders: [], sources: [] }
  });
  const [videosQuery, setVideosQuery] = useState({
    page: 1,
    limit: 25,
    search: "",
    folder: "",
    sourceId: ""
  });
  const [isLoadingVideos, setIsLoadingVideos] = useState(false);
  const [videoEditor, setVideoEditor] = useState({
    open: false,
    loading: false,
    saving: false,
    id: null,
    original: null,
    form: {
      title: "",
      description: "",
      tags: "",
      internalNotes: "",
      classificationOverride: "",
      searchKeywords: "",
      manualCategoryOverride: ""
    }
  });
  const [videoUpdateConfirmOpen, setVideoUpdateConfirmOpen] = useState(false);
  const [sourceForm, setSourceForm] = useState({
    id: null,
    name: "",
    accessToken: "",
    status: "connected"
  });
  const [aiConfig, setAiConfig] = useState({
    hasOpenAiKey: false,
    openAiKeyMasked: null,
    openAiKey: "",
    embeddingModel: "text-embedding-3-small",
    explanationModel: "gpt-5-nano",
    matchSensitivity: 0.65,
    matchReasonPrompt:
      "In one short, punchy sentence, explain to a salesperson why this video is a good match for the client brief. Start with 'Matches because...'",
    autoSyncEmbeddings: true
  });
  const [genreForm, setGenreForm] = useState({
    id: null,
    name: "",
    description: ""
  });
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    sourceId: null,
    sourceName: ""
  });
  const [genreConfirmDialog, setGenreConfirmDialog] = useState({
    open: false,
    genreId: null,
    genreName: ""
  });
  const [isDeletingGenre, setIsDeletingGenre] = useState(false);
  const [truncateConfirmOpen, setTruncateConfirmOpen] = useState(false);
  const [isTruncatingData, setIsTruncatingData] = useState(false);
  const [manualSyncMode, setManualSyncMode] = useState("baseline_full_sync");
  const [sourceSyncStartMode, setSourceSyncStartMode] = useState("cursor");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const tab = url.searchParams.get("tab");
    const search = url.searchParams.get("search");
    if (tab && ["system", "sources", "videos", "users", "settings", "genres"].includes(tab)) {
      setActiveTab(tab);
    }
    if (search) {
      setVideosQuery((prev) => ({ ...prev, search, page: 1 }));
    }
  }, []);

  const apiFetch = async (url, init = {}) => {
    const response = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers || {})
      }
    });
    if (response.status === 401) {
      window.location.href = "/login";
      throw new Error("Session expired. Please sign in again.");
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Request failed");
    return payload;
  };

  const loadSystem = async () => {
    const payload = await apiFetch("/api/admin/system");
    setSystemData(payload);
  };

  const loadSyncErrors = async (status = syncErrorFilter) => {
    const query = new URLSearchParams();
    if (status) query.set("status", status);
    query.set("limit", "25");
    const payload = await apiFetch(`/api/admin/system/errors?${query.toString()}`);
    setSyncErrors(payload.errors || []);
  };

  const loadSyncLogs = async ({ silent = false } = {}) => {
    if (!silent) setIsLoadingLogs(true);
    try {
      const payload = await apiFetch("/api/admin/system/logs?lines=180&maxBytes=262144");
      setSyncLogs({
        enabled: typeof payload.enabled === "boolean" ? payload.enabled : true,
        lines: payload.lines || [],
        lineCount: Number(payload.lineCount || 0),
        filePath: payload.filePath || null,
        message: payload.message || "",
        truncated: Boolean(payload.truncated)
      });
    } finally {
      if (!silent) setIsLoadingLogs(false);
    }
  };

  const loadSources = async () => {
    const payload = await apiFetch("/api/admin/sources");
    setSources(payload.sources || []);
  };

  const loadUsers = async () => {
    const payload = await apiFetch("/api/admin/users");
    setUsers(payload.users || []);
  };

  const loadAiConfig = async () => {
    const payload = await apiFetch("/api/admin/ai-config");
    const config = payload.config || {};
    setAiConfig((prev) => ({
      ...prev,
      hasOpenAiKey: Boolean(config.hasOpenAiKey),
      openAiKeyMasked: config.openAiKeyMasked || null,
      embeddingModel: config.embeddingModel || prev.embeddingModel,
      explanationModel: config.explanationModel || prev.explanationModel,
      matchSensitivity:
        typeof config.matchSensitivity === "number" ? config.matchSensitivity : prev.matchSensitivity,
      matchReasonPrompt: config.matchReasonPrompt || prev.matchReasonPrompt,
      autoSyncEmbeddings:
        typeof config.autoSyncEmbeddings === "boolean"
          ? config.autoSyncEmbeddings
          : prev.autoSyncEmbeddings,
      openAiKey: ""
    }));
  };

  const loadGenres = async () => {
    const payload = await apiFetch("/api/admin/genres");
    setGenres(payload.genres || []);
  };

  const loadVideos = async (query = videosQuery) => {
    setIsLoadingVideos(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(query.page || 1));
      params.set("limit", String(query.limit || 25));
      if (query.search) params.set("search", query.search);
      if (query.folder) params.set("folder", query.folder);
      if (query.sourceId) params.set("sourceId", query.sourceId);
      const payload = await apiFetch(`/api/admin/videos?${params.toString()}`);
      setVideosData(payload);
    } finally {
      setIsLoadingVideos(false);
    }
  };


  useEffect(() => {
    const load = async () => {
      try {
        setPageError("");
        if (activeTab === "system") {
          await Promise.all([loadSystem(), loadSyncErrors(syncErrorFilter), loadSyncLogs()]);
        }
        if (activeTab === "sources") await loadSources();
        if (activeTab === "users") await loadUsers();
        if (activeTab === "videos") await loadVideos();
        if (activeTab === "settings") await loadAiConfig();
        if (activeTab === "genres") await loadGenres();
      } catch (error) {
        setPageError(error.message);
      }
    };
    load();
  }, [activeTab, syncErrorFilter]);

  useEffect(() => {
    if (activeTab !== "videos") return;
    loadVideos(videosQuery).catch((error) => setPageError(error.message));
  }, [videosQuery, activeTab]);

  useEffect(() => {
    if (activeTab !== "system") return;
    const hasRunningRun = (systemData?.recentRuns || []).some((run) => ["queued", "running"].includes(run.status));
    if (!hasRunningRun) return;

    const intervalId = window.setInterval(() => {
      loadSystem().catch(() => {});
      loadSyncLogs({ silent: true }).catch(() => {});
    }, 5000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [activeTab, systemData?.recentRuns]);

  const stats = [
    {
      label: "Total Videos Indexed",
      value: Number(systemData?.stats?.totalVideosIndexed || 0).toLocaleString(),
      icon: "Video"
    },
    {
      label: "Active Data Sources",
      value: Number(systemData?.stats?.activeDataSources || 0).toLocaleString(),
      icon: "Database"
    },
    {
      label: "SSO Active Users",
      value: Number(systemData?.stats?.activeUsers || 0).toLocaleString(),
      icon: "Users"
    }
  ];

  const resetMessages = () => {
    setPageError("");
    setPageSuccess("");
  };

  const handleAddSource = async (e) => {
    e.preventDefault();
    try {
      resetMessages();
      if (!sourceForm.name.trim()) throw new Error("Source name is required.");
      const url = sourceForm.id ? `/api/admin/sources/${sourceForm.id}` : "/api/admin/sources";
      const method = sourceForm.id ? "PATCH" : "POST";
      await apiFetch(url, {
        method,
        body: JSON.stringify({
          name: sourceForm.name,
          accessToken: sourceForm.accessToken,
          status: sourceForm.status
        })
      });
      const message = sourceForm.id ? "Source updated successfully" : "Source added successfully";
      setPageSuccess(sourceForm.id ? "Source updated." : "Source added.");
      toast.success(message);
      setIsAddingSource(false);
      setSourceForm({
        id: null,
        name: "",
        accessToken: "",
        status: "connected"
      });
      await loadSources();
      await loadSystem();
    } catch (error) {
      setPageError(error.message);
      toast.error(error.message || "Failed to save source");
    }
  };

  const handleSync = async () => {
    try {
      resetMessages();
      setIsSyncing(true);
      toast.message("Global sync queued");
      await apiFetch("/api/admin/system/sync", {
        method: "POST",
        body: JSON.stringify({
          runTypeTag: manualSyncMode,
          resetCursor: sourceSyncStartMode === "first_page"
        })
      });
      setPageSuccess("Global sync queued.");
      toast.success("Sync queued");
      await loadSources();
      await Promise.all([loadSystem(), loadSyncErrors(syncErrorFilter)]);
    } catch (error) {
      setPageError(error.message);
      toast.error(error.message || "Sync failed");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRebuildEmbeddings = async () => {
    try {
      resetMessages();
      setIsRebuildingEmbeddings(true);
      toast.message("Embedding rebuild started");
      const result = await apiFetch("/api/admin/system/rebuild-embeddings", {
        method: "POST",
        body: JSON.stringify({})
      });

      if (result.status === "skipped") {
        setPageError(result.reason || "Embedding rebuild skipped.");
        toast.error(result.reason || "Embedding rebuild skipped");
      } else {
        setPageSuccess("Embedding rebuild completed.");
        toast.success("Embeddings rebuilt");
      }

      await Promise.all([loadSystem(), loadSyncErrors(syncErrorFilter)]);
    } catch (error) {
      setPageError(error.message);
      toast.error(error.message || "Embedding rebuild failed");
    } finally {
      setIsRebuildingEmbeddings(false);
    }
  };

  const handleRetryRun = async ({ syncRunId = null, syncErrorId = null } = {}) => {
    try {
      const retryTargetId = syncErrorId || syncRunId;
      if (!retryTargetId) return;
      resetMessages();
      setRetryingRunId(retryTargetId);
      toast.message("Retry sync queued");
      await apiFetch("/api/admin/system/retry", {
        method: "POST",
        body: JSON.stringify(syncErrorId ? { syncErrorId } : { syncRunId })
      });
      setPageSuccess("Retry sync queued.");
      toast.success("Retry sync queued");
      await loadSources();
      await Promise.all([loadSystem(), loadSyncErrors(syncErrorFilter)]);
    } catch (error) {
      setPageError(error.message);
      toast.error(error.message || "Retry sync failed");
    } finally {
      setRetryingRunId(null);
    }
  };

  const handleRetryAllErrors = async () => {
    try {
      resetMessages();
      setIsRetryingAllErrors(true);
      toast.message("Retrying all open sync errors...");
      const result = await apiFetch("/api/admin/system/errors", {
        method: "POST",
        body: JSON.stringify({ action: "retry_all" })
      });

      if (result.status === "accepted") {
        setPageSuccess("Retry-all queued for open sync errors.");
        toast.success("Retry-all queued");
      } else {
        setPageError(result.reason || "No open errors to retry.");
        toast.error(result.reason || "No open errors to retry.");
      }

      await Promise.all([loadSystem(), loadSyncErrors(syncErrorFilter)]);
    } catch (error) {
      setPageError(error.message);
      toast.error(error.message || "Retry-all failed");
    } finally {
      setIsRetryingAllErrors(false);
    }
  };

  const handleSourceSync = async (sourceId) => {
    try {
      const resetCursor = sourceSyncStartMode === "first_page";
      resetMessages();
      setSyncingSourceIds((prev) => (prev.includes(sourceId) ? prev : [...prev, sourceId]));
      setSources((prev) =>
        prev.map((source) =>
          source.id === sourceId
            ? {
                ...source,
                status: "syncing"
              }
            : source
        )
      );
      setSystemData((prev) => {
        const source = (sources || []).find((item) => item.id === sourceId);
        const sourceName = source?.name || "Unknown";
        const hasRunningForSource = (prev.recentRuns || []).some(
          (run) => ["queued", "running"].includes(run.status) && run.sourceName === sourceName
        );
        if (hasRunningForSource) return prev;
        const localRun = {
          id: `local-${sourceId}-${Date.now()}`,
          sourceName,
          status: "queued",
          trigger: "manual",
          notes: null,
          retryOfRunId: null,
          startedAt: null,
          createdAt: new Date().toISOString(),
          finishedAt: null,
          errorCount: 0,
          videosScanned: 0,
          videosProcessed: 0,
          videosCreated: 0,
          videosUpdated: 0,
          embeddingsCreated: 0,
          canRetry: false
        };
        return {
          ...prev,
          recentRuns: [localRun, ...(prev.recentRuns || [])].slice(0, 10)
        };
      });
      toast.message("Source sync queued");
      await apiFetch(`/api/admin/sources/${sourceId}/sync`, {
        method: "POST",
        body: JSON.stringify({ ingestOnly: true, resetCursor })
      });
      setPageSuccess("Source sync queued.");
      toast.success("Source sync queued");
      await loadSources();
      await loadSystem();
    } catch (error) {
      setPageError(error.message);
      toast.error(error.message || "Source sync failed");
      await loadSources();
      await loadSystem();
    } finally {
      setSyncingSourceIds((prev) => prev.filter((id) => id !== sourceId));
    }
  };

  const handleResetSourceCursor = async (sourceId) => {
    try {
      resetMessages();
      await apiFetch(`/api/admin/sources/${sourceId}`, {
        method: "PATCH",
        body: JSON.stringify({ resetSyncCursor: true })
      });
      setPageSuccess("Sync cursor reset.");
      toast.success("Source sync cursor reset");
      await loadSources();
    } catch (error) {
      setPageError(error.message);
      toast.error(error.message || "Failed to reset sync cursor");
    }
  };

  const handleSourceTest = async (sourceId) => {
    try {
      resetMessages();
      setSourceTestId(sourceId);
      toast.message("Testing source token...");
      const payload = await apiFetch(`/api/admin/sources/${sourceId}/test`, {
        method: "POST",
        body: JSON.stringify({})
      });
      const accountName = payload?.result?.accountName;
      setPageSuccess(accountName ? `Source token valid (${accountName}).` : "Source token is valid.");
      toast.success(accountName ? `Source connected: ${accountName}` : "Source token is valid");
    } catch (error) {
      setPageError(error.message);
      toast.error(error.message || "Source token test failed");
    } finally {
      setSourceTestId(null);
    }
  };

  const handleSourceRebuildEmbeddings = async (sourceId) => {
    try {
      resetMessages();
      setSourceRebuildId(sourceId);
      toast.message("Source embedding rebuild started");
      const result = await apiFetch(`/api/admin/sources/${sourceId}/rebuild-embeddings`, {
        method: "POST",
        body: JSON.stringify({})
      });

      if (result.status === "skipped") {
        setPageError(result.reason || "Embedding rebuild skipped.");
        toast.error(result.reason || "Embedding rebuild skipped");
      } else {
        setPageSuccess("Source embedding rebuild completed.");
        toast.success("Source embeddings rebuilt");
      }
      await Promise.all([loadSystem(), loadSyncErrors(syncErrorFilter)]);
    } catch (error) {
      setPageError(error.message);
      toast.error(error.message || "Source embedding rebuild failed");
    } finally {
      setSourceRebuildId(null);
    }
  };

  const handleSourceDeactivate = async (sourceId, sourceName = "source") => {
    try {
      setIsDeletingSource(true);
      resetMessages();
      await apiFetch(`/api/admin/sources/${sourceId}`, { method: "DELETE" });
      setPageSuccess("Source disabled.");
      toast.success("Source deleted successfully");
      await loadSources();
      await loadSystem();
      setConfirmDialog({ open: false, sourceId: null, sourceName: "" });
    } catch (error) {
      setPageError(error.message);
      toast.error(error.message || "Failed to delete source");
    } finally {
      setIsDeletingSource(false);
    }
  };

  const startEditSource = (source) => {
    setSourceForm({
      id: source.id,
      name: source.name || "",
      accessToken: "",
      status: source.status || "connected"
    });
    setIsAddingSource(true);
  };

  const handleAiUpdate = (field, value) => {
    setAiConfig((prev) => ({ ...prev, [field]: value }));
  };

  const openVideoEditor = async (videoId) => {
    try {
      setVideoEditor((prev) => ({ ...prev, open: true, loading: true, id: videoId }));
      const payload = await apiFetch(`/api/admin/videos/${videoId}`);
      const video = payload.video;
      setVideoEditor({
        open: true,
        loading: false,
        saving: false,
        id: video.id,
        original: video,
        form: {
          title: video.title || "",
          description: video.description || "",
          tags: (video.tags || []).join(", "),
          internalNotes: video.metadata?.adminLocal?.internalNotes || "",
          classificationOverride: video.metadata?.adminLocal?.classificationOverride || "",
          searchKeywords: Array.isArray(video.metadata?.adminLocal?.searchKeywords)
            ? video.metadata.adminLocal.searchKeywords.join(", ")
            : "",
          manualCategoryOverride: video.metadata?.adminLocal?.manualCategoryOverride || ""
        }
      });
    } catch (error) {
      setPageError(error.message);
      toast.error(error.message || "Failed to load video");
      setVideoEditor((prev) => ({ ...prev, open: false, loading: false }));
    }
  };

  const submitVideoUpdate = async () => {
    if (!videoEditor.id) return;
    try {
      setVideoEditor((prev) => ({ ...prev, saving: true }));
      const payload = await apiFetch(`/api/admin/videos/${videoEditor.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          vimeo: {
            title: videoEditor.form.title,
            description: videoEditor.form.description,
            tags: videoEditor.form.tags
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean)
          },
          localOnly: {
            internalNotes: videoEditor.form.internalNotes,
            classificationOverride: videoEditor.form.classificationOverride,
            searchKeywords: videoEditor.form.searchKeywords
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean),
            manualCategoryOverride: videoEditor.form.manualCategoryOverride
          }
        })
      });
      toast.success("Video metadata updated in Vimeo and Vault");
      if (payload?.warnings?.length) {
        toast.error(payload.warnings[0].message || "Update completed with warning");
      }
      setVideoEditor((prev) => ({ ...prev, open: false, saving: false }));
      setVideoUpdateConfirmOpen(false);
      await loadVideos(videosQuery);
    } catch (error) {
      setVideoEditor((prev) => ({ ...prev, saving: false }));
      setPageError(error.message);
      toast.error(error.message || "Video update failed");
    }
  };

  const saveAiConfig = async () => {
    try {
      resetMessages();
      setSaveStatus("Saving changes...");
      await apiFetch("/api/admin/ai-config", {
        method: "PUT",
        body: JSON.stringify({
          openAiKey: aiConfig.openAiKey,
          embeddingModel: aiConfig.embeddingModel,
          explanationModel: aiConfig.explanationModel,
          matchSensitivity: aiConfig.matchSensitivity,
          matchReasonPrompt: aiConfig.matchReasonPrompt,
          autoSyncEmbeddings: aiConfig.autoSyncEmbeddings
        })
      });
      await loadAiConfig();
      setSaveStatus("All changes saved");
      setPageSuccess("AI configuration updated.");
      toast.success("AI settings saved");
    } catch (error) {
      setSaveStatus("");
      setPageError(error.message);
      toast.error(error.message || "Failed to save AI settings");
    }
  };

  const saveGenre = async (e) => {
    e.preventDefault();
    try {
      resetMessages();
      if (!genreForm.name.trim()) throw new Error("Genre name is required.");
      const url = genreForm.id ? `/api/admin/genres/${genreForm.id}` : "/api/admin/genres";
      const method = genreForm.id ? "PATCH" : "POST";
      await apiFetch(url, {
        method,
        body: JSON.stringify({
          name: genreForm.name,
          description: genreForm.description
        })
      });
      setPageSuccess(genreForm.id ? "Genre updated." : "Genre created.");
      toast.success(genreForm.id ? "Genre updated successfully" : "Genre added successfully");
      setGenreForm({ id: null, name: "", description: "" });
      await loadGenres();
      notifyDataChanged(["/api/search/genres"]);
    } catch (error) {
      setPageError(error.message);
      toast.error(error.message || "Failed to save genre");
    }
  };

  const deleteGenre = async (id) => {
    try {
      setIsDeletingGenre(true);
      resetMessages();
      await apiFetch(`/api/admin/genres/${id}`, { method: "DELETE" });
      setPageSuccess("Genre removed.");
      toast.success("Genre deleted successfully");
      if (genreForm.id === id) {
        setGenreForm({ id: null, name: "", description: "" });
      }
      await loadGenres();
      notifyDataChanged(["/api/search/genres"]);
      setGenreConfirmDialog({ open: false, genreId: null, genreName: "" });
    } catch (error) {
      setPageError(error.message);
      toast.error(error.message || "Failed to delete genre");
    } finally {
      setIsDeletingGenre(false);
    }
  };


  const handleSyncErrorStatus = async (errorId, status) => {
    try {
      if (!errorId || !status) return;
      setErrorActionId(errorId);
      resetMessages();
      await apiFetch(`/api/admin/system/errors/${errorId}`, {
        method: "PATCH",
        body: JSON.stringify({ status })
      });
      setPageSuccess(`Sync error marked as ${status}.`);
      toast.success(`Error marked ${status}`);
      await Promise.all([loadSystem(), loadSyncErrors(syncErrorFilter)]);
    } catch (error) {
      setPageError(error.message);
      toast.error(error.message || "Failed to update sync error");
    } finally {
      setErrorActionId(null);
    }
  };

  const handleTruncateData = async () => {
    try {
      setIsTruncatingData(true);
      resetMessages();
      await apiFetch("/api/admin/system/truncate", {
        method: "POST",
        body: JSON.stringify({})
      });
      setPageSuccess("Operational data truncated successfully.");
      toast.success("Operational data truncated");
      setTruncateConfirmOpen(false);
      await Promise.all([loadSystem(), loadSyncErrors(syncErrorFilter), loadSources(), loadGenres()]);
    } catch (error) {
      setPageError(error.message);
      toast.error(error.message || "Failed to truncate data");
    } finally {
      setIsTruncatingData(false);
    }
  };

  return (
    <div className="flex flex-col gap-10 pb-20">
      <div className="bg-[#3d4a55] p-10 rounded-[3.5rem] border border-white/10 shadow-2xl">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
          <div className="text-left">
            <h1 className="text-4xl font-bold text-white mb-2 tracking-tighter">Vault Control</h1>
            <p className="text-vicinity-peach/60 font-medium">Infrastructure & data source management.</p>
          </div>
          <div className="flex bg-[#4a5a67] p-2 rounded-2xl border border-white/5">
            {[
              { id: "system", label: "System", icon: "Settings" },
              { id: "sources", label: "Sources", icon: "Database" },
              { id: "videos", label: "Videos", icon: "Video" },
              { id: "users", label: "Users", icon: "Users" },
              { id: "settings", label: "AI Config", icon: "Cpu" },
              { id: "genres", label: "Genres", icon: "Tags" }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  activeTab === tab.id ? "bg-vicinity-peach text-vicinity-slate shadow-lg" : "text-vicinity-peach/40 hover:text-vicinity-peach"
                }`}
              >
                <SafeIcon name={tab.icon} /> {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {pageError && <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm font-bold px-6 py-4 rounded-2xl">{pageError}</div>}
      {pageSuccess && <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm font-bold px-6 py-4 rounded-2xl">{pageSuccess}</div>}

      {activeTab === "system" && (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {stats.map((stat) => (
              <div key={stat.label} className="bg-[#3d4a55] p-8 rounded-[2.5rem] border border-white/10 shadow-xl flex items-center gap-6">
                <div className="w-16 h-16 bg-[#4a5a67] rounded-2xl flex items-center justify-center border border-vicinity-peach/10">
                  <SafeIcon name={stat.icon} className="text-vicinity-peach text-3xl" />
                </div>
                <div className="text-left">
                  <p className="text-[10px] font-black text-vicinity-peach/40 uppercase tracking-widest mb-1">{stat.label}</p>
                  <p className="text-3xl font-bold text-white tracking-tight">{stat.value}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="bg-[#3d4a55] rounded-[3rem] border border-white/10 p-8 shadow-xl">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="text-left">
                <h3 className="text-xl font-bold text-white tracking-tight">Environment Health</h3>
                <p className="text-xs text-vicinity-peach/40 mt-1 uppercase tracking-widest font-black">
                  Runtime readiness for auth, sync, and search pipelines.
                </p>
              </div>
              <span
                className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border ${
                  systemData.health?.ok
                    ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                    : "bg-red-500/10 text-red-300 border-red-500/30"
                }`}
              >
                {systemData.health?.ok ? "Healthy" : "Needs Attention"}
              </span>
            </div>
            <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-black/20 rounded-2xl p-4 text-left">
                <p className="text-[10px] text-vicinity-peach/40 uppercase tracking-widest font-black">DB URL</p>
                <p className="mt-2 text-sm font-bold text-white">{systemData.health?.checks?.hasDatabaseUrl ? "Configured" : "Missing"}</p>
              </div>
              <div className="bg-black/20 rounded-2xl p-4 text-left">
                <p className="text-[10px] text-vicinity-peach/40 uppercase tracking-widest font-black">Auth Secret</p>
                <p className="mt-2 text-sm font-bold text-white">{systemData.health?.checks?.hasNextAuthSecret ? "Configured" : "Missing"}</p>
              </div>
              <div className="bg-black/20 rounded-2xl p-4 text-left">
                <p className="text-[10px] text-vicinity-peach/40 uppercase tracking-widest font-black">Google SSO</p>
                <p className="mt-2 text-sm font-bold text-white">{systemData.health?.checks?.hasGoogleSso ? "Configured" : "Missing"}</p>
              </div>
              <div className="bg-black/20 rounded-2xl p-4 text-left">
                <p className="text-[10px] text-vicinity-peach/40 uppercase tracking-widest font-black">Last Sync</p>
                <p className="mt-2 text-sm font-bold text-white">
                  {systemData.health?.checks?.lastSyncAt
                    ? new Date(systemData.health.checks.lastSyncAt).toLocaleString()
                    : "Never"}
                </p>
              </div>
            </div>
            {(systemData.health?.warnings?.length || 0) > 0 && (
              <div className="mt-6 rounded-2xl border border-red-500/30 bg-red-500/10 p-5 text-left">
                <p className="text-[10px] font-black uppercase tracking-widest text-red-200 mb-3">Warnings</p>
                <div className="space-y-2">
                  {systemData.health.warnings.map((item) => (
                    <p key={item.code} className="text-sm text-red-100/90">
                      {item.message}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="bg-[#3d4a55] rounded-[3rem] border border-white/10 p-10 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 shadow-xl">
            <div className="text-left">
              <h3 className="text-xl font-bold text-white tracking-tight">Global Re-Indexing</h3>
              <p className="text-xs text-vicinity-peach/40 mt-1 uppercase tracking-widest font-black">Refresh all {systemData?.stats?.activeDataSources || 0} active data sources.</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
              <select
                value={manualSyncMode}
                onChange={(e) => setManualSyncMode(e.target.value)}
                disabled={isSyncing}
                className="bg-[#4a5a67] text-vicinity-peach px-5 py-4 rounded-2xl font-black uppercase tracking-widest text-xs border border-white/10 outline-none disabled:opacity-60"
              >
                <option value="ingest_only">Fast Sync</option>
                <option value="baseline_full_sync">Full Sync</option>
              </select>
              <div className="flex items-center gap-4 px-4 py-3 rounded-2xl border border-white/10 bg-[#4a5a67]">
                <label className="inline-flex items-center gap-2 text-[10px] uppercase tracking-widest font-black text-white/80 cursor-pointer">
                  <input
                    type="radio"
                    name="global-sync-start-mode"
                    value="cursor"
                    checked={sourceSyncStartMode === "cursor"}
                    onChange={() => setSourceSyncStartMode("cursor")}
                    className="accent-vicinity-peach"
                    disabled={isSyncing}
                  />
                  Cursor page
                </label>
                <label className="inline-flex items-center gap-2 text-[10px] uppercase tracking-widest font-black text-white/80 cursor-pointer">
                  <input
                    type="radio"
                    name="global-sync-start-mode"
                    value="first_page"
                    checked={sourceSyncStartMode === "first_page"}
                    onChange={() => setSourceSyncStartMode("first_page")}
                    className="accent-vicinity-peach"
                    disabled={isSyncing}
                  />
                  First page
                </label>
              </div>
              <button
                onClick={handleRebuildEmbeddings}
                disabled={isRebuildingEmbeddings}
                className="bg-[#4a5a67] text-vicinity-peach px-8 py-4 rounded-2xl font-black hover:bg-[#526472] transition-all flex items-center justify-center gap-3 uppercase tracking-widest text-xs disabled:opacity-60"
              >
                <SafeIcon name="Cpu" className={isRebuildingEmbeddings ? "animate-spin" : ""} />
                {isRebuildingEmbeddings ? "Rebuilding..." : "Rebuild Embeddings"}
              </button>
              <button onClick={handleSync} disabled={isSyncing} className="bg-vicinity-peach text-vicinity-slate px-10 py-5 rounded-2xl font-black hover:bg-white transition-all flex items-center justify-center gap-3 uppercase tracking-widest text-xs disabled:opacity-60">
                <SafeIcon name="RefreshCw" className={isSyncing ? "animate-spin" : ""} />
                {isSyncing ? "Queueing Sync..." : "Manual Sync All"}
              </button>
              <button
                onClick={() => setTruncateConfirmOpen(true)}
                disabled={isTruncatingData}
                className="bg-red-500/20 border border-red-500/40 text-red-200 px-8 py-4 rounded-2xl font-black hover:bg-red-500/30 transition-all flex items-center justify-center gap-3 uppercase tracking-widest text-xs disabled:opacity-60"
              >
                <SafeIcon name="Trash2" className={isTruncatingData ? "animate-pulse" : ""} />
                {isTruncatingData ? "Truncating..." : "Truncate Data"}
              </button>
            </div>
          </div>

          <div className="bg-[#3d4a55] rounded-[3rem] border border-white/10 shadow-2xl overflow-hidden">
            <div className="px-10 py-6 border-b border-white/5 bg-[#43525e] text-left">
              <h3 className="text-lg font-bold text-white tracking-tight">Recent Operations</h3>
              <p className="text-[10px] text-vicinity-peach/40 uppercase tracking-widest font-black mt-1">Latest sync and embedding rebuild runs.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#323d47] text-vicinity-peach/40 uppercase text-[10px] font-black tracking-[0.2em]">
                  <tr>
                    <th className="px-8 py-4">Source</th>
                    <th className="px-8 py-4">Operation</th>
                    <th className="px-8 py-4">Status</th>
                    <th className="px-8 py-4">Progress</th>
                    <th className="px-8 py-4">Errors</th>
                    <th className="px-8 py-4">Started</th>
                    <th className="px-8 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {(systemData.recentRuns || []).map((run) => {
                    const total = Number(run.videosScanned || 0);
                    const processed = Math.min(Number(run.videosProcessed || 0), total || Number.MAX_SAFE_INTEGER);
                    const progressText =
                      total > 0 ? `${processed.toLocaleString()} / ${total.toLocaleString()}` : "-";

                    return (
                      <tr key={run.id} className="hover:bg-white/5 transition-colors">
                        <td className="px-8 py-5 text-white font-bold">{run.sourceName}</td>
                        <td className="px-8 py-5 text-white/50 font-black uppercase tracking-widest text-[10px]">
                          {`${formatRunTriggerLabel(run.trigger)} • ${formatRunOperationLabel(run)}`}
                        </td>
                        <td className="px-8 py-5">
                          <span
                            className={`px-3 py-1 rounded-full text-[8px] font-black border uppercase tracking-widest ${
                              run.status === "success"
                                ? "bg-green-500/10 text-green-400 border-green-500/20"
                                : ["queued", "running"].includes(run.status)
                                ? "bg-blue-500/10 text-blue-300 border-blue-500/20"
                                : run.status === "partial"
                                ? "bg-yellow-500/10 text-yellow-300 border-yellow-500/20"
                                : "bg-red-500/10 text-red-300 border-red-500/20"
                            }`}
                          >
                            {run.status}
                          </span>
                        </td>
                        <td className="px-8 py-5 text-white/80 font-bold">{progressText}</td>
                        <td className="px-8 py-5 text-vicinity-peach font-bold">{run.errorCount || 0}</td>
                        <td className="px-8 py-5 text-white/40 font-medium">
                          {run.startedAt || run.createdAt
                            ? new Date(run.startedAt || run.createdAt).toLocaleString()
                            : "-"}
                        </td>
                        <td className="px-8 py-5 text-right">
                          {run.canRetry && !String(run.notes || "").includes("embedding_rebuild") ? (
                            <button
                              onClick={() => handleRetryRun({ syncRunId: run.id })}
                              disabled={retryingRunId === run.id}
                              className="px-4 py-2 rounded-xl bg-[#4a5a67] text-vicinity-peach hover:bg-[#526472] text-[10px] font-black uppercase tracking-widest disabled:opacity-60"
                            >
                              {retryingRunId === run.id ? "Retrying..." : "Retry Full Run"}
                            </button>
                          ) : (
                            <span className="text-white/20 text-[10px] font-black uppercase tracking-widest">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {(systemData.recentRuns || []).length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-8 py-10 text-center text-white/40 font-bold">
                        No operations yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-[#3d4a55] rounded-[3rem] border border-white/10 shadow-2xl overflow-hidden">
            <div className="px-10 py-6 border-b border-white/5 bg-[#43525e] flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="text-left">
                <h3 className="text-lg font-bold text-white tracking-tight">Sync Errors</h3>
                <p className="text-[10px] text-vicinity-peach/40 uppercase tracking-widest font-black mt-1">
                  Operational error queue for sync and embeddings.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRetryAllErrors}
                  disabled={syncErrorFilter !== "open" || isRetryingAllErrors || syncErrors.length === 0}
                  className="px-4 py-2 rounded-xl bg-blue-500/20 text-blue-200 text-[10px] font-black uppercase tracking-widest disabled:opacity-40"
                >
                  {isRetryingAllErrors ? "Retrying All..." : "Retry All"}
                </button>
                {[
                  { id: "open", label: "Open" },
                  { id: "retrying", label: "Retrying" },
                  { id: "resolved", label: "Resolved" },
                  { id: "ignored", label: "Ignored" }
                ].map((filter) => (
                  <button
                    key={filter.id}
                    onClick={() => setSyncErrorFilter(filter.id)}
                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                      syncErrorFilter === filter.id
                        ? "bg-vicinity-peach text-vicinity-slate"
                        : "bg-[#4a5a67] text-vicinity-peach/70 hover:text-vicinity-peach"
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#323d47] text-vicinity-peach/40 uppercase text-[10px] font-black tracking-[0.2em]">
                  <tr>
                    <th className="px-8 py-4">Source</th>
                    <th className="px-8 py-4">Stage</th>
                    <th className="px-8 py-4">Message</th>
                    <th className="px-8 py-4">Created</th>
                    <th className="px-8 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {syncErrors.map((row) => (
                    <tr key={row.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-8 py-5">
                        <p className="text-white font-bold">{row.source?.name || "Unknown"}</p>
                        <p className="text-white/30 text-[10px] font-black uppercase tracking-widest mt-1">
                          Retry Count: {row.retryCount || 0}
                        </p>
                      </td>
                      <td className="px-8 py-5 text-vicinity-peach/70 font-black uppercase tracking-widest text-[10px]">
                        {row.stage}
                      </td>
                      <td className="px-8 py-5 max-w-[28rem]">
                        <p className="text-white/70 line-clamp-2">{row.message}</p>
                        {row.video?.title && (
                          <p className="text-white/30 text-[10px] font-black uppercase tracking-widest mt-2">
                            Video: {row.video.title}
                          </p>
                        )}
                      </td>
                      <td className="px-8 py-5 text-white/40 font-medium">
                        {row.createdAt ? new Date(row.createdAt).toLocaleString() : "-"}
                      </td>
                      <td className="px-8 py-5 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleRetryRun({ syncErrorId: row.id })}
                            disabled={
                              !row.id ||
                              row.status === "retrying" ||
                              retryingRunId === row.id
                            }
                            className="px-3 py-2 rounded-xl bg-blue-500/20 text-blue-200 text-[10px] font-black uppercase tracking-widest disabled:opacity-40"
                          >
                            {retryingRunId === row.id ? "Retrying..." : "Retry"}
                          </button>
                          <button
                            onClick={() => handleSyncErrorStatus(row.id, "resolved")}
                            disabled={errorActionId === row.id || row.status === "resolved"}
                            className="px-3 py-2 rounded-xl bg-emerald-500/20 text-emerald-200 text-[10px] font-black uppercase tracking-widest disabled:opacity-40"
                          >
                            Resolve
                          </button>
                          <button
                            onClick={() => handleSyncErrorStatus(row.id, row.status === "ignored" ? "open" : "ignored")}
                            disabled={errorActionId === row.id}
                            className="px-3 py-2 rounded-xl bg-white/10 text-white/70 text-[10px] font-black uppercase tracking-widest disabled:opacity-40"
                          >
                            {row.status === "ignored" ? "Reopen" : "Ignore"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {syncErrors.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-8 py-10 text-center text-white/40 font-bold">
                        No sync errors in this state.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-[#3d4a55] rounded-[3rem] border border-white/10 shadow-2xl overflow-hidden">
            <div className="px-10 py-6 border-b border-white/5 bg-[#43525e] flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="text-left">
                <h3 className="text-lg font-bold text-white tracking-tight">Sync Logs</h3>
                <p className="text-[10px] text-vicinity-peach/40 uppercase tracking-widest font-black mt-1">
                  Tail view of sync process logs.
                </p>
              </div>
              <button
                onClick={() => loadSyncLogs()}
                disabled={isLoadingLogs}
                className="px-4 py-2 rounded-xl bg-[#4a5a67] text-vicinity-peach hover:bg-[#526472] text-[10px] font-black uppercase tracking-widest disabled:opacity-60 flex items-center gap-2"
              >
                <SafeIcon name="RefreshCw" className={isLoadingLogs ? "animate-spin" : ""} />
                {isLoadingLogs ? "Refreshing..." : "Refresh Logs"}
              </button>
            </div>
            <div className="px-10 py-4 text-left border-b border-white/5 bg-black/20">
              <p className="text-[10px] text-vicinity-peach/40 uppercase tracking-widest font-black">
                {syncLogs.filePath ? `File: ${syncLogs.filePath}` : "File: not available"}
              </p>
              {syncLogs.truncated && (
                <p className="text-[10px] text-white/40 font-black uppercase tracking-widest mt-2">
                  Showing latest tail only.
                </p>
              )}
            </div>
            {!syncLogs.enabled ? (
              <div className="px-10 py-10 text-left text-white/60">{syncLogs.message || "Sync file logging is disabled."}</div>
            ) : syncLogs.lines.length === 0 ? (
              <div className="px-10 py-10 text-left text-white/60">
                {syncLogs.message || "No log lines yet."}
              </div>
            ) : (
              <div className="max-h-[26rem] overflow-y-auto bg-[#1f2730]">
                <pre className="text-[11px] leading-5 text-emerald-200 p-8 whitespace-pre-wrap break-words font-mono">
                  {syncLogs.lines.join("\n")}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "sources" && (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex justify-between items-center">
              <div className="text-left">
                <h2 className="text-2xl font-bold text-white tracking-tight">Vimeo Data Sources</h2>
                <p className="text-[10px] text-vicinity-peach/40 uppercase tracking-widest font-black mt-1">Manage multiple API integrations for the semantic index.</p>
              </div>
            <button onClick={() => { setSourceForm({ id: null, name: "", accessToken: "", status: "connected" }); setIsAddingSource(true); }} className="bg-vicinity-peach text-vicinity-slate px-8 py-4 rounded-2xl font-black hover:bg-white transition-all uppercase tracking-widest text-xs flex items-center gap-2">
              <SafeIcon name="Plus" /> Add New Source
            </button>
          </div>
          <div className="bg-[#3d4a55] rounded-[3rem] border border-white/10 shadow-2xl overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#323d47] text-vicinity-peach/40 uppercase text-[10px] font-black tracking-[0.2em]">
                <tr>
                  <th className="px-10 py-5">Source Name</th>
                  <th className="px-10 py-5">Platform</th>
                  <th className="px-10 py-5">Status</th>
                  <th className="px-10 py-5">Videos</th>
                  <th className="px-10 py-5">Sync Cursor</th>
                  <th className="px-10 py-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {sources.map((source) => {
                  const isSourceSyncing = source.status === "syncing" || syncingSourceIds.includes(source.id);
                  return (
                    <tr key={source.id} className="hover:bg-white/5 transition-colors group">
                      <td className="px-10 py-6">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-[#4a5a67] flex items-center justify-center">
                            <SafeIcon name="Video" className="text-vicinity-peach text-sm" />
                          </div>
                          <span className="text-white font-bold">{source.name}</span>
                        </div>
                      </td>
                      <td className="px-10 py-6 text-white/40 font-black uppercase text-[10px] tracking-widest">{source.platform}</td>
                      <td className="px-10 py-6">
                        <span className={`px-3 py-1 rounded-full text-[8px] font-black border uppercase tracking-widest ${
                          source.status === "connected" ? "bg-green-500/10 text-green-400 border-green-500/20" :
                          source.status === "syncing" ? "bg-blue-500/10 text-blue-300 border-blue-500/20" :
                          source.status === "disabled" ? "bg-white/10 text-white/40 border-white/20" :
                          "bg-red-500/10 text-red-300 border-red-500/20"
                        }`}>{source.status}</span>
                      </td>
                      <td className="px-10 py-6 text-vicinity-peach font-bold">{Number(source.videoCount || 0).toLocaleString()}</td>
                      <td className="px-10 py-6 text-white/60 text-xs">
                        <div className="space-y-1">
                          <p>Page: <span className="text-white/80 font-bold">{source.syncCursorPage || "-"}</span></p>
                          <p className="break-all">Last ID: <span className="text-white/80 font-bold">{source.syncCursorVimeoId || "-"}</span></p>
                          <p>Updated: <span className="text-white/80 font-bold">{source.syncCursorUpdatedAt ? new Date(source.syncCursorUpdatedAt).toLocaleString() : "Never"}</span></p>
                        </div>
                      </td>
                      <td className="px-10 py-6 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleSourceTest(source.id)}
                            disabled={sourceTestId === source.id || isSourceSyncing}
                            className="p-2 text-white/20 hover:text-emerald-300 transition-colors disabled:opacity-50"
                            title="Test Token"
                          >
                            <SafeIcon name={sourceTestId === source.id ? "Loader2" : "ShieldCheck"} className={sourceTestId === source.id ? "animate-spin" : ""} />
                          </button>
                            <button
                              onClick={() => handleSourceSync(source.id)}
                              disabled={isSourceSyncing}
                              className="px-3 py-2 rounded-lg border border-white/10 text-white/70 hover:text-vicinity-peach hover:border-vicinity-peach/40 transition-colors disabled:opacity-50 text-[10px] font-black uppercase tracking-widest"
                              title={sourceSyncStartMode === "first_page" ? "Fast Sync Source From First Page" : "Fast Sync Source From Cursor"}
                            >
                              Fast Sync
                            </button>
                            <button
                              onClick={() => handleResetSourceCursor(source.id)}
                              disabled={isSourceSyncing}
                              className="p-2 text-white/20 hover:text-orange-300 transition-colors disabled:opacity-50"
                              title="Reset Sync Cursor"
                            >
                              <SafeIcon name="RotateCcw" />
                            </button>
                          <button
                            onClick={() => handleResetSourceCursor(source.id)}
                            disabled={isSourceSyncing}
                            className="p-2 text-white/20 hover:text-yellow-300 transition-colors disabled:opacity-50"
                            title="Reset Sync Cursor"
                          >
                            <SafeIcon name="Eraser" />
                          </button>
                          <button
                            onClick={() => handleSourceRebuildEmbeddings(source.id)}
                            disabled={sourceRebuildId === source.id || isSourceSyncing}
                            className="p-2 text-white/20 hover:text-vicinity-peach transition-colors disabled:opacity-50"
                            title="Rebuild Embeddings"
                          >
                            <SafeIcon name={sourceRebuildId === source.id ? "Loader2" : "Cpu"} className={sourceRebuildId === source.id ? "animate-spin" : ""} />
                          </button>
                          <button
                            onClick={() => startEditSource(source)}
                            disabled={isSourceSyncing}
                            className="p-2 text-white/20 hover:text-blue-300 transition-colors disabled:opacity-50"
                            title="Edit Source"
                          >
                            <SafeIcon name="Edit2" />
                          </button>
                          <button
                            onClick={() =>
                              setConfirmDialog({
                                open: true,
                                sourceId: source.id,
                                sourceName: source.name
                              })
                            }
                            disabled={isSourceSyncing}
                            className="p-2 text-white/20 hover:text-red-500 transition-colors disabled:opacity-50"
                            title="Disable Source"
                          >
                            <SafeIcon name="Trash2" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "videos" && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="bg-[#3d4a55] rounded-[2rem] border border-white/10 p-6">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <input
                value={videosQuery.search}
                onChange={(e) => setVideosQuery((prev) => ({ ...prev, search: e.target.value, page: 1 }))}
                placeholder="Search title / Vimeo ID / tag"
                className="px-4 py-3 rounded-xl bg-[#4a5a67] border border-white/10 text-white"
              />
              <select
                value={videosQuery.folder}
                onChange={(e) => setVideosQuery((prev) => ({ ...prev, folder: e.target.value, page: 1 }))}
                className="px-4 py-3 rounded-xl bg-[#4a5a67] border border-white/10 text-white"
              >
                <option value="">All Folders</option>
                {(videosData.filters?.folders || []).map((folder) => (
                  <option key={folder} value={folder}>{folder}</option>
                ))}
              </select>
              <select
                value={videosQuery.sourceId}
                onChange={(e) => setVideosQuery((prev) => ({ ...prev, sourceId: e.target.value, page: 1 }))}
                className="px-4 py-3 rounded-xl bg-[#4a5a67] border border-white/10 text-white"
              >
                <option value="">All Sources</option>
                {(videosData.filters?.sources || []).map((source) => (
                  <option key={source.id} value={source.id}>{source.name}</option>
                ))}
              </select>
              <select
                value={videosQuery.limit}
                onChange={(e) => setVideosQuery((prev) => ({ ...prev, limit: Number(e.target.value), page: 1 }))}
                className="px-4 py-3 rounded-xl bg-[#4a5a67] border border-white/10 text-white"
              >
                <option value={25}>25 / page</option>
                <option value={50}>50 / page</option>
              </select>
              <button
                onClick={() => loadVideos(videosQuery)}
                className="px-4 py-3 rounded-xl bg-vicinity-peach text-vicinity-slate font-black uppercase text-xs"
              >
                {isLoadingVideos ? "Loading..." : "Refresh"}
              </button>
            </div>
          </div>

          <div className="bg-[#3d4a55] rounded-[2rem] border border-white/10 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#323d47] text-vicinity-peach/40 uppercase text-[10px] font-black tracking-[0.2em]">
                <tr>
                  <th className="px-4 py-3">Thumb</th>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Vimeo ID</th>
                  <th className="px-4 py-3">Duration</th>
                  <th className="px-4 py-3">Published</th>
                  <th className="px-4 py-3">Folder</th>
                  <th className="px-4 py-3">Privacy</th>
                  <th className="px-4 py-3">Tags</th>
                  <th className="px-4 py-3">Sync</th>
                  <th className="px-4 py-3">Updated</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {(videosData.items || []).map((video) => (
                  <tr key={video.id} className="hover:bg-white/5">
                    <td className="px-4 py-3">
                      {video.thumbnailUrl ? (
                        <img src={video.thumbnailUrl} alt={video.title} className="w-24 h-14 object-cover rounded-lg border border-white/10" />
                      ) : (
                        <div className="w-24 h-14 rounded-lg bg-black/20 border border-white/10" />
                      )}
                    </td>
                    <td className="px-4 py-3 text-white font-semibold max-w-[260px] truncate">{video.title}</td>
                    <td className="px-4 py-3 text-white/70">{video.vimeoVideoId}</td>
                    <td className="px-4 py-3 text-white/70">{video.durationSeconds || 0}s</td>
                    <td className="px-4 py-3 text-white/70">{video.publishedAt ? new Date(video.publishedAt).toLocaleDateString() : "-"}</td>
                    <td className="px-4 py-3 text-white/70">{video.folderName || "-"}</td>
                    <td className="px-4 py-3 text-white/70">{video.privacyView || "-"}</td>
                    <td className="px-4 py-3 text-white/70 max-w-[220px] truncate">{(video.tags || []).join(", ") || "-"}</td>
                    <td className="px-4 py-3 text-white/70">{video.syncStatus}</td>
                    <td className="px-4 py-3 text-white/70">{video.updatedAt ? new Date(video.updatedAt).toLocaleString() : "-"}</td>
                    <td className="px-4 py-3 text-right">
                      <a href={video.videoUrl} target="_blank" rel="noreferrer" className="text-vicinity-peach mr-3">Open</a>
                      <button
                        onClick={() => openVideoEditor(video.id)}
                        className="px-3 py-2 rounded-lg bg-vicinity-peach text-vicinity-slate font-black text-[10px] uppercase"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
                {!isLoadingVideos && (videosData.items || []).length === 0 && (
                  <tr>
                    <td colSpan={11} className="px-4 py-8 text-center text-white/50">No videos found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between text-white/70 text-sm">
            <p>
              Showing page {videosData.pagination?.page || 1} / {videosData.pagination?.totalPages || 1} (
              {(videosData.pagination?.total || 0).toLocaleString()} videos)
            </p>
            <div className="flex gap-2">
              <button
                disabled={(videosData.pagination?.page || 1) <= 1}
                onClick={() => setVideosQuery((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
                className="px-3 py-2 rounded-lg bg-white/10 disabled:opacity-50"
              >
                Prev
              </button>
              <button
                disabled={(videosData.pagination?.page || 1) >= (videosData.pagination?.totalPages || 1)}
                onClick={() =>
                  setVideosQuery((prev) => ({
                    ...prev,
                    page: Math.min(videosData.pagination?.totalPages || prev.page, prev.page + 1)
                  }))
                }
                className="px-3 py-2 rounded-lg bg-white/10 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === "users" && (
        <div className="bg-[#3d4a55] rounded-[3rem] border border-white/10 shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="p-10 border-b border-white/5 bg-[#43525e]">
            <h2 className="text-xl font-bold text-white tracking-tight text-left">SSO User Directory</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#323d47] text-vicinity-peach/40 uppercase text-[10px] font-black tracking-[0.2em]">
                <tr>
                  <th className="px-10 py-5">User</th>
                  <th className="px-10 py-5">Role</th>
                  <th className="px-10 py-5 text-right">Last Active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-10 py-6">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-[#4a5a67] flex items-center justify-center text-[10px] font-black text-vicinity-peach border border-white/10">{user.avatar}</div>
                        <div className="text-left">
                          <p className="text-white font-bold">{user.name}</p>
                          <p className="text-[10px] text-white/30">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-10 py-6 text-white/60 font-medium capitalize">{user.role}</td>
                    <td className="px-10 py-6 text-right text-white/40 font-medium">{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "Never"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "settings" && (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 text-left">
          <div className="flex justify-between items-end px-2">
            <div>
              <h2 className="text-2xl font-bold text-white tracking-tight">AI Semantic Configuration</h2>
              <p className="text-[10px] text-vicinity-peach/40 uppercase tracking-widest font-black mt-1">Fine-tune the intelligence powering the project index.</p>
            </div>
            {saveStatus && <span className="text-[10px] font-black uppercase tracking-widest text-vicinity-peach animate-pulse">{saveStatus}</span>}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-[#3d4a55] p-10 rounded-[3rem] border border-white/10 shadow-xl space-y-8">
              <h3 className="text-lg font-bold text-white border-b border-white/5 pb-4 flex items-center gap-3">
                <SafeIcon name="Key" className="text-vicinity-peach" /> API & Model Weights
              </h3>
              <div className="space-y-6">
                <div>
                  <label className="block text-[10px] font-black text-vicinity-peach uppercase tracking-widest mb-3">OpenAI Platform Key</label>
                  <input type="password" value={aiConfig.openAiKey} onChange={(e) => handleAiUpdate("openAiKey", e.target.value)} className="w-full px-6 py-4 bg-[#4a5a67] border border-white/10 rounded-2xl text-white font-bold text-sm focus:ring-2 focus:ring-vicinity-peach/20 outline-none transition-all" placeholder={aiConfig.openAiKeyMasked || "Set new key"} />
                  {aiConfig.hasOpenAiKey && (
                    <p className="mt-2 max-w-full overflow-hidden break-all whitespace-normal text-[10px] text-vicinity-peach/40 font-black uppercase tracking-widest">
                      Stored Key: {aiConfig.openAiKeyMasked}
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-vicinity-peach uppercase tracking-widest mb-3">Embedding Engine</label>
                    <select value={aiConfig.embeddingModel} onChange={(e) => handleAiUpdate("embeddingModel", e.target.value)} className="w-full px-6 py-4 bg-[#4a5a67] border border-white/10 rounded-2xl text-white font-bold text-sm outline-none">
                      <option value="text-embedding-3-small">text-embedding-3-small</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-vicinity-peach uppercase tracking-widest mb-3">Explanation Engine</label>
                    <select value={aiConfig.explanationModel} onChange={(e) => handleAiUpdate("explanationModel", e.target.value)} className="w-full px-6 py-4 bg-[#4a5a67] border border-white/10 rounded-2xl text-white font-bold text-sm outline-none">
                      <option value="gpt-5-nano">gpt-5-nano (Lowest Cost)</option>
                      <option value="gpt-5-mini">gpt-5-mini (Balanced)</option>
                      <option value="gpt-5">gpt-5 (High Quality)</option>
                      <option value="gpt-4o-mini">gpt-4o-mini (Legacy)</option>
                      <option value="gpt-4o">gpt-4o (Legacy Premium)</option>
                    </select>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <label className="text-[10px] font-black text-vicinity-peach uppercase tracking-widest">Match Sensitivity</label>
                    <span className="text-sm font-bold text-white">{Math.round(aiConfig.matchSensitivity * 100)}%</span>
                  </div>
                  <input type="range" min="0" max="1" step="0.05" value={aiConfig.matchSensitivity} onChange={(e) => handleAiUpdate("matchSensitivity", parseFloat(e.target.value))} className="w-full h-2 bg-[#4a5a67] rounded-lg appearance-none cursor-pointer accent-vicinity-peach" />
                </div>
              </div>
            </div>
            <div className="bg-[#3d4a55] p-10 rounded-[3rem] border border-white/10 shadow-xl space-y-8">
              <h3 className="text-lg font-bold text-white border-b border-white/5 pb-4 flex items-center gap-3">
                <SafeIcon name="Cpu" className="text-vicinity-peach" /> Semantic Explanation Logic
              </h3>
              <div className="space-y-6">
                <div>
                  <label className="block text-[10px] font-black text-vicinity-peach uppercase tracking-widest mb-3">System Logic (Match Reason Prompt)</label>
                  <textarea value={aiConfig.matchReasonPrompt} onChange={(e) => handleAiUpdate("matchReasonPrompt", e.target.value)} className="w-full px-6 py-5 bg-[#4a5a67] border border-white/10 rounded-2xl text-white font-medium text-sm h-48 resize-none focus:ring-2 focus:ring-vicinity-peach/20 outline-none transition-all leading-relaxed" />
                </div>
                <div className="flex items-center justify-between p-6 bg-black/20 rounded-2xl border border-white/5">
                  <div className="text-left">
                    <p className="text-xs font-bold text-white">Auto-Sync Embeddings</p>
                    <p className="text-[9px] text-white/30 uppercase tracking-widest font-black mt-1">Index new Vimeo videos on upload</p>
                  </div>
                  <button onClick={() => handleAiUpdate("autoSyncEmbeddings", !aiConfig.autoSyncEmbeddings)} className={`w-14 h-8 rounded-full transition-all relative ${aiConfig.autoSyncEmbeddings ? "bg-vicinity-peach" : "bg-white/10"}`}>
                    <div className={`absolute top-1 w-6 h-6 rounded-full bg-white transition-all ${aiConfig.autoSyncEmbeddings ? "right-1" : "left-1"}`} />
                  </button>
                </div>
                <button onClick={saveAiConfig} className="w-full px-6 py-4 bg-vicinity-peach text-vicinity-slate rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-white transition-all">
                  Save AI Config
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "genres" && (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="bg-[#3d4a55] p-10 rounded-[3rem] border border-white/10 shadow-xl">
            <h3 className="text-xl font-bold text-white tracking-tight mb-2">Search Priority Genres</h3>
            <p className="text-[10px] text-vicinity-peach/40 uppercase tracking-widest font-black">
              Manage the genre chips shown under search.
            </p>
            <form onSubmit={saveGenre} className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
              <input
                type="text"
                value={genreForm.name}
                onChange={(e) => setGenreForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Genre name"
                className="px-6 py-4 bg-[#4a5a67] border border-white/10 rounded-2xl text-white font-bold text-sm outline-none"
                required
              />
              <input
                type="text"
                value={genreForm.description}
                onChange={(e) => setGenreForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Description (optional)"
                className="px-6 py-4 bg-[#4a5a67] border border-white/10 rounded-2xl text-white font-bold text-sm outline-none"
              />
              <div className="flex gap-3">
                <button type="submit" className="flex-1 bg-vicinity-peach text-vicinity-slate px-6 py-4 rounded-2xl font-black uppercase tracking-widest text-xs">
                  {genreForm.id ? "Update" : "Add Genre"}
                </button>
                {genreForm.id && (
                  <button
                    type="button"
                    onClick={() => setGenreForm({ id: null, name: "", description: "" })}
                    className="px-5 py-4 bg-white/10 text-white rounded-2xl font-black uppercase tracking-widest text-xs"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </div>

          <div className="bg-[#3d4a55] rounded-[3rem] border border-white/10 shadow-2xl overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#323d47] text-vicinity-peach/40 uppercase text-[10px] font-black tracking-[0.2em]">
                <tr>
                  <th className="px-10 py-5">Name</th>
                  <th className="px-10 py-5">Slug</th>
                  <th className="px-10 py-5">Description</th>
                  <th className="px-10 py-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {genres.map((genre) => (
                  <tr key={genre.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-10 py-6 text-white font-bold">{genre.name}</td>
                    <td className="px-10 py-6 text-vicinity-peach/60 font-black text-[10px] uppercase tracking-widest">
                      {genre.slug}
                    </td>
                    <td className="px-10 py-6 text-white/50">{genre.description || "-"}</td>
                    <td className="px-10 py-6 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() =>
                            setGenreForm({
                              id: genre.id,
                              name: genre.name,
                              description: genre.description || ""
                            })
                          }
                          className="p-2 text-white/20 hover:text-blue-300 transition-colors"
                          title="Edit Genre"
                        >
                          <SafeIcon name="Edit2" />
                        </button>
                        <button
                          onClick={() =>
                            setGenreConfirmDialog({
                              open: true,
                              genreId: genre.id,
                              genreName: genre.name
                            })
                          }
                          className="p-2 text-white/20 hover:text-red-500 transition-colors"
                          title="Delete Genre"
                        >
                          <SafeIcon name="Trash2" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {genres.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-10 py-12 text-center text-white/40 font-bold">
                      No genres yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}


      {isAddingSource && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/95 backdrop-blur-2xl">
          <div className="bg-[#3d4a55] rounded-[3rem] w-full max-w-lg shadow-2xl overflow-hidden border border-white/10">
            <div className="p-10 border-b border-white/5 flex justify-between items-center bg-[#4a5a67]">
              <div className="text-left">
                <h3 className="text-2xl font-bold text-white tracking-tight">{sourceForm.id ? "Edit Video Source" : "Connect Video Source"}</h3>
                <p className="text-[10px] text-vicinity-peach/40 uppercase tracking-widest font-black mt-1">Add a new Vimeo account to the index.</p>
              </div>
              <button onClick={() => setIsAddingSource(false)} className="text-vicinity-peach/40 hover:text-vicinity-peach">
                <SafeIcon name="X" />
              </button>
            </div>
            <form onSubmit={handleAddSource} className="p-10 space-y-6 text-left">
              <div>
                <label className="block text-[10px] font-black text-vicinity-peach uppercase tracking-widest mb-3 ml-1">Account Label</label>
                <input type="text" required value={sourceForm.name} onChange={(e) => setSourceForm((prev) => ({ ...prev, name: e.target.value }))} className="w-full px-6 py-5 bg-[#4a5a67] border border-white/10 rounded-2xl text-white font-bold outline-none focus:ring-2 focus:ring-vicinity-peach/20" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-vicinity-peach uppercase tracking-widest mb-3 ml-1">Vimeo Access Token {sourceForm.id ? "(Optional to Replace)" : ""}</label>
                <input type="password" required={!sourceForm.id} value={sourceForm.accessToken} onChange={(e) => setSourceForm((prev) => ({ ...prev, accessToken: e.target.value }))} className="w-full px-6 py-5 bg-[#4a5a67] border border-white/10 rounded-2xl text-white font-bold outline-none focus:ring-2 focus:ring-vicinity-peach/20" placeholder={sourceForm.id ? "Leave blank to keep existing token" : "vimeo token"} />
              </div>
              <div>
                <label className="block text-[10px] font-black text-vicinity-peach uppercase tracking-widest mb-3 ml-1">Status</label>
                <select value={sourceForm.status} onChange={(e) => setSourceForm((prev) => ({ ...prev, status: e.target.value }))} className="w-full px-6 py-5 bg-[#4a5a67] border border-white/10 rounded-2xl text-white font-bold outline-none focus:ring-2 focus:ring-vicinity-peach/20">
                  <option value="connected">Connected</option>
                  <option value="error">Error</option>
                  <option value="disabled">Disabled</option>
                </select>
              </div>
              <div className="pt-4 flex gap-4">
                <button type="button" onClick={() => setIsAddingSource(false)} className="flex-1 px-4 py-5 bg-white/5 text-white/40 rounded-2xl font-black uppercase tracking-widest text-xs">
                  Discard
                </button>
                <button type="submit" className="flex-1 px-4 py-5 bg-vicinity-peach text-vicinity-slate rounded-2xl font-black uppercase tracking-widest text-xs shadow-2xl">
                  {sourceForm.id ? "Update" : "Connect"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {videoEditor.open && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/90">
          <div className="bg-[#3d4a55] rounded-[2rem] w-full max-w-3xl border border-white/10">
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
              <div className="text-left">
                <h3 className="text-xl font-bold text-white">Edit Video Metadata</h3>
                <p className="text-[11px] text-vicinity-peach/60">Vimeo-synced: title, description, tags. Local-only fields are separate.</p>
              </div>
              <button onClick={() => setVideoEditor((prev) => ({ ...prev, open: false }))} className="text-white/60 hover:text-white">
                <SafeIcon name="X" />
              </button>
            </div>
            {videoEditor.loading ? (
              <div className="p-8 text-white/70">Loading...</div>
            ) : (
              <div className="p-6 space-y-4">
                <div className="bg-black/20 p-3 rounded-xl text-xs text-vicinity-peach/80 text-left">
                  This will update both Vault and Vimeo.
                </div>
                <input
                  value={videoEditor.form.title}
                  onChange={(e) => setVideoEditor((prev) => ({ ...prev, form: { ...prev.form, title: e.target.value } }))}
                  placeholder="Title (Vimeo-synced)"
                  className="w-full px-4 py-3 rounded-xl bg-[#4a5a67] border border-white/10 text-white"
                />
                <textarea
                  value={videoEditor.form.description}
                  onChange={(e) => setVideoEditor((prev) => ({ ...prev, form: { ...prev.form, description: e.target.value } }))}
                  placeholder="Description (Vimeo-synced)"
                  className="w-full px-4 py-3 rounded-xl bg-[#4a5a67] border border-white/10 text-white h-28"
                />
                <input
                  value={videoEditor.form.tags}
                  onChange={(e) => setVideoEditor((prev) => ({ ...prev, form: { ...prev.form, tags: e.target.value } }))}
                  placeholder="Tags comma separated (Vimeo-synced)"
                  className="w-full px-4 py-3 rounded-xl bg-[#4a5a67] border border-white/10 text-white"
                />
                <div className="pt-2 border-t border-white/10 text-left">
                  <p className="text-xs text-vicinity-peach/70 font-black uppercase tracking-widest mb-2">Local-only</p>
                  <input
                    value={videoEditor.form.internalNotes}
                    onChange={(e) => setVideoEditor((prev) => ({ ...prev, form: { ...prev.form, internalNotes: e.target.value } }))}
                    placeholder="Internal notes"
                    className="w-full mb-2 px-4 py-3 rounded-xl bg-[#4a5a67] border border-white/10 text-white"
                  />
                  <input
                    value={videoEditor.form.classificationOverride}
                    onChange={(e) => setVideoEditor((prev) => ({ ...prev, form: { ...prev.form, classificationOverride: e.target.value } }))}
                    placeholder="AI classification override"
                    className="w-full mb-2 px-4 py-3 rounded-xl bg-[#4a5a67] border border-white/10 text-white"
                  />
                  <input
                    value={videoEditor.form.searchKeywords}
                    onChange={(e) => setVideoEditor((prev) => ({ ...prev, form: { ...prev.form, searchKeywords: e.target.value } }))}
                    placeholder="Search keywords comma separated"
                    className="w-full mb-2 px-4 py-3 rounded-xl bg-[#4a5a67] border border-white/10 text-white"
                  />
                  <input
                    value={videoEditor.form.manualCategoryOverride}
                    onChange={(e) => setVideoEditor((prev) => ({ ...prev, form: { ...prev.form, manualCategoryOverride: e.target.value } }))}
                    placeholder="Manual category override"
                    className="w-full px-4 py-3 rounded-xl bg-[#4a5a67] border border-white/10 text-white"
                  />
                </div>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setVideoEditor((prev) => ({ ...prev, open: false }))}
                    className="px-4 py-2 rounded-xl bg-white/10 text-white"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={videoEditor.saving}
                    onClick={() => setVideoUpdateConfirmOpen(true)}
                    className="px-4 py-2 rounded-xl bg-vicinity-peach text-vicinity-slate font-black"
                  >
                    {videoEditor.saving ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDialog.open}
        title="Delete source?"
        description={`This will disable "${confirmDialog.sourceName}". Existing synced videos remain in the system.`}
        confirmLabel="Delete Source"
        cancelLabel="Cancel"
        isConfirming={isDeletingSource}
        onCancel={() => {
          if (isDeletingSource) return;
          setConfirmDialog({ open: false, sourceId: null, sourceName: "" });
        }}
        onConfirm={() => {
          if (!confirmDialog.sourceId) return;
          handleSourceDeactivate(confirmDialog.sourceId, confirmDialog.sourceName);
        }}
      />

      <ConfirmDialog
        open={genreConfirmDialog.open}
        title="Delete genre?"
        description={`This will remove "${genreConfirmDialog.genreName}" from priority genre options.`}
        confirmLabel="Delete Genre"
        cancelLabel="Cancel"
        isConfirming={isDeletingGenre}
        onCancel={() => {
          if (isDeletingGenre) return;
          setGenreConfirmDialog({ open: false, genreId: null, genreName: "" });
        }}
        onConfirm={() => {
          if (!genreConfirmDialog.genreId) return;
          deleteGenre(genreConfirmDialog.genreId);
        }}
      />

      <ConfirmDialog
        open={videoUpdateConfirmOpen}
        title="Update Vimeo and Vault?"
        description="This will update both Vault and Vimeo for this video."
        confirmLabel="Yes, Save"
        cancelLabel="Cancel"
        isConfirming={videoEditor.saving}
        onCancel={() => {
          if (videoEditor.saving) return;
          setVideoUpdateConfirmOpen(false);
        }}
        onConfirm={submitVideoUpdate}
      />

      <ConfirmDialog
        open={truncateConfirmOpen}
        title="Truncate Operational Data?"
        description="This permanently clears all operational tables except _prisma_migrations, ai_configs, data_sources, and users."
        confirmLabel="Yes, Truncate"
        confirmingLabel="Truncating..."
        cancelLabel="Cancel"
        isConfirming={isTruncatingData}
        onCancel={() => {
          if (isTruncatingData) return;
          setTruncateConfirmOpen(false);
        }}
        onConfirm={handleTruncateData}
      />
    </div>
  );
}
