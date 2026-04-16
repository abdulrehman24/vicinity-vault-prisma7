import OpenAI, { toFile } from "openai";
import { env } from "../config/env";

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

export class OpenAiService {
  constructor({ apiKey = env.openaiApiKey, embeddingModel = env.openaiEmbeddingModel, transcriptionModel = env.openaiTranscriptionModel } = {}) {
    this.apiKey = apiKey;
    this.client = apiKey ? new OpenAI({ apiKey }) : null;
    this.embeddingModel = embeddingModel;
    this.transcriptionModel = transcriptionModel;
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

    const response = await this.client.audio.transcriptions.create({
      file,
      model: modelOverride || this.transcriptionModel,
      response_format: "verbose_json"
    });

    return {
      text: response?.text || "",
      segments: Array.isArray(response?.segments) ? response.segments : []
    };
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
