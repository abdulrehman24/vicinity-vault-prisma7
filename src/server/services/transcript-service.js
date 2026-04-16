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
    try {
      const vimeoTranscript = await this.tryVimeoTranscript(videoRecord);
      if (vimeoTranscript) {
        const transcriptId = await this.persistTranscript({
          videoId: videoRecord.id,
          source: transcript_source.vimeo,
          languageCode: vimeoTranscript.languageCode,
          status: transcript_status.complete,
          text: vimeoTranscript.text
        });

        const chunks = chunkSegments(vimeoTranscript.segments);
        await this.persistChunks({ transcriptId, videoId: videoRecord.id, chunks });
        return { transcriptId, chunksCount: chunks.length, source: "vimeo", skipped: false };
      }

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
      const transcription = await this.openAiService.transcribeFromUrl({
        mediaUrl,
        filename: `${videoRecord.vimeo_video_id}.mp4`
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
      return { transcriptId, chunksCount: chunks.length, source: "openai", skipped: false };
    } catch (error) {
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

  async persistTranscript({ videoId, source, languageCode, status, text, errorMessage = null }) {
    await this.prisma.transcripts.updateMany({
      where: {
        video_id: videoId,
        language_code: languageCode,
        is_active: true
      },
      data: { is_active: false, updated_at: new Date() }
    });

    const maxVersion = await this.prisma.transcripts.aggregate({
      where: {
        video_id: videoId,
        source,
        language_code: languageCode
      },
      _max: { version: true }
    });

    const transcript = await this.prisma.transcripts.create({
      data: {
        video_id: videoId,
        source,
        status,
        language_code: languageCode,
        raw_text: text,
        error_message: errorMessage,
        is_active: status === transcript_status.complete,
        version: (maxVersion._max.version || 0) + 1,
        generated_at: new Date()
      }
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
  }
}
