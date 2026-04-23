import { decryptSecret, encryptSecret, maskSecret } from "../security/secrets";
import { env } from "../config/env";

const DEFAULT_PROMPT =
  "In one short, punchy sentence, explain to a salesperson why this video is a good match for the client brief. Start with 'Matches because...'";
const ALLOWED_EMBEDDING_MODELS = new Set(["text-embedding-3-small"]);
const ALLOWED_TRANSCRIPTION_MODELS = new Set(["whisper-1", "gpt-4o-mini-transcribe", "gpt-4o-transcribe"]);

const normalizeEmbeddingModel = (value, fallback) => {
  const model = String(value || "").trim();
  if (ALLOWED_EMBEDDING_MODELS.has(model)) return model;
  return fallback;
};

const normalizeTranscriptionModel = (value, fallback) => {
  const model = String(value || "").trim();
  if (ALLOWED_TRANSCRIPTION_MODELS.has(model)) return model;
  return fallback;
};

export class AdminAiConfigService {
  constructor({ prisma }) {
    this.prisma = prisma;
  }

  async ensureConfig() {
    let config = await this.prisma.ai_configs.findFirst({ where: { singleton: true } });
    if (!config) {
      config = await this.prisma.ai_configs.create({
        data: {
          singleton: true,
          embedding_model: env.openaiEmbeddingModel,
          explanation_model: "gpt-4o-mini",
          match_sensitivity: 0.65,
          match_reason_prompt: DEFAULT_PROMPT,
          auto_sync_embeddings: true
        }
      });
    }
    return config;
  }

  toPublicDto(config) {
    const embeddingModel = normalizeEmbeddingModel(config.embedding_model, "text-embedding-3-small");
    return {
      id: config.id,
      hasOpenAiKey: Boolean(config.openai_api_key_encrypted),
      openAiKeyMasked: maskSecret(config.openai_api_key_encrypted),
      embeddingModel,
      explanationModel: config.explanation_model,
      matchSensitivity: Number(config.match_sensitivity),
      matchReasonPrompt: config.match_reason_prompt,
      autoSyncEmbeddings: config.auto_sync_embeddings,
      updatedAt: config.updated_at
    };
  }

  async getPublicConfig() {
    const config = await this.ensureConfig();
    return this.toPublicDto(config);
  }

  async updateConfig({ updates, updatedByUserId = null }) {
    const current = await this.ensureConfig();
    const next = {
      embedding_model: normalizeEmbeddingModel(
        updates.embeddingModel ?? current.embedding_model,
        "text-embedding-3-small"
      ),
      explanation_model: updates.explanationModel ?? current.explanation_model,
      match_sensitivity:
        updates.matchSensitivity != null ? Number(updates.matchSensitivity) : Number(current.match_sensitivity),
      match_reason_prompt: updates.matchReasonPrompt ?? current.match_reason_prompt,
      auto_sync_embeddings:
        typeof updates.autoSyncEmbeddings === "boolean"
          ? updates.autoSyncEmbeddings
          : current.auto_sync_embeddings,
      updated_by_user_id: updatedByUserId,
      updated_at: new Date()
    };

    if (!(next.match_sensitivity >= 0 && next.match_sensitivity <= 1)) {
      throw new Error("matchSensitivity must be between 0 and 1.");
    }
    if (!ALLOWED_EMBEDDING_MODELS.has(next.embedding_model)) {
      throw new Error("Unsupported embedding model for current database vector setup.");
    }

    if (typeof updates.openAiKey === "string") {
      const key = updates.openAiKey.trim();
      next.openai_api_key_encrypted = key ? encryptSecret(key) : null;
      next.openai_key_last4 = key ? key.slice(-4) : null;
    }

    const updated = await this.prisma.ai_configs.update({
      where: { id: current.id },
      data: next
    });
    return this.toPublicDto(updated);
  }

  async getRuntimeConfig() {
    const config = await this.ensureConfig();
    const configuredModel =
      typeof config?.transcription_model === "string" ? config.transcription_model : null;
    return {
      openAiApiKey: decryptSecret(config.openai_api_key_encrypted) || env.openaiApiKey,
      embeddingModel: normalizeEmbeddingModel(
        config.embedding_model || env.openaiEmbeddingModel,
        "text-embedding-3-small"
      ),
      transcriptionModel: normalizeTranscriptionModel(
        configuredModel || env.openaiTranscriptionModel,
        "whisper-1"
      ),
      explanationModel: config.explanation_model,
      matchSensitivity: Number(config.match_sensitivity),
      matchReasonPrompt: config.match_reason_prompt,
      autoSyncEmbeddings: config.auto_sync_embeddings
    };
  }
}
