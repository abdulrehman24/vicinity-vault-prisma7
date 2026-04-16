"use client";

import { useEffect, useState } from "react";
import SafeIcon from "@/src/common/SafeIcon";
import VideoCard from "@/src/components/VideoCard";
import VideoModal from "@/src/components/VideoModal";
import { getJson, notifyDataChanged, sendJson } from "@/src/lib/client-api";
import ConfirmDialog from "@/src/components/ConfirmDialog";
import { toast } from "sonner";

export default function PersonalPage() {
  const [collections, setCollections] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [activeCollectionId, setActiveCollectionId] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    collectionId: null,
    collectionName: ""
  });
  const [shareState, setShareState] = useState({
    isShared: false,
    shareUrl: "",
    visibility: "private",
    shareExpiresAt: null
  });
  const [isShareLoading, setIsShareLoading] = useState(false);
  const [isDeletingCollection, setIsDeletingCollection] = useState(false);

  const load = async () => {
    setIsLoading(true);
    setError("");
    try {
      const [collectionsPayload, favoritesPayload] = await Promise.all([
        getJson("/api/personal/collections", { ttlMs: 12000 }),
        getJson("/api/personal/favorites", { ttlMs: 10000 })
      ]);
      const nextCollections = collectionsPayload.items || [];
      setCollections(nextCollections);
      setFavorites(favoritesPayload.items || []);
      setActiveCollectionId((prev) => {
        if (nextCollections.length === 0) return null;
        if (prev && nextCollections.some((item) => item.id === prev)) return prev;
        return nextCollections[0].id;
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const loadShare = async () => {
      if (!activeCollectionId) {
        setShareState({ isShared: false, shareUrl: "", visibility: "private", shareExpiresAt: null });
        return;
      }
      try {
        const payload = await getJson(`/api/playlists/${activeCollectionId}/share`, { ttlMs: 5000, force: true });
        setShareState({
          isShared: Boolean(payload.sharing?.isShared),
          shareUrl: payload.sharing?.shareUrl || "",
          visibility: payload.sharing?.visibility || "private",
          shareExpiresAt: payload.sharing?.shareExpiresAt || null
        });
      } catch {
        setShareState({ isShared: false, shareUrl: "", visibility: "private", shareExpiresAt: null });
      }
    };
    loadShare();
  }, [activeCollectionId]);

  const activeCollection = collections.find((p) => p.id === activeCollectionId);
  const hasAnyCollections = collections.length > 0;
  const hasAnySavedVideos = favorites.length > 0 || hasAnyCollections;

  const createCollection = async (e) => {
    e.preventDefault();
    try {
      await sendJson("/api/personal/collections", {
        method: "POST",
        body: JSON.stringify({
          name: newName,
          description: newDesc
        })
      });
      setIsCreating(false);
      setNewName("");
      setNewDesc("");
      notifyDataChanged(["/api/personal/collections", "/api/playlists", "/api/nav/counts"]);
      await load();
      toast.success("Collection created successfully");
    } catch (err) {
      toast.error(err.message || "Failed to create collection");
    }
  };

  const deleteCollection = async (id) => {
    try {
      setIsDeletingCollection(true);
      await sendJson(`/api/playlists/${id}`, { method: "DELETE" });
      setActiveCollectionId(null);
      notifyDataChanged(["/api/personal/collections", "/api/playlists", "/api/nav/counts"]);
      await load();
      toast.success("Collection deleted successfully");
      setConfirmDialog({ open: false, collectionId: null, collectionName: "" });
    } catch (err) {
      toast.error(err.message || "Failed to delete collection");
    } finally {
      setIsDeletingCollection(false);
    }
  };

  const removeFromCollection = async (collectionId, videoId) => {
    try {
      await sendJson(`/api/playlists/${collectionId}/items`, {
        method: "DELETE",
        body: JSON.stringify({ videoId })
      });
      notifyDataChanged(["/api/personal/collections", "/api/playlists"]);
      await load();
      toast.success("Video removed from collection");
    } catch (err) {
      toast.error(err.message || "Failed to remove video");
    }
  };

  const updateSharing = async (action) => {
    if (!activeCollectionId) return;
    try {
      setIsShareLoading(true);
      const payload = await sendJson(`/api/playlists/${activeCollectionId}/share`, {
        method: "PATCH",
        body: JSON.stringify({ action })
      });
      const sharing = payload.sharing || {};
      setShareState({
        isShared: Boolean(sharing.isShared),
        shareUrl: sharing.shareUrl || "",
        visibility: sharing.visibility || "private",
        shareExpiresAt: sharing.shareExpiresAt || null
      });
      await load();
      if (action === "disable") toast.success("Sharing disabled");
      else if (action === "regenerate") toast.success("Share link regenerated");
      else toast.success("Sharing enabled");
    } catch (err) {
      toast.error(err.message || "Failed to update sharing");
    } finally {
      setIsShareLoading(false);
    }
  };

  const copyShareLink = async () => {
    if (!shareState.shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareState.shareUrl);
      toast.success("Share link copied");
    } catch {
      toast.error("Could not copy share link");
    }
  };

  return (
    <div className="flex flex-col gap-10 pb-20">
      <div className="bg-[#3d4a55] p-12 rounded-[3.5rem] border border-white/10 shadow-2xl flex flex-col md:flex-row justify-between items-center gap-8">
        <div className="text-center md:text-left">
          <h1 className="text-5xl font-bold text-white mb-3 tracking-tighter">My <span className="text-vicinity-peach">Collections</span></h1>
          <p className="text-vicinity-peach/60 font-medium text-lg max-w-xl">Your personal workspace for saved videos and private collections.</p>
        </div>
        <button onClick={() => setIsCreating(true)} className="bg-vicinity-peach text-vicinity-slate px-10 py-5 rounded-2xl font-black hover:bg-white transition-all shadow-2xl flex items-center gap-3 uppercase tracking-widest text-sm">
          <SafeIcon name="Plus" className="text-xl" /> New Private List
        </button>
      </div>

      {error && <div className="text-red-300 text-sm font-bold bg-red-500/10 border border-red-500/30 px-6 py-4 rounded-2xl">{error}</div>}

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-[#3d4a55] rounded-[2.5rem] h-[15rem] border border-white/5 animate-pulse" />
          ))}
        </div>
      ) : favorites.length > 0 ? (
        <div className="bg-[#3d4a55]/40 p-6 rounded-[2.5rem] border border-white/5">
          <p className="text-[10px] text-vicinity-peach/40 uppercase tracking-widest font-black mb-4">My Favorites</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {favorites.slice(0, 6).map((video) => (
              <VideoCard key={video.id} video={video} onClick={setSelectedVideo} isFeatured />
            ))}
          </div>
        </div>
      ) : !hasAnySavedVideos ? (
        <div className="bg-[#3d4a55] rounded-[4rem] border border-white/5 p-32 text-center shadow-2xl">
          <SafeIcon name="Lock" className="text-6xl text-vicinity-peach/20 mx-auto mb-6" />
          <h3 className="text-3xl font-bold text-white mb-4 tracking-tight">No saved videos yet</h3>
        </div>
      ) : null}

      {!isLoading && collections.length > 0 && (
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-10">
        <div className="lg:col-span-1 flex flex-col gap-4">
          {collections.map((p) => (
            <button key={p.id} onClick={() => setActiveCollectionId(p.id)} className={`p-7 rounded-[2.5rem] border text-left transition-all ${activeCollectionId === p.id ? "bg-vicinity-peach border-vicinity-peach shadow-2xl scale-105" : "bg-[#3d4a55] border-white/10 hover:border-vicinity-peach/40"}`}>
              <div className={`font-bold mb-3 truncate text-lg tracking-tight ${activeCollectionId === p.id ? "text-vicinity-slate" : "text-white"}`}>{p.name}</div>
              <div className={`text-[9px] font-black uppercase tracking-widest ${activeCollectionId === p.id ? "text-vicinity-slate/60" : "text-white/20"}`}>{p.videos.length} Assets</div>
            </button>
          ))}
        </div>
        <div className="lg:col-span-3">
          {activeCollection ? (
            <div className="flex flex-col gap-10">
              <div className="bg-[#3d4a55] p-10 rounded-[3rem] border border-white/10 shadow-xl flex justify-between items-center">
                <div>
                  <h2 className="text-4xl font-bold text-white mb-2 tracking-tight">{activeCollection.name}</h2>
                  <p className="text-vicinity-peach/60 font-medium text-lg">{activeCollection.description || "Personal reference collection."}</p>
                  <p className="text-[10px] text-white/30 uppercase tracking-widest font-black mt-3">
                    {shareState.visibility === "shared_link" ? "Shared by link" : "Private collection"}
                  </p>
                  {shareState.shareExpiresAt && (
                    <p className="text-[10px] text-white/25 uppercase tracking-widest font-black mt-2">
                      Expires: {new Date(shareState.shareExpiresAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {shareState.isShared && (
                    <>
                      <button
                        onClick={copyShareLink}
                        className="h-12 px-4 bg-[#4a5a67] rounded-2xl flex items-center justify-center text-vicinity-peach hover:bg-[#5b6e7c] transition-all text-[10px] font-black uppercase tracking-widest"
                      >
                        <SafeIcon name="Link2" className="mr-2" />
                        Copy Link
                      </button>
                      <button
                        onClick={() => updateSharing("regenerate")}
                        disabled={isShareLoading}
                        className="h-12 px-4 bg-[#4a5a67] rounded-2xl flex items-center justify-center text-vicinity-peach hover:bg-[#5b6e7c] transition-all text-[10px] font-black uppercase tracking-widest disabled:opacity-60"
                      >
                        Regenerate
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => updateSharing(shareState.isShared ? "disable" : "enable")}
                    disabled={isShareLoading}
                    className="h-12 px-4 bg-[#4a5a67] rounded-2xl flex items-center justify-center text-vicinity-peach hover:bg-[#5b6e7c] transition-all text-[10px] font-black uppercase tracking-widest disabled:opacity-60"
                  >
                    <SafeIcon name="Share2" className="mr-2" />
                    {shareState.isShared ? "Disable Share" : "Share"}
                  </button>
                  <button
                    onClick={() =>
                      setConfirmDialog({
                        open: true,
                        collectionId: activeCollection.id,
                        collectionName: activeCollection.name
                      })
                    }
                    className="w-14 h-14 bg-[#4a5a67] rounded-2xl flex items-center justify-center text-vicinity-peach hover:bg-red-500 hover:text-white transition-all"
                  >
                    <SafeIcon name="Trash2" className="text-2xl" />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                {activeCollection.videos.map((video) => (
                  <div key={video.id} className="relative group">
                    <VideoCard video={video} onClick={setSelectedVideo} />
                    <button onClick={(e) => { e.stopPropagation(); removeFromCollection(activeCollection.id, video.id); }} className="absolute top-6 left-6 bg-red-600 text-white w-10 h-10 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all z-10">
                      <SafeIcon name="Minus" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-[#3d4a55] rounded-[4rem] border border-white/5 p-40 text-center">
              <SafeIcon name="Lock" className="text-6xl text-vicinity-peach/20 mx-auto mb-10" />
              <h3 className="text-3xl font-bold text-white mb-4 tracking-tight">Personal Workspace</h3>
            </div>
          )}
        </div>
      </div>
      )}

      {isCreating && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl">
          <div className="bg-[#3d4a55] rounded-[3rem] w-full max-w-md border border-white/10 shadow-2xl overflow-hidden">
            <div className="p-10 border-b border-white/5 bg-[#4a5a67] flex justify-between items-center">
              <h3 className="text-2xl font-bold text-white tracking-tight">New Private List</h3>
              <button onClick={() => setIsCreating(false)} className="text-vicinity-peach/40 hover:text-vicinity-peach"><SafeIcon name="X" /></button>
            </div>
            <form onSubmit={createCollection} className="p-10 space-y-8">
              <input required value={newName} onChange={(e) => setNewName(e.target.value)} className="w-full px-6 py-5 bg-[#4a5a67] border border-white/10 rounded-2xl text-white font-bold" placeholder="List Name" />
              <textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} className="w-full px-6 py-5 bg-[#4a5a67] border border-white/10 rounded-2xl h-32 resize-none text-white" placeholder="Notes (Optional)" />
              <button type="submit" className="w-full py-5 bg-vicinity-peach text-vicinity-slate rounded-2xl font-black uppercase tracking-widest text-xs">Create Private List</button>
            </form>
          </div>
        </div>
      )}

      {selectedVideo && <VideoModal video={selectedVideo} onClose={() => setSelectedVideo(null)} />}

      <ConfirmDialog
        open={confirmDialog.open}
        title="Delete collection?"
        description={`This will permanently remove "${confirmDialog.collectionName}" and its saved items.`}
        confirmLabel="Delete Collection"
        cancelLabel="Cancel"
        isConfirming={isDeletingCollection}
        onCancel={() => {
          if (isDeletingCollection) return;
          setConfirmDialog({ open: false, collectionId: null, collectionName: "" });
        }}
        onConfirm={() => {
          if (!confirmDialog.collectionId) return;
          deleteCollection(confirmDialog.collectionId);
        }}
      />
    </div>
  );
}
