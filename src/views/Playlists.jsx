"use client";

import { useState } from "react";
import { format } from "date-fns";
import SafeIcon from "@/src/common/SafeIcon";
import VideoCard from "@/src/components/VideoCard";
import VideoModal from "@/src/components/VideoModal";
import { useAppStore } from "@/src/store/useAppStore";
import { MOCK_VIDEOS } from "@/src/lib/mockData";

export default function Playlists() {
  const { playlists, createPlaylist, deletePlaylist, removeVideoFromPlaylist, currentUser } = useAppStore();
  const [activePlaylistId, setActivePlaylistId] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [newPlaylistDesc, setNewPlaylistDesc] = useState("");
  const [selectedVideo, setSelectedVideo] = useState(null);

  const activePlaylist = playlists.find((p) => p.id === activePlaylistId);
  const playlistVideos = activePlaylist ? MOCK_VIDEOS.filter((v) => activePlaylist.videoIds.includes(v.id)) : [];

  const handleCreate = (e) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;
    createPlaylist(newPlaylistName, newPlaylistDesc);
    setNewPlaylistName("");
    setNewPlaylistDesc("");
    setIsCreating(false);
  };

  const handleExport = () => {
    const markdown = playlistVideos.map((v) => `### ${v.title}\n**Link:** [Watch on Vimeo](${v.link})\n**Why it matches:** ${v.matchReason}\n\n`).join("---\n\n");
    navigator.clipboard.writeText(markdown);
    alert("Playlist exported to clipboard!");
  };

  const formatDate = (dateString) => {
    try {
      return format(new Date(dateString), "MMM do, yyyy • h:mm a");
    } catch {
      return "Recently";
    }
  };

  return (
    <div className="flex flex-col gap-10 pb-20">
      <div className="bg-[#3d4a55] p-12 rounded-[3.5rem] border border-white/10 shadow-2xl flex flex-col md:flex-row justify-between items-center gap-8">
        <div className="text-center md:text-left">
          <div className="flex items-center gap-4 mb-2 justify-center md:justify-start">
            <span className="bg-vicinity-peach/10 text-vicinity-peach text-[10px] font-black uppercase tracking-[0.3em] px-4 py-1.5 rounded-full border border-vicinity-peach/20">
              Shared Collections Database
            </span>
          </div>
          <h1 className="text-5xl font-bold text-white mb-3 tracking-tighter">
            Team <span className="text-vicinity-peach">Collections</span>
          </h1>
          <p className="text-vicinity-peach/60 font-medium text-lg max-w-xl">Collaborative libraries tailored for specific clients, industries, or pitch strategies.</p>
        </div>
        <button onClick={() => setIsCreating(true)} className="bg-vicinity-peach text-vicinity-slate px-10 py-5 rounded-2xl font-black hover:bg-white transition-all shadow-2xl flex items-center gap-3 uppercase tracking-widest text-sm">
          <SafeIcon name="Plus" className="text-xl" /> Create New Collection
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-10">
        <div className="lg:col-span-1 flex flex-col gap-4">
          {playlists.length > 0 ? (
            playlists.map((p) => (
              <button key={p.id} onClick={() => setActivePlaylistId(p.id)} className={`p-7 rounded-[2.5rem] border text-left transition-all group relative overflow-hidden ${activePlaylistId === p.id ? "bg-vicinity-peach border-vicinity-peach shadow-2xl scale-105" : "bg-[#3d4a55] border-white/10 hover:border-vicinity-peach/40"}`}>
                <div className={`font-bold mb-3 truncate text-lg tracking-tight ${activePlaylistId === p.id ? "text-vicinity-slate" : "text-white"}`}>{p.name}</div>
                <div className="flex flex-col gap-2">
                  <div className={`text-[9px] font-black uppercase tracking-widest flex items-center gap-2 ${activePlaylistId === p.id ? "text-vicinity-slate/60" : "text-vicinity-peach/40"}`}>
                    <SafeIcon name="User" /> {p.createdBy}
                  </div>
                  <div className={`text-[9px] font-black uppercase tracking-widest flex items-center gap-2 ${activePlaylistId === p.id ? "text-vicinity-slate/60" : "text-white/20"}`}>
                    <SafeIcon name="Video" /> {p.videoIds.length} Assets
                  </div>
                </div>
              </button>
            ))
          ) : (
            <div className="text-center p-12 bg-[#3d4a55]/40 rounded-[2.5rem] border border-dashed border-white/10">
              <p className="text-[10px] text-vicinity-peach/20 font-black uppercase tracking-widest">No shared collections</p>
            </div>
          )}
        </div>

        <div className="lg:col-span-3">
          {activePlaylist ? (
            <div className="flex flex-col gap-10">
              <div className="bg-[#3d4a55] p-10 rounded-[3rem] border border-white/10 shadow-xl">
                <div className="flex flex-col md:flex-row justify-between items-start gap-6">
                  <div className="text-left">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-[10px] font-black bg-vicinity-peach/10 text-vicinity-peach px-4 py-1.5 rounded-full border border-vicinity-peach/20 uppercase tracking-widest"> Created by {activePlaylist.createdBy} </span>
                      <span className="text-[10px] font-black text-white/20 uppercase tracking-widest"> {formatDate(activePlaylist.createdAt)} </span>
                    </div>
                    <h2 className="text-4xl font-bold text-white mb-2 tracking-tight">{activePlaylist.name}</h2>
                    <p className="text-vicinity-peach/60 font-medium text-lg">{activePlaylist.description || "Curated vault selection for the team."}</p>
                  </div>
                  <div className="flex gap-4">
                    <button onClick={handleExport} className="w-14 h-14 bg-[#4a5a67] rounded-2xl flex items-center justify-center text-vicinity-peach hover:bg-vicinity-peach hover:text-vicinity-slate transition-all shadow-lg border border-white/5" title="Export Collection">
                      <SafeIcon name="Download" className="text-2xl" />
                    </button>
                    {activePlaylist.createdBy === currentUser.name && (
                      <button
                        onClick={() => {
                          if (confirm("Delete this collection from the shared database?")) deletePlaylist(activePlaylist.id);
                          setActivePlaylistId(null);
                        }}
                        className="w-14 h-14 bg-[#4a5a67] rounded-2xl flex items-center justify-center text-vicinity-peach hover:bg-red-500 hover:text-white transition-all shadow-lg border border-white/5"
                        title="Delete Collection"
                      >
                        <SafeIcon name="Trash2" className="text-2xl" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                {playlistVideos.map((video) => (
                  <div key={video.id} className="relative group">
                    <VideoCard video={video} onClick={setSelectedVideo} />
                    <button onClick={(e) => { e.stopPropagation(); removeVideoFromPlaylist(activePlaylist.id, video.id); }} className="absolute top-6 left-6 bg-red-600 text-white w-10 h-10 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-2xl hover:scale-110 z-10">
                      <SafeIcon name="Minus" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-[#3d4a55] rounded-[4rem] border border-white/5 p-40 text-center shadow-2xl text-left">
              <div className="w-32 h-32 bg-[#4a5a67] rounded-full flex items-center justify-center mx-auto mb-10 shadow-inner">
                <SafeIcon name="Layers" className="text-6xl text-vicinity-peach/20" />
              </div>
              <h3 className="text-3xl font-bold text-white mb-4 tracking-tight text-center">Select a Team Collection</h3>
              <p className="text-vicinity-peach/40 font-black uppercase tracking-[0.3em] text-xs max-w-sm mx-auto text-center"> Explore curated project vaults created by your colleagues for specific pitch strategies. </p>
            </div>
          )}
        </div>
      </div>

      {isCreating && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl">
          <div className="bg-[#3d4a55] rounded-[3rem] w-full max-w-md shadow-[0_50px_100px_rgba(0,0,0,0.8)] overflow-hidden border border-white/10">
            <div className="p-10 border-b border-white/5 flex justify-between items-center bg-[#4a5a67] text-left">
              <h3 className="text-2xl font-bold text-white tracking-tight">New Team Collection</h3>
              <button onClick={() => setIsCreating(false)} className="text-vicinity-peach/40 hover:text-vicinity-peach transition-colors">
                <SafeIcon name="X" className="text-2xl" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-10 space-y-8 text-left">
              <div>
                <label className="block text-[10px] font-black text-vicinity-peach uppercase tracking-widest mb-3 ml-1">Collection Name</label>
                <input type="text" autoFocus required value={newPlaylistName} onChange={(e) => setNewPlaylistName(e.target.value)} className="w-full px-6 py-5 bg-[#4a5a67] border border-white/10 rounded-2xl focus:ring-4 focus:ring-vicinity-peach/20 outline-none text-white font-bold transition-all" placeholder="e.g., Luxury Automotive Pitch" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-vicinity-peach uppercase tracking-widest mb-3 ml-1">Internal Purpose</label>
                <textarea value={newPlaylistDesc} onChange={(e) => setNewPlaylistDesc(e.target.value)} className="w-full px-6 py-5 bg-[#4a5a67] border border-white/10 rounded-2xl focus:ring-4 focus:ring-vicinity-peach/20 outline-none h-32 resize-none text-white font-medium transition-all" placeholder="What is the goal of this collection?" />
              </div>
              <button type="submit" className="w-full py-5 bg-vicinity-peach text-vicinity-slate rounded-2xl font-black uppercase tracking-widest text-xs shadow-2xl hover:bg-white transition-all">
                Initialize Shared Vault
              </button>
            </form>
          </div>
        </div>
      )}
      {selectedVideo && <VideoModal video={selectedVideo} onClose={() => setSelectedVideo(null)} />}
    </div>
  );
}
