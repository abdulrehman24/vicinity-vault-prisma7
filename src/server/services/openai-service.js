import OpenAI, { toFile } from "openai";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { env } from "../config/env";

const OPENAI_AUDIO_UPLOAD_LIMIT_BYTES = 24 * 1024 * 1024;
const DEFAULT_SEGMENT_SECONDS = 9 * 60;
const DEFAULT_TRANSCRIPTION_MODEL = "whisper-1";
const SUPPORTED_TRANSCRIPTION_MODELS = new Set([
  "whisper-1",
  "gpt-4o-mini-transcribe",
  "gpt-4o-transcribe"
]);

const extractJsonArray = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    const start = raw.indexOf("[");
    const end = raw.lastIndexOf("]");
    if (start === -1 || end === -1 || end <= start) return [];
    const slice = raw.slice(start, end + 1);
    try {
      const parsed = JSON.parse(slice);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
};

const extractOpenAiErrorMeta = (error) => {
  if (!error || typeof error !== "object") return null;
  const headers =
    error.headers && typeof error.headers === "object"
      ? Object.fromEntries(Object.entries(error.headers))
      : null;

  return {
    name: error.name || null,
    status: Number.isFinite(error.status) ? error.status : null,
    requestId: error.request_id || headers?.["x-request-id"] || headers?.["X-Request-Id"] || null,
    type: error.type || error?.error?.type || null,
    code: error.code || error?.error?.code || null,
    param: error.param || error?.error?.param || null,
    message: error.message || error?.error?.message || null,
    responseBody: error?.error || null,
    headers
  };
};

const runCommand = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    let stdout = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      reject(error);
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`${command} exited with code ${code}: ${stderr || stdout}`));
    });
  });

const normalizeTranscriptionModel = (value) => {
  const model = String(value || "").trim();
  if (SUPPORTED_TRANSCRIPTION_MODELS.has(model)) return model;
  return DEFAULT_TRANSCRIPTION_MODEL;
};

const resolveTranscriptionResponseFormat = (model) =>
  model === "whisper-1" ? "verbose_json" : "json";

const normalizeTranscriptionOutput = (response) => {
  const extractText = () => {
    if (!response) return "";
    if (typeof response === "string") return response.trim();

    const direct =
      (typeof response.text === "string" && response.text) ||
      (typeof response.transcript === "string" && response.transcript) ||
      (typeof response.output_text === "string" && response.output_text) ||
      "";

    if (direct) return direct.trim();

    const altText = Array.isArray(response.output)
      ? response.output
          .flatMap((item) => {
            if (typeof item?.text === "string") return [item.text];
            if (Array.isArray(item?.content)) {
              return item.content
                .map((part) => (typeof part?.text === "string" ? part.text : ""))
                .filter(Boolean);
            }
            return [];
          })
          .join(" ")
      : "";
    return String(altText || "").trim();
  };

  const segments = Array.isArray(response?.segments)
    ? response.segments
    : Array.isArray(response?.audio?.segments)
    ? response.audio.segments
    : [];

  return {
    text: extractText(),
    segments
  };
};

export class OpenAiService {
  constructor({ apiKey = env.openaiApiKey, embeddingModel = env.openaiEmbeddingModel, transcriptionModel = env.openaiTranscriptionModel } = {}) {
    this.apiKey = apiKey;
    this.client = apiKey ? new OpenAI({ apiKey }) : null;
    this.embeddingModel = embeddingModel;
    this.transcriptionModel = normalizeTranscriptionModel(transcriptionModel);
  }

  isConfigured() {
    return Boolean(this.client);
  }

  async createEmbedding(inputText, modelOverride = null) {
    if (!this.client) {
      throw new Error("OPENAI_API_KEY is missing.");
    }

    const value = String(inputText || "").trim();
    if (!value) {
      throw new Error("Cannot create embedding for empty input.");
    }

    const response = await this.client.embeddings.create({
      model: modelOverride || this.embeddingModel,
      input: value
    });

    const item = response?.data?.[0];
    if (!item?.embedding) {
      throw new Error("OpenAI embedding response did not include an embedding vector.");
    }

    return item.embedding;
  }

