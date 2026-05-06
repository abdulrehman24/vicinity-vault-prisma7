"use client";

import { useState } from "react";
import { useEffect } from "react";
import { getJson, sendJson } from "@/src/lib/client-api";

export default function TestVideoPage() {
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [aiResult, setAiResult] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [sources, setSources] = useState([]);
  const [sourceId, setSourceId] = useState("");

  useEffect(() => {
    let active = true;
    const loadSources = async () => {
      try {
        const payload = await getJson("/api/search/test-video", { ttlMs: 20000, force: true });
        if (!active) return;
        const list = Array.isArray(payload?.sources) ? payload.sources : [];
        setSources(list);
        const firstWithToken = list.find((item) => item.hasToken);
        if (firstWithToken) {
          setSourceId(firstWithToken.id);
        } else if (list.length > 0) {
          setSourceId(list[0].id);
        }
      } catch (_err) {
        if (!active) return;
        setSources([]);
      }
    };
    loadSources();
    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const input = String(value || "").trim();
    if (!input) return;

    setLoading(true);
    setError("");
    setAiResult(null);
    setAiError("");
    try {
      const payload = await sendJson("/api/search/test-video", {
        method: "POST",
        body: JSON.stringify({ vimeoId: input, sourceId: sourceId || null })
      });
      setResult(payload);

      setAiLoading(true);
      try {
        const aiPayload = await sendJson("/api/search/test-video/analyze", {
          method: "POST",
          body: JSON.stringify({ vimeoId: input, sourceId: sourceId || null })
        });
        setAiResult(aiPayload);
      } catch (analysisErr) {
        setAiError(analysisErr.message || "OpenAI analysis failed");
      } finally {
        setAiLoading(false);
      }
    } catch (err) {
      setResult(null);
      setError(err.message || "Request failed");
      setAiLoading(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="bg-[#3d4a55]/70 border border-vicinity-peach/20 rounded-3xl p-8">
        <h1 className="text-3xl font-bold text-white tracking-tight">Test Video Lookup</h1>
        <p className="mt-2 text-vicinity-peach/70 text-sm">
          Paste Vimeo ID or URL and press Enter. No button is required.
        </p>

        <form onSubmit={handleSubmit} className="mt-6">
          <div className="flex gap-3 items-stretch">
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="e.g. 1107280213 or https://vimeo.com/1107280213/8a2c12be5f"
              className="flex-1 px-5 py-4 rounded-2xl bg-[#4a5a67] border border-vicinity-peach/25 text-vicinity-peach outline-none focus:ring-2 focus:ring-vicinity-peach/30"
            />
            <select
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
              className="w-72 px-4 py-4 rounded-2xl bg-[#4a5a67] border border-vicinity-peach/25 text-vicinity-peach outline-none focus:ring-2 focus:ring-vicinity-peach/30"
            >
              {sources.length === 0 && <option value="">Default Vimeo</option>}
              {sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name} {source.hasToken ? "" : "(No token)"}
                </option>
              ))}
            </select>
          </div>
        </form>

        {loading && <p className="mt-4 text-vicinity-peach/80 text-sm">Loading...</p>}
        {error && <p className="mt-4 text-red-300 text-sm">{error}</p>}

        {result && (
          <>
            <div className="mt-4 text-left">
              <a
                href={`/admin?tab=videos&search=${encodeURIComponent(result?.vimeoId || value)}`}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-vicinity-peach text-vicinity-slate font-black text-xs uppercase tracking-widest"
              >
                Open in Admin Videos
              </a>
            </div>
            <pre className="mt-6 p-5 rounded-2xl bg-black/30 border border-white/10 text-vicinity-peach text-xs overflow-auto">
              {JSON.stringify(result, null, 2)}
            </pre>
          </>
        )}

        {aiLoading && (
          <p className="mt-4 text-vicinity-peach/80 text-sm">Checking with OpenAI...</p>
        )}

        {aiError && (
          <p className="mt-4 text-red-300 text-sm">{aiError}</p>
        )}

        {aiResult && (
          <pre className="mt-6 p-5 rounded-2xl bg-black/30 border border-vicinity-peach/30 text-vicinity-peach text-xs overflow-auto">
            {JSON.stringify(aiResult, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
