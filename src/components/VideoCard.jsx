"use client";

import SafeIcon from "@/src/common/SafeIcon";

export default function VideoCard({ video, onClick, isFeatured: isFeaturedProp, onToggleFeatured }) {
  const isFeatured = Boolean(isFeaturedProp);

  const formatDuration = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const handleToggle = (e) => {
    e.stopPropagation();
    if (onToggleFeatured) onToggleFeatured(video);
  };

  return (
    <div
      onClick={() => onClick(video)}
      className="bg-[#3d4a55] rounded-[2.5rem] border border-vicinity-peach/10 overflow-hidden hover:shadow-[0_20px_50px_rgba(0,0,0,0.4)] hover:border-vicinity-peach/40 transition-all duration-500 cursor-pointer group flex flex-col h-full border-b-4 border-b-transparent hover:border-b-vicinity-peach"
    >
      <div className="relative aspect-video overflow-hidden">
        <img
          src={video.thumbnail}
          alt={video.title}
          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000 opacity-80 group-hover:opacity-100"
        />
        <div className="absolute bottom-4 right-4 bg-black/60 text-vicinity-peach text-[10px] px-4 py-2 rounded-full font-black backdrop-blur-md uppercase tracking-widest">
          {formatDuration(video.duration)}
        </div>
        {onToggleFeatured && (
          <button
            onClick={handleToggle}
            className={`absolute top-4 right-4 p-3 rounded-full backdrop-blur-md transition-all shadow-2xl ${isFeatured ? "bg-vicinity-peach text-vicinity-slate" : "bg-black/40 text-white hover:bg-vicinity-peach hover:text-vicinity-slate"}`}
            title={isFeatured ? "Remove from Team Featured Works" : "Bookmark for the Team"}
          >
            <SafeIcon name="Star" className={isFeatured ? "fill-vicinity-slate" : ""} />
          </button>
        )}
      </div>
      <div className="p-8 flex flex-col flex-1 text-left">
        <div className="flex justify-between items-start mb-4 gap-4">
          <h3 className="font-bold text-white text-xl line-clamp-2 leading-tight tracking-tight group-hover:text-vicinity-peach transition-colors">
            {video.title}
          </h3>
          <div className="bg-vicinity-peach text-vicinity-slate px-3 py-1.5 rounded-xl text-[10px] font-black shrink-0 shadow-lg uppercase tracking-tighter">
            {Math.round(video.matchScore * 100)}% Match
          </div>
        </div>
        <p className="text-sm text-vicinity-peach/50 line-clamp-2 mb-6 flex-1 font-medium leading-relaxed">
          {video.description}
        </p>
        <div className="bg-[#4a5a67] rounded-3xl p-5 mb-6 border border-vicinity-peach/5 group-hover:border-vicinity-peach/20 transition-all">
          <p className="text-[10px] text-vicinity-peach font-bold leading-relaxed line-clamp-3">
            <span className="text-white/40 uppercase tracking-widest block mb-1">Team Insight:</span>
            {video.matchReason}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 mt-auto">
          {video.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="text-[9px] uppercase font-black bg-black/20 text-vicinity-peach/40 px-4 py-2 rounded-full border border-vicinity-peach/5">
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
