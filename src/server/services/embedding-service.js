import crypto from "node:crypto";
import { embedding_model, embedding_scope } from "@prisma/client";

const vectorToLiteral = (values) => `[${values.join(",")}]`;

const createChecksum = (input) => crypto.createHash("sha256").update(input).digest("hex");
const resolveEmbeddingModelEnum = (modelName) => {
  const raw = String(modelName || "").trim();
  if (raw === "text-embedding-3-small") {
    return embedding_model.text_embedding_3_small;
  }
  return embedding_model.text_embedding_3_small;
};

export class EmbeddingService {
  constructor({ prisma, openAiService, logger = console }) {
    this.prisma = prisma;
    this.openAiService = openAiService;
    this.logger = logger;
  }

  async embedVideo({ videoId, summaryText }) {
    const clean = String(summaryText || "").trim();
    if (!clean) return { skipped: true, reason: "empty_video_summary" };

    if (!this.openAiService.isConfigured()) {
      return { skipped: true, reason: "missing_openai_key" };
    }

    const vector = await this.openAiService.createEmbedding(clean);
    await this.upsertEmbedding({
      scope: embedding_scope.video_metadata,
      model: resolveEmbeddingModelEnum(this.openAiService?.embeddingModel),
      vector,
      videoId,
      transcriptChunkId: null,
      checksum: createChecksum(clean)
    });
    return { skipped: false };
  }

  async embedTranscriptChunks({ transcriptId }) {
    const chunks = await this.prisma.transcript_chunks.findMany({
      where: { transcript_id: transcriptId },
      select: {
        id: true,
        content: true
      },
      orderBy: { chunk_index: "asc" }
    });

    if (!chunks.length) return { embedded: 0, skipped: true, reason: "no_chunks" };
    if (!this.openAiService.isConfigured()) return { embedded: 0, skipped: true, reason: "missing_openai_key" };

    let embedded = 0;
    for (const chunk of chunks) {
      const clean = String(chunk.content || "").trim();
      if (!clean) continue;
      try {
        const vector = await this.openAiService.createEmbedding(clean);
        await this.upsertEmbedding({
          scope: embedding_scope.transcript_chunk,
          model: resolveEmbeddingModelEnum(this.openAiService?.embeddingModel),
          vector,
          videoId: null,
          transcriptChunkId: chunk.id,
          checksum: createChecksum(clean)
        });
        embedded += 1;
      } catch (error) {
        this.logger.warn("Chunk embedding failed", { chunkId: chunk.id, error: error.message });
      }
    }

    return { embedded, skipped: false };
  }

  async upsertEmbedding({ scope, model, vector, videoId, transcriptChunkId, checksum }) {
    const vectorLiteral = vectorToLiteral(vector);

    if (scope === embedding_scope.video_metadata && videoId) {
      await this.prisma.$executeRawUnsafe(
        `
        DELETE FROM "embeddings"
        WHERE "scope" = 'video_metadata' AND "video_id" = $1::uuid AND "model" = $2::"embedding_model";
      `,
        videoId,
        model
      );

      await this.prisma.$executeRawUnsafe(
        `
        INSERT INTO "embeddings" ("id","scope","model","embedding","video_id","transcript_chunk_id","checksum","created_at")
        VALUES (gen_random_uuid(), $1::"embedding_scope", $2::"embedding_model", $3::vector, $4::uuid, NULL, $5, now());
      `,
        scope,
        model,
        vectorLiteral,
        videoId,
        checksum
      );
      return;
    }

    if (scope === embedding_scope.transcript_chunk && transcriptChunkId) {
      await this.prisma.$executeRawUnsafe(
        `
        DELETE FROM "embeddings"
        WHERE "scope" = 'transcript_chunk' AND "transcript_chunk_id" = $1::uuid AND "model" = $2::"embedding_model";
      `,
        transcriptChunkId,
        model
      );

      await this.prisma.$executeRawUnsafe(
        `
        INSERT INTO "embeddings" ("id","scope","model","embedding","video_id","transcript_chunk_id","checksum","created_at")
        VALUES (gen_random_uuid(), $1::"embedding_scope", $2::"embedding_model", $3::vector, NULL, $4::uuid, $5, now());
      `,
        scope,
        model,
        vectorLiteral,
        transcriptChunkId,
        checksum
      );
    }
  }
}