  async transcribeFromUrl({ mediaUrl, filename = "vimeo-audio.mp4", modelOverride = null }) {
    if (!this.client) {
      throw new Error("OPENAI_API_KEY is missing.");
    }

    const mediaResponse = await fetch(mediaUrl);
    if (!mediaResponse.ok) {
      throw new Error(`Could not download media for transcription: ${mediaResponse.status} ${mediaResponse.statusText}`);
    }

    const arrayBuffer = await mediaResponse.arrayBuffer();
    const file = await toFile(Buffer.from(arrayBuffer), filename);

    let response;
    try {
      const model = normalizeTranscriptionModel(modelOverride || this.transcriptionModel);
      const responseFormat = resolveTranscriptionResponseFormat(model);
      response = await this.client.audio.transcriptions.create({
        file,
        model,
        response_format: responseFormat
      });
    } catch (error) {
      const meta = extractOpenAiErrorMeta(error);
      const details = meta ? ` | ${JSON.stringify(meta)}` : "";
      const wrapped = new Error(`OpenAI transcription API error: ${error?.message || "unknown"}${details}`);
      wrapped.cause = error;
      wrapped.meta = meta;
      throw wrapped;
    }

    return normalizeTranscriptionOutput(response);
  }

  async transcribeChunkedFromUrl({
    mediaUrl,
    filename = "vimeo-audio.mp4",
    modelOverride = null,
    segmentSeconds = DEFAULT_SEGMENT_SECONDS,
    logger = console
  }) {
    if (!this.client) {
      throw new Error("OPENAI_API_KEY is missing.");
    }

    const model = normalizeTranscriptionModel(modelOverride || this.transcriptionModel);
    const tempRoot = path.join(process.cwd(), "logs", "tmp", "transcription");
    const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const runDir = path.join(tempRoot, runId);
    const inputPath = path.join(runDir, filename || "vimeo-audio.mp4");

    await fs.mkdir(runDir, { recursive: true });

    try {
      logger.info?.("Downloading media for OpenAI transcription", { mediaUrl });
      const mediaResponse = await fetch(mediaUrl);
      if (!mediaResponse.ok) {
        throw new Error(`Could not download media for transcription: ${mediaResponse.status} ${mediaResponse.statusText}`);
      }
      const buffer = Buffer.from(await mediaResponse.arrayBuffer());
      await fs.writeFile(inputPath, buffer);

      const chunks = await this.buildTranscriptionChunks({
        inputPath,
        runDir,
        segmentSeconds,
        logger
      });
      if (chunks.length === 0) {
        throw new Error("No audio chunks were generated for transcription.");
      }

      logger.info?.("Transcribing OpenAI chunks", {
        chunksCount: chunks.length,
        model
      });

      const orderedTexts = [];
      const mergedSegments = [];
      const failedChunks = [];

      for (let index = 0; index < chunks.length; index += 1) {
        const chunk = chunks[index];
        try {
          logger.info?.("Transcribing chunk", {
            chunkIndex: index + 1,
            chunksCount: chunks.length,
            chunkPath: chunk.path
          });
          const response = await this.transcribeLocalFile({
            filePath: chunk.path,
            model
          });

          const text = String(response?.text || "").trim();
          if (text) {
            orderedTexts.push({ index, text });
          }

          if (Array.isArray(response?.segments) && response.segments.length > 0) {
            response.segments.forEach((segment) => {
              mergedSegments.push({
                start: Number.isFinite(segment?.start) ? segment.start + chunk.offsetSeconds : null,
                end: Number.isFinite(segment?.end) ? segment.end + chunk.offsetSeconds : null,
                text: String(segment?.text || "").trim()
              });
            });
          }
        } catch (error) {
          failedChunks.push({
            index,
            chunkPath: chunk.path,
            error: error.message
          });
          logger.warn?.("Chunk transcription failed", {
            chunkIndex: index + 1,
            chunksCount: chunks.length,
            error: error.message
          });
        }
      }

      const mergedText = orderedTexts
        .sort((a, b) => a.index - b.index)
        .map((item) => item.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      const normalizedSegments = mergedSegments.filter((segment) => segment.text);
      if (!mergedText && normalizedSegments.length === 0 && failedChunks.length === chunks.length) {
        throw new Error(
          `OpenAI returned no transcript text: all ${chunks.length} chunks failed transcription.`
        );
      }

      return {
        text: mergedText,
        segments: normalizedSegments,
        failedChunks,
        model
      };
    } finally {
      await fs.rm(runDir, { recursive: true, force: true });
    }
  }

  async buildTranscriptionChunks({ inputPath, runDir, segmentSeconds = DEFAULT_SEGMENT_SECONDS, logger = console }) {
    const stat = await fs.stat(inputPath);
    if (stat.size <= OPENAI_AUDIO_UPLOAD_LIMIT_BYTES) {
      logger.info?.("Media size is within single-upload limit", {
        sizeBytes: stat.size
      });
      return [{ path: inputPath, offsetSeconds: 0 }];
    }

    let ffmpegAvailable = true;
    try {
      await runCommand("ffmpeg", ["-version"]);
    } catch {
      ffmpegAvailable = false;
    }

    if (!ffmpegAvailable) {
      throw new Error(
        "Media file exceeds single-upload limit and ffmpeg is unavailable for chunking."
      );
    }

    logger.info?.("Splitting media into OpenAI-safe chunks", {
      inputPath,
      segmentSeconds
    });
    const outPattern = path.join(runDir, "chunk-%04d.mp3");
    await runCommand("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      inputPath,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-c:a",
      "libmp3lame",
      "-b:a",
      "48k",
      "-f",
      "segment",
      "-segment_time",
      String(segmentSeconds),
      "-reset_timestamps",
      "1",
      outPattern
    ]);

    const entries = await fs.readdir(runDir);
    const chunkNames = entries
      .filter((name) => /^chunk-\d{4}\.mp3$/i.test(name))
      .sort((a, b) => a.localeCompare(b));
    return chunkNames.map((name, index) => ({
      path: path.join(runDir, name),
      offsetSeconds: index * segmentSeconds
    }));
  }

