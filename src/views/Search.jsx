"use client";

import { useState } from "react";
import SafeIcon from "@/src/common/SafeIcon";
import VideoCard from "@/src/components/VideoCard";
import VideoModal from "@/src/components/VideoModal";
import { useAppStore } from "@/src/store/useAppStore";
import { CATEGORIES } from "@/src/lib/mockData";
import NetflixBackground from "@/src/components/NetflixBackground";

export default function Search() {
  const { performSearch, isSearching, searchResults } = useAppStore();
  const [brief, setBrief] = useState("");
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = (e) => {
    e.preventDefault();
    if (!brief.trim()) return;
    setHasSearched(true);
    performSearch(brief);
  };

  const handleCategoryClick = (cat) => {
    setBrief(`We need a ${cat.toLowerCase()} video...`);
  };

  return (
    <div className="flex flex-col gap-12 pb-20 relative">
      <div className="relative overflow-hidden bg-[#3d4a55]/60 backdrop-blur-xl rounded-[3.5rem] p-12 sm:p-20 shadow-2xl border border-white/10">
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <NetflixBackground />
        </div>

        <div className="relative z-10">
          <h1 className="text-6xl font-bold text-white mb-6 tracking-tighter">
            Find the Perfect <span className="text-vicinity-peach">Pitch Video</span>
          </h1>
          <p className="text-vicinity-peach/70 mb-14 max-w-2xl text-xl font-medium leading-relaxed">
            Vault exploration. Describe your project brief to semantically search our entire library of past excellence.
          </p>

          <form onSubmit={handleSearch} className="relative group">
            <div className="absolute top-8 left-8 text-vicinity-peach opacity-40 group-focus-within:opacity-100 transition-opacity">
              <SafeIcon name="Search" className="text-4xl" />
            </div>
            <textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="e.g., A high-energy 2 minute corporate highlights film for a tech client..."
              className="w-full pl-20 pr-48 py-8 bg-[#4a5a67]/80 border border-vicinity-peach/20 rounded-[2.5rem] focus:ring-4 focus:ring-vicinity-peach/20 focus:border-transparent outline-none resize-none h-56 text-vicinity-peach text-2xl transition-all shadow-[inset_0_4px_20px_rgba(0,0,0,0.3)] font-bold"
            />
            <div className="absolute bottom-8 right-8">
              <button type="submit" disabled={isSearching || !brief.trim()} className="bg-vicinity-peach text-vicinity-slate px-12 py-5 rounded-[1.5rem] font-black hover:bg-white disabled:opacity-50 transition-all flex items-center gap-4 shadow-[0_20px_40px_rgba(0,0,0,0.4)] uppercase tracking-widest text-sm">
                {isSearching ? (
                  <>
                    <SafeIcon name="Loader" className="animate-spin" /> Searching...
                  </>
                ) : (
                  <>
                    Search Vault <SafeIcon name="ArrowRight" />
                  </>
                )}
              </button>
            </div>
          </form>

          <div className="mt-14 flex items-center gap-8">
            <p className="text-[10px] font-black text-vicinity-peach/40 uppercase tracking-[0.3em] shrink-0">Priority Genres</p>
            <div className="flex flex-wrap gap-3">
              {CATEGORIES.slice(0, 7).map((cat) => (
                <button key={cat} onClick={() => handleCategoryClick(cat)} className="text-[10px] bg-[#4a5a67] hover:bg-vicinity-peach text-vicinity-peach hover:text-vicinity-slate px-6 py-3 rounded-full transition-all border border-white/5 font-black uppercase tracking-[0.15em] shadow-lg">
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {hasSearched && (
        <div className="flex flex-col gap-10">
          <div className="flex justify-between items-center px-6">
            <div>
              <h2 className="text-4xl font-bold text-white tracking-tighter">Vault Matches</h2>
              <div className="flex items-center gap-3 mt-2">
                <span className="w-2.5 h-2.5 bg-vicinity-peach rounded-full animate-ping" />
                <p className="text-[10px] font-black text-vicinity-peach uppercase tracking-[0.3em]">AI Ranked Relevance</p>
              </div>
            </div>

            <button className="flex items-center gap-3 text-vicinity-peach bg-[#3d4a55] border border-white/10 px-8 py-4 rounded-2xl hover:bg-white/5 text-[10px] font-black uppercase tracking-widest transition-all shadow-2xl">
              <SafeIcon name="Filter" /> Advanced Filters
            </button>
          </div>

          {isSearching ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-[#3d4a55] rounded-[3rem] h-[30rem] border border-white/5 animate-pulse p-10 flex flex-col gap-8">
                  <div className="w-full h-56 bg-[#4a5a67] rounded-[2rem]" />
                  <div className="w-3/4 h-10 bg-[#4a5a67] rounded-2xl" />
                  <div className="w-full h-5 bg-[#4a5a67] rounded-full" />
                  <div className="w-5/6 h-5 bg-[#4a5a67] rounded-full" />
                </div>
              ))}
            </div>
          ) : searchResults.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12">
              {searchResults.map((video) => (
                <VideoCard key={video.id} video={video} onClick={setSelectedVideo} />
              ))}
            </div>
          ) : (
            <div className="bg-[#3d4a55] rounded-[4rem] border border-white/5 p-32 text-center shadow-2xl">
              <div className="w-32 h-32 bg-[#4a5a67] rounded-full flex items-center justify-center mx-auto mb-10 shadow-inner">
                <SafeIcon name="Inbox" className="text-6xl text-vicinity-peach/20" />
              </div>
              <h3 className="text-3xl font-bold text-white mb-4 tracking-tight">Vault Entry Not Found</h3>
              <p className="text-vicinity-peach/40 font-black uppercase tracking-[0.3em] text-xs">Try refining your brief for better AI matching</p>
            </div>
          )}
        </div>
      )}

      {selectedVideo && <VideoModal video={selectedVideo} onClose={() => setSelectedVideo(null)} />}
    </div>
  );
}
