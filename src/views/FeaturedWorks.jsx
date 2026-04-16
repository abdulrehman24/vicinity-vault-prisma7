"use client";

import { useMemo, useState } from "react";
import SafeIcon from "@/src/common/SafeIcon";
import VideoCard from "@/src/components/VideoCard";
import VideoModal from "@/src/components/VideoModal";
import { useAppStore } from "@/src/store/useAppStore";

export default function FeaturedWorks() {
  const { featuredWorks } = useAppStore();
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [filterQuery, setFilterQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");

  const categories = useMemo(() => {
    const cats = new Set(["All"]);
    featuredWorks.forEach((v) => v.tags.forEach((t) => cats.add(t)));
    return Array.from(cats).slice(0, 8);
  }, [featuredWorks]);

  const filteredWorks = useMemo(() => {
    return featuredWorks.filter((v) => {
      const matchesSearch = v.title.toLowerCase().includes(filterQuery.toLowerCase()) || v.description.toLowerCase().includes(filterQuery.toLowerCase());
      const matchesCategory = activeCategory === "All" || v.tags.includes(activeCategory);
      return matchesSearch && matchesCategory;
    });
  }, [featuredWorks, filterQuery, activeCategory]);

  const exportMarkdown = () => {
    const markdown = filteredWorks.map((v) => `### ${v.title}\n**Link:** [Watch on Vimeo](${v.link})\n**Team Recommendation:** ${v.matchReason}\n\n`).join("---\n\n");
    navigator.clipboard.writeText(markdown);
    alert("Featured Works catalog exported to clipboard!");
  };

  return (
    <div className="flex flex-col gap-12 pb-20">
      <div className="bg-[#3d4a55] p-12 rounded-[3.5rem] border border-white/10 shadow-2xl flex flex-col md:flex-row justify-between items-center gap-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-10 opacity-5 pointer-events-none">
          <SafeIcon name="Star" className="text-[15rem]" />
        </div>
        <div className="text-center md:text-left relative z-10">
          <div className="flex items-center gap-4 mb-2 justify-center md:justify-start">
            <span className="bg-vicinity-peach/10 text-vicinity-peach text-[10px] font-black uppercase tracking-[0.3em] px-4 py-1.5 rounded-full border border-vicinity-peach/20">Team Bookmarks</span>
          </div>
          <h1 className="text-5xl font-bold text-white mb-3 tracking-tighter">
            Featured <span className="text-vicinity-peach">Works</span>
          </h1>
          <p className="text-vicinity-peach/60 font-medium text-lg max-w-xl">
            A collaborative collection of our most successful projects, bookmarked by team members for global visibility and pitch readiness.
          </p>
        </div>
        {featuredWorks.length > 0 && (
          <button onClick={exportMarkdown} className="flex items-center gap-4 bg-vicinity-peach text-vicinity-slate px-10 py-5 rounded-2xl font-black hover:bg-white transition-all shadow-2xl uppercase tracking-widest text-sm relative z-10">
            <SafeIcon name="Share2" className="text-xl" /> Copy Catalog
          </button>
        )}
      </div>

      {featuredWorks.length > 0 && (
        <div className="flex flex-col md:flex-row gap-6 items-center justify-between bg-[#3d4a55]/40 p-6 rounded-[2.5rem] border border-white/5 backdrop-blur-md">
          <div className="relative w-full md:w-96">
            <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none text-vicinity-peach/40">
              <SafeIcon name="Filter" />
            </div>
            <input
              type="text"
              placeholder="Filter by title or keywords..."
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              className="w-full bg-[#4a5a67]/60 border border-white/10 rounded-2xl pl-12 pr-6 py-4 text-vicinity-peach placeholder-vicinity-peach/30 text-sm font-bold focus:ring-2 focus:ring-vicinity-peach/20 outline-none transition-all"
            />
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  activeCategory === cat ? "bg-vicinity-peach text-vicinity-slate shadow-lg" : "bg-white/5 text-vicinity-peach/40 hover:text-vicinity-peach hover:bg-white/10"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      )}

      {filteredWorks.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12">
          {filteredWorks.map((video) => (
            <VideoCard key={video.id} video={video} onClick={setSelectedVideo} />
          ))}
        </div>
      ) : (
        <div className="bg-[#3d4a55] rounded-[4rem] border border-white/5 p-32 text-center shadow-2xl">
          <div className="w-32 h-32 bg-[#4a5a67] rounded-full flex items-center justify-center mx-auto mb-10 shadow-inner">
            <SafeIcon name="Star" className="text-6xl text-vicinity-peach/20" />
          </div>
          <h3 className="text-3xl font-bold text-white mb-4 tracking-tight">{filterQuery || activeCategory !== "All" ? "No matches found" : "Featured Vault is Empty"}</h3>
          <p className="text-vicinity-peach/40 font-black uppercase tracking-[0.3em] text-xs max-w-md mx-auto">
            {filterQuery || activeCategory !== "All"
              ? "Try adjusting your filters to find existing bookmarked works."
              : "Bookmark our best project works to this shared space so the entire team can leverage them."}
          </p>
        </div>
      )}

      {selectedVideo && <VideoModal video={selectedVideo} onClose={() => setSelectedVideo(null)} />}
    </div>
  );
}
