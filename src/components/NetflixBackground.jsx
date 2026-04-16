"use client";

const STILLS = [
  "https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?w=800&q=80",
  "https://images.unsplash.com/photo-1485846234645-a62644f84728?w=800&q=80",
  "https://images.unsplash.com/photo-1478720568477-152d9b164e26?w=800&q=80",
  "https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=800&q=80",
  "https://images.unsplash.com/photo-1493612276216-ee3925520721?w=800&q=80",
  "https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=800&q=80",
  "https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=800&q=80",
  "https://images.unsplash.com/photo-1542204172-3f2fa0646606?w=800&q=80"
];

const Row = ({ direction = "left" }) => (
  <div className="flex whitespace-nowrap gap-4 mb-4 opacity-20 grayscale hover:grayscale-0 transition-all duration-1000">
    <div className={`flex gap-4 ${direction === "left" ? "animate-scroll-left" : "animate-scroll-right"}`}>
      {[...STILLS, ...STILLS].map((src, i) => (
        <div key={i} className="w-[300px] h-[180px] rounded-2xl overflow-hidden shrink-0 border border-white/10">
          <img src={src} className="w-full h-full object-cover" alt="Production Still" />
        </div>
      ))}
    </div>
  </div>
);

export default function NetflixBackground() {
  return (
    <div className="fixed inset-0 z-0 overflow-hidden bg-[#4a5a67]">
      <div className="absolute inset-0 flex flex-col rotate-12 scale-150 origin-center translate-y-[-10%]">
        <Row direction="left" />
        <Row direction="right" />
        <Row direction="left" />
        <Row direction="right" />
        <Row direction="left" />
        <Row direction="right" />
      </div>
      <div className="absolute inset-0 bg-gradient-to-b from-[#4a5a67]/90 via-[#4a5a67]/80 to-[#4a5a67]" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#4a5a67] via-transparent to-[#4a5a67]" />
      <div className="absolute inset-0 shadow-[inset_0_0_200px_rgba(0,0,0,0.5)]" />
    </div>
  );
}
