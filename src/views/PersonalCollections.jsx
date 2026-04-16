"use client";

import { useState } from "react";
import SafeIcon from "@/src/common/SafeIcon";
import VideoCard from "@/src/components/VideoCard";
import VideoModal from "@/src/components/VideoModal";
import { useAppStore } from "@/src/store/useAppStore";
import { MOCK_VIDEOS } from "@/src/lib/mockData";

export default function PersonalCollections() {
  const { personalCollections, createPersonalCollection, deletePersonalCollection, removeVideoFromPersonalCollection } = useAppStore();
  const [activeCollectionId, setActiveCollectionId] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [selectedVideo, setSelectedVideo] = useState(null);

  const activeCollection = personalCollections.find((p) => p.id === activeCollectionId);
  const collectionVideos = activeCollection ? MOCK_VIDEOS.filter((v) => activeCollection.videoIds.includes(v.id)) : [];

  const handleCreate = (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    createPersonalCollection(newName, newDesc);
    setNewName("");
    setNewDesc("");
    setIsCreating(false);
  };

  return (
    <div className="flex flex-col gap-10 pb-20">
      <div className="bg-[#3d4a55] p-12 rounded-[3.5rem] border border-white/10 shadow-2xl flex flex-col md:flex-row justify-between items-center gap-8">
        <div className="text-center md:text-left">
          <div className="flex items-center gap-4 mb-2 justify-center md:justify-start">
            <span className="bg-vicinity-peach/10 text-vicinity-peach text-[10px] font-black uppercase tracking-[0.3em] px-4 py-1.5 rounded-full border border-vicinity-peach/20 flex items-center gap-2">
              <SafeIcon name="Lock" /> Private Vault
            </span>
          </div>
          <h1 className="text-5xl font-bold text-white mb-3 tracking-tighter">
            My <span className="text-vicinity-peach">Collections</span>
          </h1>
          <p className="text-vicinity-peach/60 font-medium text-lg max-w-xl">Your personal workspace for project research and pitch preparation.</p>
        </div>
        <button onClick={() => setIsCreating(true)} className="bg-vicinity-peach text-vicinity-slate px-10 py-5 rounded-2xl font-black hover:bg-white transition-all shadow-2xl flex items-center gap-3 uppercase tracking-widest text-sm">
          <SafeIcon name="Plus" className="text-xl" /> New Private List
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-10">
        <div className="lg:col-span-1 flex flex-col gap-4">
          {personalCollections.length > 0 ? (
            personalCollections.map((p) => (
              <button key={p.id} onClick={() => setActiveCollectionId(p.id)} className={`p-7 rounded-[2.5rem] border text-left transition-all group relative overflow-hidden ${activeCollectionId === p.id ? "bg-vicinity-peach border-vicinity-peach shadow-2xl scale-105" : "bg-[#3d4a55] border-white/10 hover:border-vicinity-peach/40"}`}>
                <div className={`font-bold mb-3 truncate text-lg tracking-tight ${activeCollectionId === p.id ? "text-vicinity-slate" : "text-white"}`}>{p.name}</div>
                <div className={`text-[9px] font-black uppercase tracking-widest flex items-center gap-2 ${activeCollectionId === p.id ? "text-vicinity-slate/60" : "text-white/20"}`}>
                  <SafeIcon name="Video" /> {p.videoIds.length} Assets
                </div>
              </button>
            ))
          ) : (
            <div className="text-center p-12 bg-[#3d4a55]/40 rounded-[2.5rem] border border-dashed border-white/10">
              <p className="text-[10px] text-vicinity-peach/20 font-black uppercase tracking-widest">No private lists</p>
            </div>
          )}
        </div>

        <div className="lg:col-span-3">
          {activeCollection ? (
            <div className="flex flex-col gap-10">
              <div className="bg-[#3d4a55] p-10 rounded-[3rem] border border-white/10 shadow-xl flex justify-between items-center">
                <div className="text-left">
                  <h2 className="text-4xl font-bold text-white mb-2 tracking-tight">{activeCollection.name}</h2>
                  <p className="text-vicinity-peach/60 font-medium text-lg">{activeCollection.description || "Personal reference collection."}</p>
                </div>
                <button
                  onClick={() => {
                    if (confirm("Delete this private collection?")) deletePersonalCollection(activeCollection.id);
                    setActiveCollectionId(null);
                  }}
                  className="w-14 h-14 bg-[#4a5a67] rounded-2xl flex items-center justify-center text-vicinity-peach hover:bg-red-500 hover:text-white transition-all shadow-lg border border-white/5"
                >
                  <SafeIcon name="Trash2" className="text-2xl" />
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                {collectionVideos.map((video) => (
                  <div key={video.id} className="relative group">
                    <VideoCard video={video} onClick={setSelectedVideo} />
                    <button onClick={(e) => { e.stopPropagation(); removeVideoFromPersonalCollection(activeCollection.id, video.id); }} className="absolute top-6 left-6 bg-red-600 text-white w-10 h-10 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-2xl z-10">
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
              <p className="text-vicinity-peach/40 font-black uppercase tracking-widest text-xs max-w-sm mx-auto">Select a private list to view your curated assets.</p>
            </div>
          )}
        </div>
      </div>

      {isCreating && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl">
          <div className="bg-[#3d4a55] rounded-[3rem] w-full max-w-md border border-white/10 shadow-2xl overflow-hidden">
            <div className="p-10 border-b border-white/5 bg-[#4a5a67] flex justify-between items-center text-left">
              <h3 className="text-2xl font-bold text-white tracking-tight">New Private List</h3>
              <button onClick={() => setIsCreating(false)} className="text-vicinity-peach/40 hover:text-vicinity-peach">
                <SafeIcon name="X" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-10 space-y-8 text-left">
              <div>
                <label className="block text-[10px] font-black text-vicinity-peach uppercase tracking-widest mb-3">List Name</label>
                <input required value={newName} onChange={(e) => setNewName(e.target.value)} className="w-full px-6 py-5 bg-[#4a5a67] border border-white/10 rounded-2xl text-white font-bold outline-none focus:ring-2 focus:ring-vicinity-peach/20 transition-all" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-vicinity-peach uppercase tracking-widest mb-3">Notes (Optional)</label>
                <textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} className="w-full px-6 py-5 bg-[#4a5a67] border border-white/10 rounded-2xl h-32 resize-none text-white font-medium outline-none focus:ring-2 focus:ring-vicinity-peach/20 transition-all" />
              </div>
              <button type="submit" className="w-full py-5 bg-vicinity-peach text-vicinity-slate rounded-2xl font-black uppercase tracking-widest text-xs shadow-2xl hover:bg-white transition-all">
                Create Private List
              </button>
            </form>
          </div>
        </div>
      )}
      {selectedVideo && <VideoModal video={selectedVideo} onClose={() => setSelectedVideo(null)} />}
    </div>
  );
}
