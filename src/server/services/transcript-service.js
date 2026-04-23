import { transcript_source, transcript_status } from "@prisma/client";
import { chunkSegments, parseVttToSegments } from "../utils/chunk-text";

const buildSegmentsFromPlainText = (text) => {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const sentences = clean.split(/(?<=[.!?])\s+/).filter(Boolean);
  return sentences.map((sentence) => ({ start: null, end: null, text: sentence }));
};

const pickBestVimeoTrack = (tracks) => {
  if (!Array.isArray(tracks) || tracks.length === 0) return null;
  return (
    tracks.find((track) => track.active) ||
    tracks.find((track) => track.language === "en") ||
    tracks[0]
  );
};

export class TranscriptService {
  constructor({ prisma, vimeoClient, openAiService, logger = console }) {
    this.prisma = prisma;
    this.vimeoClient = vimeoClient;
    this.openAiService = openAiService;
    this.logger = logger;
  }

  async processVideoTranscript(videoRecord) {
    this.logger.info("Transcript processing started", {
      videoId: videoRecord.id,
      vimeoVideoId: videoRecord.vimeo_video_id
    });
    try {
      const existingComplete = await this.getExistingCompletedTranscript(videoRecord.id);
      if (existingComplete) {
        this.logger.info("Transcript skipped: already completed in DB", {
          videoId: videoRecord.id,
          transcriptId: existingComplete.id,
          source: existingComplete.source,
          version: existingComplete.version,
          chunksCount: existingComplete.chunksCount
        });
        return {
          transcriptId: existingComplete.id,
          chunksCount: existingComplete.chunksCount,
          source: existingComplete.source,
          skipped: true,
          reason: "already_complete"
        };
      }

      const vimeoTranscript = await this.tryVimeoTranscript(videoRecord);
      if (vimeoTranscript) {
        this.logger.info("Using Vimeo transcript", {
          videoId: videoRecord.id,
          languageCode: vimeoTranscript.languageCode,
          segmentCount: vimeoTranscript.segments.length
        });
        const transcriptId = await this.persistTranscript({
          videoId: videoRecord.id,
          source: transcript_source.vimeo,
          languageCode: vimeoTranscript.languageCode,
          status: transcript_status.complete,
          text: vimeoTranscript.text
        });

        const chunks = chunkSegments(vimeoTranscript.segments);
        await this.persistChunks({ transcriptId, videoId: videoRecord.id, chunks });
        this.logger.info("Transcript persisted from Vimeo", {
          videoId: videoRecord.id,
          transcriptId,
          chunksCount: chunks.length
        });
        return { transcriptId, chunksCount: chunks.length, source: "vimeo", skipped: false };
      }

      this.logger.info("No Vimeo transcript found, trying OpenAI fallback", {
        videoId: videoRecord.id
      });
      return this.tryOpenAiTranscript(videoRecord);
    } catch (error) {
      this.logger.error("Transcript processing failed", {
        videoId: videoRecord.id,
        error: error.message
      });
      throw error;
    }
  }

  async tryVimeoTranscript(videoRecord) {
    if (!this.vimeoClient.isConfigured()) return null;

    const tracks = await this.vimeoClient.listTextTracks(videoRecord.vimeo_video_id);
    this.logger.debug("Fetched Vimeo text tracks", {
      videoId: videoRecord.id,
      vimeoVideoId: videoRecord.vimeo_video_id,
      tracksCount: tracks.length
    });
    const track = pickBestVimeoTrack(tracks);
    if (!track?.link) return null;

    const vtt = await this.vimeoClient.fetchTextTrackContent(track.link);
    const segments = parseVttToSegments(vtt);
    if (segments.length === 0) return null;

    return {
      languageCode: track.language || "en",
      segments,
      text: segments.map((segment) => segment.text).join(" ")
    };
  }

