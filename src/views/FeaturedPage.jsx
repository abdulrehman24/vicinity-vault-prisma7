"use client";

import { useEffect, useMemo, useState } from "react";
import SafeIcon from "@/src/common/SafeIcon";
import VideoCard from "@/src/components/VideoCard";
import VideoModal from "@/src/components/VideoModal";
import { getJson, notifyDataChanged, sendJson } from "@/src/lib/client-api";
import { toast } from "sonner";

export default function FeaturedPage() {
  const [videos, setVideos] = useState([]);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [filterQuery, setFilterQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [favorites, setFavorites] = useState(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setIsLoading(true);
    setError("");
    try {
      const [featuredPayload, favPayload] = await Promise.all([
        getJson("/api/featured", { ttlMs: 15000 }),
        getJson("/api/personal/favorites", { ttlMs: 10000 })
      ]);
      setVideos(featuredPayload.results || []);
      setFavorites(new Set((favPayload.items || []).map((v) => v.id)));
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const categories = useMemo(() => {
    const cats = new Set(["All"]);
    videos.forEach((v) => (v.tags || []).forEach((t) => cats.add(t)));
    return Array.from(cats).slice(0, 8);
  }, [videos]);

  const filteredWorks = useMemo(
    () =>
      videos.filter((v) => {
        const matchesSearch =
          v.title.toLowerCase().includes(filterQuery.toLowerCase()) ||
          v.description.toLowerCase().includes(filterQuery.toLowerCase());
        const matchesCategory = activeCategory === "All" || v.tags.includes(activeCategory);
        return matchesSearch && matchesCategory;
      }),
    [videos, filterQuery, activeCategory]
  );

  const toggleFavorite = async (video) => {
    const isFav = favorites.has(video.id);
    try {
      await sendJson("/api/personal/favorites", {
        method: isFav ? "DELETE" : "POST",
        body: JSON.stringify({ videoId: video.id })
      });
      setFavorites((prev) => {
        const next = new Set(prev);
        if (isFav) next.delete(video.id);
        else next.add(video.id);
        return next;
      });
      notifyDataChanged(["/api/personal/favorites", "/api/featured", "/api/nav/counts"]);
      toast.success(isFav ? "Removed from favorites" : "Added to favorites");
    } catch (err) {
      toast.error(err.message || "Failed to update favorite");
    }
  };

  return (
    <div className="flex flex-col gap-12 pb-20">
      <div className="bg-[#3d4a55] p-12 rounded-[3.5rem] border border-white/10 shadow-2xl flex flex-col md:flex-row justify-between items-center gap-8 relative overflow-hidden">
        <div className="text-center md:text-left relative z-10">
          <h1 className="text-5xl font-bold text-white mb-3 tracking-tighter">
            Featured <span className="text-vicinity-peach">Works</span>
          </h1>
          <p className="text-vicinity-peach/60 font-medium text-lg max-w-xl">
            Curated projects prioritized from real engagement and favorites data.
          </p>
        </div>
      </div>
      {error && (
        <div className="text-red-300 text-sm font-bold bg-red-500/10 border border-red-500/30 px-6 py-4 rounded-2xl">
          {error}
        </div>
      )}
      {!isLoading && videos.length > 0 && (
        <div className="flex flex-col md:flex-row gap-6 items-center justify-between bg-[#3d4a55]/40 p-6 rounded-[2.5rem] border border-white/5 backdrop-blur-md">
          <input type="text" placeholder="Filter by title or keywords..." value={filterQuery} onChange={(e) => setFilterQuery(e.target.value)} className="w-full md:w-96 bg-[#4a5a67]/60 border border-white/10 rounded-2xl px-6 py-4 text-vicinity-peach text-sm font-bold" />
          <div className="flex flex-wrap justify-center gap-2">
            {categories.map((cat) => (
              <button key={cat} onClick={() => setActiveCategory(cat)} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeCategory === cat ? "bg-vicinity-peach text-vicinity-slate shadow-lg" : "bg-white/5 text-vicinity-peach/40 hover:text-vicinity-peach hover:bg-white/10"}`}>{cat}</button>
            ))}
          </div>
        </div>
      )}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-[#3d4a55] rounded-[3rem] h-[30rem] border border-white/5 animate-pulse p-10">
              <div className="w-full h-56 bg-[#4a5a67] rounded-[2rem]" />
            </div>
          ))}
        </div>
      ) : filteredWorks.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12">
          {filteredWorks.map((video) => (
            <VideoCard key={video.id} video={video} onClick={setSelectedVideo} isFeatured={favorites.has(video.id)} onToggleFeatured={toggleFavorite} />
          ))}
        </div>
      ) : (
        <div className="bg-[#3d4a55] rounded-[4rem] border border-white/5 p-32 text-center shadow-2xl">
          <SafeIcon name="Star" className="text-6xl text-vicinity-peach/20 mx-auto mb-6" />
          <h3 className="text-3xl font-bold text-white mb-4 tracking-tight">No featured videos yet</h3>
        </div>
      )}
      {selectedVideo && <VideoModal video={selectedVideo} onClose={() => setSelectedVideo(null)} isFeatured={favorites.has(selectedVideo.id)} onToggleFeatured={toggleFavorite} />}
    </div>
  );
}
