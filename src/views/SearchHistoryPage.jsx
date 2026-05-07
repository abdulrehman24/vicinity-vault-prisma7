"use client";

import { useEffect, useState } from "react";
import { getJson, sendJson } from "@/src/lib/client-api";
import SafeIcon from "@/src/common/SafeIcon";

export default function SearchHistoryPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [runningQuery, setRunningQuery] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        setError("");
        const payload = await getJson("/api/search/history", { ttlMs: 8000, force: true });
        setItems(payload.items || []);
      } catch (err) {
        setError(err.message || "Failed to load history");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const runSearch = async (query) => {
    try {
      setRunningQuery(query);
      await sendJson("/api/search", {
        method: "POST",
        body: JSON.stringify({ query, limit: 30, offset: 0 })
      });
      window.location.href = `/search?q=${encodeURIComponent(query)}`;
    } catch (err) {
      setError(err.message || "Failed to run search");
    } finally {
      setRunningQuery("");
    }
  };

  return (
    <div className="flex flex-col gap-8 pb-20">
      <div className="bg-[#3d4a55]/60 backdrop-blur-xl rounded-[2.5rem] p-10 border border-white/10">
        <h1 className="text-4xl font-bold text-white tracking-tight">Search History</h1>
        <p className="text-vicinity-peach/70 mt-3">Your recent successful searches are stored here.</p>
      </div>

      {error && <div className="text-red-300 text-sm font-bold bg-red-500/10 border border-red-500/30 px-6 py-4 rounded-2xl">{error}</div>}

      {loading ? (
        <div className="bg-[#3d4a55] rounded-[2rem] border border-white/10 p-10 text-vicinity-peach/70">Loading...</div>
      ) : items.length === 0 ? (
        <div className="bg-[#3d4a55] rounded-[2rem] border border-white/10 p-10 text-center">
          <SafeIcon name="History" className="text-4xl text-vicinity-peach/40 mx-auto mb-4" />
          <p className="text-vicinity-peach/70">No saved searches yet.</p>
        </div>
      ) : (
        <div className="bg-[#3d4a55] rounded-[2rem] border border-white/10 p-6">
          <div className="flex flex-col gap-3">
            {items.map((item) => (
              <button
                key={item.id}
                onClick={() => runSearch(item.query)}
                disabled={runningQuery === item.query}
                className="w-full text-left px-5 py-4 rounded-xl bg-[#4a5a67] hover:bg-vicinity-peach hover:text-vicinity-slate text-vicinity-peach transition-all disabled:opacity-60"
              >
                <div className="flex items-center justify-between gap-4">
                  <span className="font-bold">{item.query}</span>
                  <span className="text-xs uppercase tracking-widest">
                    {item.result_count} results • {item.search_count}x
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