  async tryOpenAiTranscript(videoRecord) {
    if (!this.openAiService.isConfigured()) {
      this.logger.warn("OpenAI transcript skipped: missing API key", {
        videoId: videoRecord.id
      });
      await this.persistTranscript({
        videoId: videoRecord.id,
        source: transcript_source.openai,
        languageCode: "en",
        status: transcript_status.pending,
        text: null,
        errorMessage: "OPENAI_API_KEY is missing. Transcript fallback skipped."
      });
      return { transcriptId: null, chunksCount: 0, source: "openai", skipped: true, reason: "missing_openai_key" };
    }

    const mediaUrl = videoRecord?.metadata_json?.download_link || videoRecord.video_url;
    if (!mediaUrl) {
      this.logger.warn("OpenAI transcript skipped: missing media URL", {
        videoId: videoRecord.id
      });
      await this.persistTranscript({
        videoId: videoRecord.id,
        source: transcript_source.openai,
        languageCode: "en",
        status: transcript_status.failed,
        text: null,
        errorMessage: "No media URL available for OpenAI transcription fallback."
      });
      return { transcriptId: null, chunksCount: 0, source: "openai", skipped: true, reason: "missing_media_url" };
    }

    try {
      this.logger.info("OpenAI transcription started", {
        videoId: videoRecord.id,
        model: this.openAiService.transcriptionModel
      });
      const transcription = await this.openAiService.transcribeChunkedFromUrl({
        mediaUrl,
        filename: `${videoRecord.vimeo_video_id}.mp4`,
        logger: this.logger
      });

      const segments = Array.isArray(transcription.segments) && transcription.segments.length > 0
        ? transcription.segments.map((segment) => ({
            start: Number.isFinite(segment.start) ? segment.start : null,
            end: Number.isFinite(segment.end) ? segment.end : null,
            text: segment.text || ""
          }))
        : buildSegmentsFromPlainText(transcription.text);

      const text = (transcription.text || "").trim() || segments.map((segment) => segment.text).join(" ").trim();
      const transcriptId = await this.persistTranscript({
        videoId: videoRecord.id,
        source: transcript_source.openai,
        languageCode: "en",
        status: transcript_status.complete,
        text
      });

      const chunks = chunkSegments(segments);
      await this.persistChunks({ transcriptId, videoId: videoRecord.id, chunks });
      this.logger.info("OpenAI transcription completed", {
        videoId: videoRecord.id,
        transcriptId,
        chunksCount: chunks.length,
        failedChunks: transcription.failedChunks?.length || 0,
        model: transcription.model
      });
      return { transcriptId, chunksCount: chunks.length, source: "openai", skipped: false };
    } catch (error) {
      const openAiMeta =
        error?.meta ||
        error?.cause?.meta ||
        (error?.cause && typeof error.cause === "object"
          ? {
              name: error.cause.name || null,
              status: Number.isFinite(error.cause.status) ? error.cause.status : null,
              requestId:
                error.cause.request_id ||
                error.cause?.headers?.["x-request-id"] ||
                error.cause?.headers?.["X-Request-Id"] ||
                null,
              type: error.cause.type || error.cause?.error?.type || null,
              code: error.cause.code || error.cause?.error?.code || null,
              message: error.cause.message || error.cause?.error?.message || null,
              responseBody: error.cause?.error || null
            }
          : null);
      this.logger.error("OpenAI transcription failed", {
        videoId: videoRecord.id,
        error: error.message,
        openAi: openAiMeta
      });
      await this.persistTranscript({
        videoId: videoRecord.id,
        source: transcript_source.openai,
        languageCode: "en",
        status: transcript_status.failed,
        text: null,
        errorMessage: error.message
      });
      return { transcriptId: null, chunksCount: 0, source: "openai", skipped: true, reason: "openai_transcription_failed" };
    }
  }

  async getExistingCompletedTranscript(videoId) {
    const existing = await this.prisma.transcripts.findFirst({
      where: {
        video_id: videoId,
        status: transcript_status.complete,
        is_active: true
      },
      orderBy: [{ version: "desc" }, { updated_at: "desc" }],
      select: {
        id: true,
        source: true,
        version: true
      }
    });

    if (!existing) return null;

    const chunksCount = await this.prisma.transcript_chunks.count({
      where: { transcript_id: existing.id }
    });

    return {
      ...existing,
      chunksCount
    };
  }

  async persistTranscript({ videoId, source, languageCode, status, text, errorMessage = null }) {
    const now = new Date();
    const existing = await this.prisma.transcripts.findFirst({
      where: {
        video_id: videoId,
        source,
        language_code: languageCode
      },
      orderBy: [{ updated_at: "desc" }, { created_at: "desc" }],
      select: { id: true, version: true }
    });

    let transcript;
    if (existing) {
      transcript = await this.prisma.transcripts.update({
        where: { id: existing.id },
        data: {
          status,
          raw_text: text,
          error_message: errorMessage,
          is_active: status === transcript_status.complete,
          generated_at: now,
          updated_at: now
        }
      });
    } else {
      transcript = await this.prisma.transcripts.create({
        data: {
          video_id: videoId,
          source,
          status,
          language_code: languageCode,
          raw_text: text,
          error_message: errorMessage,
          is_active: status === transcript_status.complete,
          version: 1,
          generated_at: now
        }
      });
    }

    if (status === transcript_status.complete) {
      await this.prisma.transcripts.updateMany({
        where: {
          video_id: videoId,
          language_code: languageCode,
          is_active: true,
          id: { not: transcript.id }
        },
        data: {
          is_active: false,
          updated_at: now
        }
      });
    }

    this.logger.debug("Transcript row saved", {
      videoId,
      transcriptId: transcript.id,
      source,
      status,
      languageCode,
      version: transcript.version
    });
    return transcript.id;
  }

  async persistChunks({ transcriptId, videoId, chunks }) {
    if (!transcriptId) return;
    await this.prisma.transcript_chunks.deleteMany({
      where: { transcript_id: transcriptId }
    });

    if (!chunks.length) return;

    await this.prisma.transcript_chunks.createMany({
      data: chunks.map((chunk) => ({
        transcript_id: transcriptId,
        video_id: videoId,
        chunk_index: chunk.chunkIndex,
        content: chunk.content,
        start_seconds: chunk.startSeconds,
        end_seconds: chunk.endSeconds,
        token_count: chunk.tokenCount
      }))
    });

    this.logger.debug("Transcript chunks saved", {
      videoId,
      transcriptId,
      chunksCount: chunks.length
    });
  }
}
