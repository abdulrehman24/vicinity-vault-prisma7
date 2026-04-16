"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import SafeIcon from "@/src/common/SafeIcon";
import VideoCard from "@/src/components/VideoCard";
import VideoModal from "@/src/components/VideoModal";
import { getJson } from "@/src/lib/client-api";

export default function SharedPlaylistPage() {
  const params = useParams();
  const token = String(params?.token || "");
  const [playlist, setPlaylist] = useState(null);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true);
        setError("");
        const payload = await getJson(`/api/playlists/share/${token}`, {
          ttlMs: 10000
        });
        setPlaylist(payload.item || null);
      } catch (err) {
        setError(err.message || "Failed to load shared collection.");
      } finally {
        setIsLoading(false);
      }
    };
    if (token) {
      load();
    } else {
      setError("Invalid share token.");
      setIsLoading(false);
    }
  }, [token]);

  return (
    <div className="flex flex-col gap-10 pb-20">
      {isLoading ? (
        <div className="bg-[#3d4a55] rounded-[3rem] h-[18rem] border border-white/10 animate-pulse" />
      ) : error ? (
        <div className="bg-[#3d4a55] rounded-[3rem] border border-red-500/30 p-16 text-center">
          <SafeIcon name="AlertCircle" className="text-5xl text-red-300/80 mx-auto mb-4" />
          <p className="text-red-200 font-bold">{error}</p>
        </div>
      ) : playlist ? (
        <>
          <div className="bg-[#3d4a55] p-10 md:p-12 rounded-[3.5rem] border border-white/10 shadow-2xl">
            <div className="inline-flex items-center px-4 py-1.5 rounded-full border border-vicinity-peach/20 bg-[#4a5a67] mb-5">
              <p className="text-[9px] font-black text-vicinity-peach uppercase tracking-[0.25em]">
                Shared Collection
              </p>
            </div>
            <h1 className="text-5xl font-bold text-white mb-3 tracking-tighter">{playlist.name}</h1>
            <p className="text-vicinity-peach/60 font-medium text-lg max-w-2xl">
              {playlist.description || "Shared internally for collaboration."}
            </p>
            <p className="text-[10px] text-white/30 uppercase tracking-widest font-black mt-4">
              Shared by {playlist.ownerName || "Unknown"}
            </p>
          </div>

          {playlist.videos?.length ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
              {playlist.videos.map((video) => (
                <VideoCard key={video.id} video={video} onClick={setSelectedVideo} />
              ))}
            </div>
          ) : (
            <div className="bg-[#3d4a55] rounded-[3rem] border border-white/10 p-16 text-center">
              <p className="text-white/60 font-bold">This shared collection has no videos yet.</p>
            </div>
          )}
        </>
      ) : null}

      {selectedVideo && <VideoModal video={selectedVideo} onClose={() => setSelectedVideo(null)} />}
    </div>
  );
}
