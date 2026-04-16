"use client";

import { useState } from "react";
import SafeIcon from "@/src/common/SafeIcon";
import { useAppStore } from "@/src/store/useAppStore";

const MOCK_SSO_USERS = [
  { id: 1, name: "Alex Thompson", email: "alex.t@vicinity.studio", role: "Sales Lead", lastLogin: "10 mins ago", avatar: "AT" },
  { id: 2, name: "Sarah Chen", email: "sarah.c@vicinity.studio", role: "Account Manager", lastLogin: "2 hours ago", avatar: "SC" },
  { id: 3, name: "Marcus Wright", email: "marcus.w@vicinity.studio", role: "Creative Director", lastLogin: "1 day ago", avatar: "MW" }
];

export default function Admin() {
  const { sources, addSource, removeSource, aiConfig, updateAiConfig } = useAppStore();
  const [activeTab, setActiveTab] = useState("system");
  const [isSyncing, setIsSyncing] = useState(false);
  const [isAddingSource, setIsAddingSource] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");
  const [newSourceName, setNewSourceName] = useState("");
  const [newSourceKey, setNewSourceKey] = useState("");

  const stats = [
    { label: "Total Videos Indexed", value: sources.reduce((acc, s) => acc + s.videoCount, 0).toLocaleString(), icon: "Video" },
    { label: "Active Data Sources", value: sources.length, icon: "Database" },
    { label: "SSO Active Users", value: MOCK_SSO_USERS.length, icon: "Users" }
  ];

  const handleAddSource = (e) => {
    e.preventDefault();
    if (!newSourceName || !newSourceKey) return;
    addSource({ name: newSourceName, apiKey: newSourceKey, type: "Vimeo" });
    setNewSourceName("");
    setNewSourceKey("");
    setIsAddingSource(false);
  };

  const handleSync = () => {
    setIsSyncing(true);
    setTimeout(() => setIsSyncing(false), 2000);
  };

  const handleAiUpdate = (field, value) => {
    updateAiConfig({ [field]: value });
    setSaveStatus("Saving changes...");
    setTimeout(() => setSaveStatus("All changes saved"), 1500);
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
              { id: "settings", label: "AI Config", icon: "Cpu" }
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

          <div className="bg-[#3d4a55] rounded-[3rem] border border-white/10 p-10 flex justify-between items-center shadow-xl">
            <div className="text-left">
              <h3 className="text-xl font-bold text-white tracking-tight">Global Re-Indexing</h3>
              <p className="text-xs text-vicinity-peach/40 mt-1 uppercase tracking-widest font-black">Refresh all {sources.length} active data sources.</p>
            </div>
            <button onClick={handleSync} disabled={isSyncing} className="bg-vicinity-peach text-vicinity-slate px-10 py-5 rounded-2xl font-black hover:bg-white transition-all flex items-center gap-3 uppercase tracking-widest text-xs">
              <SafeIcon name="RefreshCw" className={isSyncing ? "animate-spin" : ""} />
              {isSyncing ? "Syncing All Vaults..." : "Manual Sync All"}
            </button>
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
            <button onClick={() => setIsAddingSource(true)} className="bg-vicinity-peach text-vicinity-slate px-8 py-4 rounded-2xl font-black hover:bg-white transition-all uppercase tracking-widest text-xs flex items-center gap-2">
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
                    <td className="px-10 py-6 text-white/40 font-black uppercase text-[10px] tracking-widest">{source.type}</td>
                    <td className="px-10 py-6">
                      <span className="bg-green-500/10 text-green-400 px-3 py-1 rounded-full text-[8px] font-black border border-green-500/20 uppercase tracking-widest">{source.status}</span>
                    </td>
                    <td className="px-10 py-6 text-vicinity-peach font-bold">{source.videoCount.toLocaleString()}</td>
                    <td className="px-10 py-6 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => removeSource(source.id)} className="p-2 text-white/20 hover:text-red-500 transition-colors">
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
                {MOCK_SSO_USERS.map((user) => (
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
                    <td className="px-10 py-6 text-white/60 font-medium">{user.role}</td>
                    <td className="px-10 py-6 text-right text-white/40 font-medium">{user.lastLogin}</td>
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
                  <input type="password" value={aiConfig.openaiKey} onChange={(e) => handleAiUpdate("openaiKey", e.target.value)} className="w-full px-6 py-4 bg-[#4a5a67] border border-white/10 rounded-2xl text-white font-bold text-sm focus:ring-2 focus:ring-vicinity-peach/20 outline-none transition-all" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-vicinity-peach uppercase tracking-widest mb-3">Embedding Engine</label>
                    <select value={aiConfig.embeddingModel} onChange={(e) => handleAiUpdate("embeddingModel", e.target.value)} className="w-full px-6 py-4 bg-[#4a5a67] border border-white/10 rounded-2xl text-white font-bold text-sm outline-none">
                      <option value="text-embedding-3-small">Ada-002 (Small)</option>
                      <option value="text-embedding-3-large">Davinci (Large)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-vicinity-peach uppercase tracking-widest mb-3">Explanation Engine</label>
                    <select value={aiConfig.completionModel} onChange={(e) => handleAiUpdate("completionModel", e.target.value)} className="w-full px-6 py-4 bg-[#4a5a67] border border-white/10 rounded-2xl text-white font-bold text-sm outline-none">
                      <option value="gpt-4o-mini">GPT-4o Mini (Fast)</option>
                      <option value="gpt-4o">GPT-4o (Premium)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-3">
                    <label className="text-[10px] font-black text-vicinity-peach uppercase tracking-widest">Match Sensitivity</label>
                    <span className="text-sm font-bold text-white">{Math.round(aiConfig.similarityThreshold * 100)}%</span>
                  </div>
                  <input type="range" min="0" max="1" step="0.05" value={aiConfig.similarityThreshold} onChange={(e) => handleAiUpdate("similarityThreshold", parseFloat(e.target.value))} className="w-full h-2 bg-[#4a5a67] rounded-lg appearance-none cursor-pointer accent-vicinity-peach" />
                  <p className="mt-2 text-[9px] text-white/30 italic font-medium">Lower thresholds return more results; higher thresholds are more precise.</p>
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
                  <button onClick={() => handleAiUpdate("autoSyncEnabled", !aiConfig.autoSyncEnabled)} className={`w-14 h-8 rounded-full transition-all relative ${aiConfig.autoSyncEnabled ? "bg-vicinity-peach" : "bg-white/10"}`}>
                    <div className={`absolute top-1 w-6 h-6 rounded-full bg-white transition-all ${aiConfig.autoSyncEnabled ? "right-1" : "left-1"}`} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {isAddingSource && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/95 backdrop-blur-2xl">
          <div className="bg-[#3d4a55] rounded-[3rem] w-full max-w-lg shadow-2xl overflow-hidden border border-white/10">
            <div className="p-10 border-b border-white/5 flex justify-between items-center bg-[#4a5a67]">
              <div className="text-left">
                <h3 className="text-2xl font-bold text-white tracking-tight">Connect Video Source</h3>
                <p className="text-[10px] text-vicinity-peach/40 uppercase tracking-widest font-black mt-1">Add a new Vimeo account to the index.</p>
              </div>
              <button onClick={() => setIsAddingSource(false)} className="text-vicinity-peach/40 hover:text-vicinity-peach">
                <SafeIcon name="X" />
              </button>
            </div>
            <form onSubmit={handleAddSource} className="p-10 space-y-8 text-left">
              <div>
                <label className="block text-[10px] font-black text-vicinity-peach uppercase tracking-widest mb-3 ml-1">Account Label</label>
                <input type="text" required value={newSourceName} onChange={(e) => setNewSourceName(e.target.value)} className="w-full px-6 py-5 bg-[#4a5a67] border border-white/10 rounded-2xl text-white font-bold outline-none focus:ring-2 focus:ring-vicinity-peach/20" placeholder="e.g., Marketing Vimeo" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-vicinity-peach uppercase tracking-widest mb-3 ml-1">Access Token</label>
                <input type="password" required value={newSourceKey} onChange={(e) => setNewSourceKey(e.target.value)} className="w-full px-6 py-5 bg-[#4a5a67] border border-white/10 rounded-2xl text-white font-bold outline-none focus:ring-2 focus:ring-vicinity-peach/20" placeholder="vmo_prod_••••••••" />
              </div>
              <div className="pt-4 flex gap-4">
                <button type="button" onClick={() => setIsAddingSource(false)} className="flex-1 px-4 py-5 bg-white/5 text-white/40 rounded-2xl font-black uppercase tracking-widest text-xs">
                  Discard
                </button>
                <button type="submit" className="flex-1 px-4 py-5 bg-vicinity-peach text-vicinity-slate rounded-2xl font-black uppercase tracking-widest text-xs shadow-2xl">
                  Connect
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
