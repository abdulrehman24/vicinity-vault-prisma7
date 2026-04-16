const TIMESTAMP_PATTERN = /^(\d{2}:)?\d{2}:\d{2}(\.\d{3})?\s+-->\s+(\d{2}:)?\d{2}:\d{2}(\.\d{3})?/;

const toSeconds = (value) => {
  if (!value) return null;
  const normalized = value.replace(",", ".");
  const parts = normalized.split(":").map((part) => Number(part));
  if (parts.some((part) => Number.isNaN(part))) return null;
  const [h, m, s] = parts.length === 3 ? parts : [0, parts[0], parts[1]];
  return h * 3600 + m * 60 + s;
};

export const parseVttToSegments = (vttContent) => {
  const lines = String(vttContent || "").split(/\r?\n/);
  const segments = [];
  let active = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (active?.text) {
        segments.push(active);
      }
      active = null;
      continue;
    }

    if (trimmed.startsWith("WEBVTT") || /^\d+$/.test(trimmed)) {
      continue;
    }

    if (TIMESTAMP_PATTERN.test(trimmed)) {
      const [startRaw, endRaw] = trimmed.split("-->").map((part) => part.trim().split(" ")[0]);
      active = {
        start: toSeconds(startRaw),
        end: toSeconds(endRaw),
        text: ""
      };
      continue;
    }

    if (!active) {
      active = { start: null, end: null, text: "" };
    }
    active.text = `${active.text} ${trimmed}`.trim();
  }

  if (active?.text) segments.push(active);
  return segments.filter((segment) => segment.text);
};

const tokenize = (text) =>
  String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

export const chunkSegments = (segments, { maxTokens = 180, overlapTokens = 30 } = {}) => {
  const normalizedSegments = Array.isArray(segments) ? segments : [];
  const allWords = [];

  normalizedSegments.forEach((segment, segmentIndex) => {
    const words = tokenize(segment.text);
    words.forEach((word, wordIndex) => {
      allWords.push({
        word,
        segmentIndex,
        wordIndex
      });
    });
  });

  const chunks = [];
  let index = 0;
  let chunkIndex = 0;

  while (index < allWords.length) {
    const window = allWords.slice(index, index + maxTokens);
    if (window.length === 0) break;

    const first = normalizedSegments[window[0].segmentIndex];
    const last = normalizedSegments[window[window.length - 1].segmentIndex];

    chunks.push({
      chunkIndex,
      content: window.map((w) => w.word).join(" "),
      startSeconds: first?.start ?? null,
      endSeconds: last?.end ?? null,
      tokenCount: window.length
    });

    chunkIndex += 1;
    if (window.length <= overlapTokens) {
      index += window.length;
    } else {
      index += maxTokens - overlapTokens;
    }
  }

  return chunks;
};