  async transcribeLocalFile({ filePath, model }) {
    const buffer = await fs.readFile(filePath);
    const file = await toFile(buffer, path.basename(filePath));

    let response;
    try {
      const responseFormat = resolveTranscriptionResponseFormat(model);
      response = await this.client.audio.transcriptions.create({
        file,
        model,
        response_format: responseFormat
      });
    } catch (error) {
      const meta = extractOpenAiErrorMeta(error);
      const details = meta ? ` | ${JSON.stringify(meta)}` : "";
      const wrapped = new Error(`OpenAI transcription API error: ${error?.message || "unknown"}${details}`);
      wrapped.cause = error;
      wrapped.meta = meta;
      throw wrapped;
    }

    return normalizeTranscriptionOutput(response);
  }

  async generateMatchReasons({
    query,
    candidates,
    systemPrompt,
    modelOverride = null
  }) {
    if (!this.client) {
      throw new Error("OPENAI_API_KEY is missing.");
    }

    if (!Array.isArray(candidates) || candidates.length === 0) {
      return new Map();
    }

    const response = await this.client.chat.completions.create({
      model: modelOverride || "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: `${systemPrompt}\nReturn ONLY valid JSON array. Each item must be: {"id":"<video-id>","reason":"<one sentence>"}. Keep reason under 20 words.`
        },
        {
          role: "user",
          content: JSON.stringify({
            brief: query,
            candidates
          })
        }
      ]
    });

    const content = response?.choices?.[0]?.message?.content || "";
    const parsed = extractJsonArray(content);
    const map = new Map();

    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const id = String(item.id || "").trim();
      const reason = String(item.reason || "").trim();
      if (!id || !reason) continue;
      map.set(id, reason);
    }

    return map;
  }
}
