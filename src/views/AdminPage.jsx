"use client";

import { useEffect, useState } from "react";
import SafeIcon from "@/src/common/SafeIcon";
import { notifyDataChanged } from "@/src/lib/client-api";
import { toast } from "sonner";
import ConfirmDialog from "@/src/components/ConfirmDialog";

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState("system");
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRebuildingEmbeddings, setIsRebuildingEmbeddings] = useState(false);
  const [retryingRunId, setRetryingRunId] = useState(null);
  const [sourceRebuildId, setSourceRebuildId] = useState(null);
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
  const [syncErrorFilter, setSyncErrorFilter] = useState("open");
  const [errorActionId, setErrorActionId] = useState(null);
  const [sources, setSources] = useState([]);
  const [users, setUsers] = useState([]);
  const [genres, setGenres] = useState([]);
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
    explanationModel: "gpt-4o-mini",
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

  useEffect(() => {
    const load = async () => {
      try {
        setPageError("");
        if (activeTab === "system") {
          await Promise.all([loadSystem(), loadSyncErrors(syncErrorFilter)]);
        }
        if (activeTab === "sources") await loadSources();
        if (activeTab === "users") await loadUsers();
        if (activeTab === "settings") await loadAiConfig();
        if (activeTab === "genres") await loadGenres();
      } catch (error) {
        setPageError(error.message);
      }
    };
    load();
  }, [activeTab, syncErrorFilter]);

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
      toast.message("Global sync started");
      await apiFetch("/api/admin/system/sync", { method: "POST", body: JSON.stringify({}) });
      setPageSuccess("Global sync triggered.");
      toast.success("Sync completed");
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

  const handleRetryRun = async (syncRunId) => {
    try {
      if (!syncRunId) return;
      resetMessages();
      setRetryingRunId(syncRunId);
      toast.message("Retry sync started");
      await apiFetch("/api/admin/system/retry", {
        method: "POST",
        body: JSON.stringify({ syncRunId })
      });
      setPageSuccess("Retry sync completed.");
      toast.success("Retry sync completed");
      await loadSources();
      await Promise.all([loadSystem(), loadSyncErrors(syncErrorFilter)]);
    } catch (error) {
      setPageError(error.message);
      toast.error(error.message || "Retry sync failed");
    } finally {
      setRetryingRunId(null);
    }
  };

  const handleSourceSync = async (sourceId) => {
    try {
      resetMessages();
      toast.message("Source sync started");
      await apiFetch(`/api/admin/sources/${sourceId}/sync`, { method: "POST", body: JSON.stringify({}) });
      setPageSuccess("Source sync started.");
      toast.success("Source sync completed");
      await loadSources();
      await loadSystem();
    } catch (error) {
      setPageError(error.message);
      toast.error(error.message || "Source sync failed");
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
                {isSyncing ? "Syncing All Vaults..." : "Manual Sync All"}
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
                    <th className="px-8 py-4">Errors</th>
                    <th className="px-8 py-4">Started</th>
                    <th className="px-8 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {(systemData.recentRuns || []).map((run) => (
                    <tr key={run.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-8 py-5 text-white font-bold">{run.sourceName}</td>
                      <td className="px-8 py-5 text-white/50 font-black uppercase tracking-widest text-[10px]">
                        {run.notes === "embedding_rebuild" ? "Embedding Rebuild" : "Vimeo Sync"}
                      </td>
                      <td className="px-8 py-5">
                        <span
                          className={`px-3 py-1 rounded-full text-[8px] font-black border uppercase tracking-widest ${
                            run.status === "success"
                              ? "bg-green-500/10 text-green-400 border-green-500/20"
                              : run.status === "running"
                              ? "bg-blue-500/10 text-blue-300 border-blue-500/20"
                              : run.status === "partial"
                              ? "bg-yellow-500/10 text-yellow-300 border-yellow-500/20"
                              : "bg-red-500/10 text-red-300 border-red-500/20"
                          }`}
                        >
                          {run.status}
                        </span>
                      </td>
                      <td className="px-8 py-5 text-vicinity-peach font-bold">{run.errorCount || 0}</td>
                      <td className="px-8 py-5 text-white/40 font-medium">
                        {run.createdAt ? new Date(run.createdAt).toLocaleString() : "-"}
                      </td>
                      <td className="px-8 py-5 text-right">
                        {run.canRetry && run.notes !== "embedding_rebuild" ? (
                          <button
                            onClick={() => handleRetryRun(run.id)}
                            disabled={retryingRunId === run.id}
                            className="px-4 py-2 rounded-xl bg-[#4a5a67] text-vicinity-peach hover:bg-[#526472] text-[10px] font-black uppercase tracking-widest disabled:opacity-60"
                          >
                            {retryingRunId === run.id ? "Retrying..." : "Retry"}
                          </button>
                        ) : (
                          <span className="text-white/20 text-[10px] font-black uppercase tracking-widest">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {(systemData.recentRuns || []).length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-8 py-10 text-center text-white/40 font-bold">
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
                  <th className="px-10 py-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {sources.map((source) => (
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
                    <td className="px-10 py-6 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => handleSourceSync(source.id)} className="p-2 text-white/20 hover:text-vicinity-peach transition-colors" title="Sync Source"><SafeIcon name="RefreshCw" /></button>
                        <button
                          onClick={() => handleSourceRebuildEmbeddings(source.id)}
                          disabled={sourceRebuildId === source.id}
                          className="p-2 text-white/20 hover:text-vicinity-peach transition-colors disabled:opacity-50"
                          title="Rebuild Embeddings"
                        >
                          <SafeIcon name={sourceRebuildId === source.id ? "Loader2" : "Cpu"} className={sourceRebuildId === source.id ? "animate-spin" : ""} />
                        </button>
                        <button onClick={() => startEditSource(source)} className="p-2 text-white/20 hover:text-blue-300 transition-colors" title="Edit Source"><SafeIcon name="Edit2" /></button>
                        <button
                          onClick={() =>
                            setConfirmDialog({
                              open: true,
                              sourceId: source.id,
                              sourceName: source.name
                            })
                          }
                          className="p-2 text-white/20 hover:text-red-500 transition-colors"
                          title="Disable Source"
                        >
                          <SafeIcon name="Trash2" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
                      <option value="gpt-4o-mini">gpt-4o-mini</option>
                      <option value="gpt-4o-mini-transcribe">gpt-4o-mini-transcribe</option>
                      <option value="gpt-4o">gpt-4o</option>
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
    </div>
  );
}
