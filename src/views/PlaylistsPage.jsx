"use client";

import { useEffect, useState } from "react";
import SafeIcon from "@/src/common/SafeIcon";
import VideoCard from "@/src/components/VideoCard";
import VideoModal from "@/src/components/VideoModal";
import { getJson, notifyDataChanged, sendJson } from "@/src/lib/client-api";
import ConfirmDialog from "@/src/components/ConfirmDialog";
import { toast } from "sonner";

export default function PlaylistsPage() {
  const [playlists, setPlaylists] = useState([]);
  const [activePlaylistId, setActivePlaylistId] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [newPlaylistDesc, setNewPlaylistDesc] = useState("");
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [personalCollections, setPersonalCollections] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    playlistId: null,
    playlistName: ""
  });
  const [isDeletingPlaylist, setIsDeletingPlaylist] = useState(false);

  const loadTeamPlaylists = async (force = false) => {
    const payload = await getJson("/api/playlists?kind=team", { ttlMs: 12000, force });
    const items = payload.items || [];
    setPlaylists(items);

    if (items.length === 0) {
      setActivePlaylistId(null);
      return;
    }

    if (!items.some((item) => item.id === activePlaylistId)) {
      setActivePlaylistId(items[0].id);
    }
  };

  const loadPersonalCollectionNames = async (force = false) => {
    const payload = await getJson("/api/personal/collections", { ttlMs: 12000, force });
    setPersonalCollections((payload.items || []).map((item) => ({ id: item.id, name: item.name })));
  };

  const load = async (force = false) => {
    setIsLoading(true);
    setError("");
    try {
      await Promise.all([loadTeamPlaylists(force), loadPersonalCollectionNames(force)]);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load(false);
  }, []);

  const activePlaylist = playlists.find((p) => p.id === activePlaylistId);
  const formatCreatedAt = (value) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  };

  const createPlaylist = async (e) => {
    e.preventDefault();
    try {
      await sendJson("/api/playlists", {
        method: "POST",
        body: JSON.stringify({
          kind: "team",
          name: newPlaylistName,
          description: newPlaylistDesc
        })
      });
      setIsCreating(false);
      setNewPlaylistName("");
      setNewPlaylistDesc("");
      notifyDataChanged(["/api/playlists", "/api/nav/counts"]);
      await loadTeamPlaylists(true);
      toast.success("Playlist created successfully");
    } catch (err) {
      toast.error(err.message || "Failed to create playlist");
    }
  };

  const deletePlaylist = async (id) => {
    try {
      setIsDeletingPlaylist(true);
      await sendJson(`/api/playlists/${id}`, { method: "DELETE" });
      setActivePlaylistId(null);
      notifyDataChanged(["/api/playlists", "/api/nav/counts"]);
      await loadTeamPlaylists(true);
      toast.success("Playlist deleted successfully");
      setConfirmDialog({ open: false, playlistId: null, playlistName: "" });
    } catch (err) {
      toast.error(err.message || "Failed to delete playlist");
    } finally {
      setIsDeletingPlaylist(false);
    }
  };

  const removeFromPlaylist = async (playlistId, videoId) => {
    try {
      await sendJson(`/api/playlists/${playlistId}/items`, {
        method: "DELETE",
        body: JSON.stringify({ videoId })
      });
      notifyDataChanged(["/api/playlists"]);
      await loadTeamPlaylists(true);
      toast.success("Video removed from playlist");
    } catch (err) {
      toast.error(err.message || "Failed to remove video");
    }
  };

  const addToPlaylist = async (playlistId, videoId) => {
    try {
      await sendJson(`/api/playlists/${playlistId}/items`, {
        method: "POST",
        body: JSON.stringify({ videoId })
      });
      notifyDataChanged(["/api/playlists"]);
      await loadTeamPlaylists(true);
      toast.success("Video added to playlist");
    } catch (err) {
      toast.error(err.message || "Failed to add video");
    }
  };

  return (
    <div className="flex flex-col gap-10 pb-20">
      <div className="bg-[#3d4a55] p-10 md:p-12 rounded-[3.5rem] border border-white/10 shadow-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
        <div className="text-left">
          <div className="inline-flex items-center px-4 py-1.5 rounded-full border border-vicinity-peach/20 bg-[#4a5a67] mb-5">
            <p className="text-[9px] font-black text-vicinity-peach uppercase tracking-[0.25em]">
              Shared Collections Database
            </p>
          </div>
          <h1 className="text-5xl font-bold text-white mb-3 tracking-tighter">
            Team <span className="text-vicinity-peach">Collections</span>
          </h1>
          <p className="text-vicinity-peach/60 font-medium text-lg max-w-2xl">
            Collaborative libraries tailored for specific clients, industries, or pitch strategies.
          </p>
        </div>
        <button onClick={() => setIsCreating(true)} className="bg-vicinity-peach text-vicinity-slate px-10 py-5 rounded-2xl font-black hover:bg-white transition-all shadow-2xl flex items-center gap-3 uppercase tracking-widest text-sm whitespace-nowrap">
          <SafeIcon name="Plus" className="text-xl" /> Create New Collection
        </button>
      </div>
      {error && <div className="text-red-300 text-sm font-bold bg-red-500/10 border border-red-500/30 px-6 py-4 rounded-2xl">{error}</div>}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-[#3d4a55] rounded-[3rem] h-[18rem] border border-white/5 animate-pulse p-10" />
          ))}
        </div>
      ) : playlists.length === 0 ? (
        <div className="bg-[#3d4a55] rounded-[4rem] border border-white/5 p-32 text-center shadow-2xl">
          <SafeIcon name="Users" className="text-6xl text-vicinity-peach/20 mx-auto mb-6" />
          <h3 className="text-3xl font-bold text-white mb-4 tracking-tight">No playlists yet</h3>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          <div className="lg:col-span-1 flex flex-col gap-4">
            {playlists.map((p) => (
              <button key={p.id} onClick={() => setActivePlaylistId(p.id)} className={`p-7 rounded-[2.5rem] border text-left transition-all ${activePlaylistId === p.id ? "bg-vicinity-peach border-vicinity-peach shadow-2xl" : "bg-[#3d4a55] border-white/10 hover:border-vicinity-peach/30"}`}>
                <div className={`font-bold mb-3 truncate text-2xl tracking-tight leading-tight ${activePlaylistId === p.id ? "text-vicinity-slate" : "text-white"}`}>{p.name}</div>
                <div className={`text-[10px] font-black uppercase tracking-[0.18em] flex items-center gap-2 ${activePlaylistId === p.id ? "text-vicinity-slate/60" : "text-white/30"}`}>
                  <SafeIcon name="User" className="text-xs" />
                  {(p.ownerName || "Unknown").slice(0, 24)}
                </div>
                <div className={`text-[10px] mt-1 font-black uppercase tracking-[0.18em] flex items-center gap-2 ${activePlaylistId === p.id ? "text-vicinity-slate/60" : "text-white/30"}`}>
                  <SafeIcon name="Folder" className="text-xs" />
                  {p.videos.length} Assets
                </div>
              </button>
            ))}
          </div>
          <div className="lg:col-span-4">
            {activePlaylist ? (
              <div className="flex flex-col gap-10">
                <div className="bg-[#3d4a55] p-8 md:p-10 rounded-[3rem] border border-white/10 shadow-xl flex justify-between items-start">
                  <div className="text-left">
                    <div className="flex flex-wrap items-center gap-3 mb-4">
                      <span className="text-[9px] px-4 py-1.5 rounded-full bg-[#4a5a67] border border-vicinity-peach/15 text-vicinity-peach font-black uppercase tracking-[0.2em]">
                        Created by {activePlaylist.ownerName || "Unknown"}
                      </span>
                      <span className="text-[9px] text-white/25 font-black uppercase tracking-[0.2em]">
                        {formatCreatedAt(activePlaylist.createdAt)}
                      </span>
                    </div>
                    <h2 className="text-5xl font-bold text-white mb-2 tracking-tight leading-tight">{activePlaylist.name}</h2>
                    <p className="text-vicinity-peach/60 font-medium text-2xl leading-relaxed">
                      {activePlaylist.description || "Curated vault selection for the team."}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() =>
                        setConfirmDialog({
                          open: true,
                          playlistId: activePlaylist.id,
                          playlistName: activePlaylist.name
                        })
                      }
                      className="w-14 h-14 bg-[#4a5a67] rounded-2xl flex items-center justify-center text-vicinity-peach hover:bg-red-500 hover:text-white transition-all"
                    >
                      <SafeIcon name="Trash2" className="text-2xl" />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                  {activePlaylist.videos.map((video) => (
                    <div key={video.id} className="relative group">
                      <VideoCard video={video} onClick={setSelectedVideo} />
                      <button onClick={(e) => { e.stopPropagation(); removeFromPlaylist(activePlaylist.id, video.id); }} className="absolute top-6 left-6 bg-red-600 text-white w-10 h-10 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all z-10">
                        <SafeIcon name="Minus" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-[#3d4a55] rounded-[4rem] border border-white/5 p-40 text-center shadow-2xl">
                <h3 className="text-3xl font-bold text-white mb-4 tracking-tight">Select a Team Collection</h3>
              </div>
            )}
          </div>
        </div>
      )}

      {isCreating && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl">
          <div className="bg-[#3d4a55] rounded-[3rem] w-full max-w-md shadow-[0_50px_100px_rgba(0,0,0,0.8)] overflow-hidden border border-white/10">
            <div className="p-10 border-b border-white/5 flex justify-between items-center bg-[#4a5a67]">
              <h3 className="text-2xl font-bold text-white tracking-tight">New Team Collection</h3>
              <button onClick={() => setIsCreating(false)} className="text-vicinity-peach/40 hover:text-vicinity-peach"><SafeIcon name="X" className="text-2xl" /></button>
            </div>
            <form onSubmit={createPlaylist} className="p-10 space-y-8">
              <input type="text" autoFocus required value={newPlaylistName} onChange={(e) => setNewPlaylistName(e.target.value)} className="w-full px-6 py-5 bg-[#4a5a67] border border-white/10 rounded-2xl text-white font-bold" placeholder="Collection Name" />
              <textarea value={newPlaylistDesc} onChange={(e) => setNewPlaylistDesc(e.target.value)} className="w-full px-6 py-5 bg-[#4a5a67] border border-white/10 rounded-2xl h-32 resize-none text-white" placeholder="Description" />
              <button type="submit" className="w-full py-5 bg-vicinity-peach text-vicinity-slate rounded-2xl font-black uppercase tracking-widest text-xs">Create</button>
            </form>
          </div>
        </div>
      )}

      {selectedVideo && (
        <VideoModal
          video={selectedVideo}
          onClose={() => setSelectedVideo(null)}
          teamCollections={playlists.map((p) => ({ id: p.id, name: p.name }))}
          personalCollections={personalCollections}
          onAddToTeamCollection={addToPlaylist}
          onAddToPersonalCollection={addToPlaylist}
        />
      )}

      <ConfirmDialog
        open={confirmDialog.open}
        title="Delete playlist?"
        description={`This will permanently remove "${confirmDialog.playlistName}" and its saved items.`}
        confirmLabel="Delete Playlist"
        cancelLabel="Cancel"
        isConfirming={isDeletingPlaylist}
        onCancel={() => {
          if (isDeletingPlaylist) return;
          setConfirmDialog({ open: false, playlistId: null, playlistName: "" });
        }}
        onConfirm={() => {
          if (!confirmDialog.playlistId) return;
          deletePlaylist(confirmDialog.playlistId);
        }}
      />
    </div>
  );
}
