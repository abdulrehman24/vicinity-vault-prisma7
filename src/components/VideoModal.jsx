"use client";

import { useState } from "react";
import Link from "next/link";
import SafeIcon from "@/src/common/SafeIcon";

export default function VideoModal({
  video,
  onClose,
  isFeatured: isFeaturedProp,
  onToggleFeatured,
  teamCollections,
  personalCollections: personalCollectionsProp,
  onAddToTeamCollection,
  onAddToPersonalCollection
}) {
  const [showMenu, setShowMenu] = useState(false);

  if (!video) return null;
  const isFeatured = Boolean(isFeaturedProp);
  const collectionsTeam = teamCollections || [];
  const collectionsPersonal = personalCollectionsProp || [];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl">
      <div className="bg-[#3d4a55] rounded-[3rem] w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col md:flex-row shadow-[0_50px_100px_rgba(0,0,0,0.8)] border border-vicinity-peach/10">
        <div className="w-full md:w-3/5 bg-black relative">
          <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover opacity-70" />
          <div className="absolute inset-0 flex items-center justify-center">
            <a href={video.link} target="_blank" rel="noreferrer" className="w-24 h-24 bg-vicinity-peach text-vicinity-slate rounded-full flex items-center justify-center transition-all hover:scale-110 shadow-[0_0_50px_rgba(235,193,182,0.4)]">
              <SafeIcon name="Play" className="text-4xl ml-2" />
            </a>
          </div>
          <div className="absolute bottom-10 left-10 right-10 p-10 bg-gradient-to-t from-black via-black/40 to-transparent rounded-b-[3rem] text-left">
            <h2 className="text-4xl font-bold text-white mb-4 tracking-tight">{video.title}</h2>
            <div className="flex items-center gap-6">
              <span className="text-white/40 font-black uppercase tracking-[0.2em] text-[10px] border border-white/20 px-4 py-2 rounded-full">{video.folder || "Vault"}</span>
              <span className="text-vicinity-peach font-black text-[10px] uppercase tracking-[0.2em]">AI SCORE: {Math.round(video.matchScore * 100)}%</span>
            </div>
          </div>
        </div>
        <div className="w-full md:w-2/5 flex flex-col h-full bg-[#3d4a55] relative text-left">
          <button onClick={onClose} className="absolute top-8 right-8 p-3 text-vicinity-peach/40 hover:text-vicinity-peach hover:bg-white/10 rounded-full transition-all z-10">
            <SafeIcon name="X" className="text-3xl" />
          </button>
          <div className="p-12 overflow-y-auto flex-1">
            <div className="bg-[#4a5a67] rounded-[2rem] p-8 mb-10 border border-vicinity-peach/10 shadow-inner">
              <h4 className="text-[10px] font-black text-vicinity-peach uppercase tracking-[0.3em] mb-4 flex items-center gap-3">
                <SafeIcon name="Star" className="text-xl" /> Featured Work
              </h4>
              <p className="text-white text-lg font-bold leading-relaxed opacity-90">"{video.matchReason}"</p>
            </div>
            <div className="mb-10">
              <h4 className="text-[10px] font-black text-vicinity-peach/30 uppercase tracking-[0.3em] mb-4">Project Narrative</h4>
              <p className="text-vicinity-peach/70 text-md leading-relaxed font-medium">{video.description}</p>
            </div>
            <div>
              <h4 className="text-[10px] font-black text-vicinity-peach/30 uppercase tracking-[0.3em] mb-4">Metadata Tags</h4>
              <div className="flex flex-wrap gap-2">
                {video.tags.map((tag) => (
                  <span key={tag} className="text-[9px] font-black bg-black/20 text-vicinity-peach/40 px-5 py-2.5 rounded-full border border-vicinity-peach/10 uppercase tracking-widest">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="p-10 border-t border-vicinity-peach/10 bg-[#323d47] flex flex-col gap-5">
            <button
              onClick={() => onToggleFeatured?.(video)}
              disabled={!onToggleFeatured}
              className={`flex-1 flex items-center justify-center gap-3 px-6 py-5 rounded-[1.5rem] font-black uppercase tracking-widest transition-all text-xs shadow-xl ${isFeatured ? "bg-vicinity-peach text-vicinity-slate" : "bg-[#4a5a67] text-white hover:bg-white/10 border border-white/10"}`}
            >
              <SafeIcon name="Star" className={isFeatured ? "fill-vicinity-slate" : ""} />
              {isFeatured ? "Featured" : "Add to Featured"}
            </button>
            <div className="relative">
              <button onClick={() => setShowMenu(!showMenu)} className="w-full flex items-center justify-center gap-3 bg-white text-vicinity-slate px-6 py-5 rounded-[1.5rem] font-black uppercase tracking-widest hover:bg-vicinity-peach transition-all text-xs shadow-2xl">
                <SafeIcon name="Plus" /> Save to Collection
              </button>
              {showMenu && (
                <div className="absolute bottom-full left-0 w-full mb-4 bg-[#4a5a67] border border-vicinity-peach/30 rounded-[2rem] shadow-[0_-20px_50px_rgba(0,0,0,0.5)] overflow-hidden z-50">
                  <div className="p-6 max-h-80 overflow-y-auto">
                    <div className="mb-6">
                      <h5 className="text-[9px] font-black text-vicinity-peach/40 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <SafeIcon name="Users" /> Team Shared
                      </h5>
                      {collectionsTeam.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => {
                            if (onAddToTeamCollection) onAddToTeamCollection(p.id, video.id);
                            setShowMenu(false);
                          }}
                          className="w-full text-left px-4 py-3 text-[10px] font-black text-white hover:bg-vicinity-peach hover:text-vicinity-slate rounded-xl transition-all mb-1 uppercase truncate"
                        >
                          {p.name}
                        </button>
                      ))}
                    </div>
                    <div>
                      <h5 className="text-[9px] font-black text-vicinity-peach/40 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <SafeIcon name="Lock" /> My Private Lists
                      </h5>
                      {collectionsPersonal.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => {
                            if (onAddToPersonalCollection) onAddToPersonalCollection(p.id, video.id);
                            setShowMenu(false);
                          }}
                          className="w-full text-left px-4 py-3 text-[10px] font-black text-white hover:bg-vicinity-peach hover:text-vicinity-slate rounded-xl transition-all mb-1 uppercase truncate"
                        >
                          {p.name}
                        </button>
                      ))}
                      <Link href="/personal" className="block text-center mt-4 py-3 text-[9px] font-black text-vicinity-peach bg-black/20 rounded-xl border border-white/5 uppercase tracking-widest">
                        + Create New List
                      </Link>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
