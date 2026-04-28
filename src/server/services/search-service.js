import { OpenAiService } from "./openai-service";
import { AdminAiConfigService } from "./admin-ai-config-service";
import { toVideoCardDto } from "./video-dto";

const normalize = (query) => String(query || "").trim();
const normalizeLower = (value) => String(value || "").trim().toLowerCase();
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const NOISE_TERMS = new Set([
  "pls",
  "plz",
  "ok",
  "okay",
  "yo",
  "hey",
  "sup",
  "can",
  "cant",
  "cannot",
  "won't",
  "wont",
  "don't",
  "dont",
  "didn't",
  "didnt",
  "isn't",
  "isnt",
  "aren't",
  "arent",
  "wasn't",
  "wasnt",
  "weren't",
  "werent",
  "hasn't",
  "hasnt",
  "haven't",
  "havent",
  "hadn't",
  "hadnt",
  "could",
  "couldn't",
  "couldnt",
  "would",
  "wouldn't",
  "wouldnt",
  "should",
  "shouldn't",
  "shouldnt",
  "may",
  "might",
  "must",
  "you",
  "u",
  "ur",
  "ya",
  "your",
  "yours",
  "me",
  "myself",
  "yourself",
  "yourselves",
  "mine",
  "he",
  "him",
  "his",
  "she",
  "her",
  "hers",
  "they",
  "them",
  "their",
  "theirs",
  "it",
  "it's",
  "im",
  "i'm",
  "ive",
  "i've",
  "id",
  "i'd",
  "ill",
  "i'll",
  "youre",
  "you're",
  "youve",
  "you've",
  "youll",
  "you'll",
  "thats",
  "that's",
  "theres",
  "there's",
  "heres",
  "here's",
  "whats",
  "what's",
  "whos",
  "who's",
  "wheres",
  "where's",
  "whens",
  "when's",
  "whys",
  "why's",
  "hows",
  "how's",
  "its",
  "do",
  "does",
  "did",
  "done",
  "doing",
  "have",
  "has",
  "had",
  "give",
  "gives",
  "given",
  "giving",
  "get",
  "gets",
  "got",
  "getting",
  "fetch",
  "bring",
  "provide",
  "provided",
  "show",
  "send",
  "share",
  "shared",
  "suggest",
  "suggested",
  "recommend",
  "recommended",
  "tell",
  "i",
  "me",
  "my",
  "we",
  "us",
  "our",
  "ours",
  "ourselves",
  "want",
  "wanna",
  "need",
  "needs",
  "looking",
  "look",
  "lookingfor",
  "search",
  "searching",
  "find",
  "found",
  "video",
  "videos",
  "clip",
  "clips",
  "content",
  "contents",
  "related",
  "relate",
  "around",
  "abouts",
  "about",
  "for",
  "from",
  "into",
  "via",
  "at",
  "as",
  "by",
  "or",
  "and",
  "if",
  "then",
  "than",
  "the",
  "a",
  "an",
  "to",
  "of",
  "on",
  "in",
  "with",
  "please",
  "that",
  "this",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "used",
  "use",
  "using",
  "show",
  "shows",
  "showing",
  "shown",
  "display",
  "displays",
  "displaying",
  "which",
  "what",
  "who",
  "when",
  "where",
  "why",
  "how",
  "please",
  "thanks",
  "thank",
  "hi",
  "hello",
  "thx",
  "ty"
]);

const buildSearchIntentQuery = (raw) => {
  const normalized = normalize(raw);
  if (!normalized) return "";
  const compact = normalized
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 1 && !NOISE_TERMS.has(part));
  const unique = Array.from(new Set(compact));
  return unique.join(" ").trim() || normalized;
};

const toIdSet = (rows, field) =>
  new Set((rows || []).map((row) => row[field]).filter(Boolean));

const toScoreMap = (rows, idField, scoreField) => {
  const map = new Map();
  for (const row of rows || []) {
    const id = row[idField];
    if (!id) continue;
    map.set(id, Number(row[scoreField]) || 0);
  }
  return map;
};

const normalizeMetadataScore = (raw) => clamp(raw / 0.9);
const normalizeTranscriptScore = (raw) => clamp(raw / 0.75);
const normalizeSemanticScore = (raw) => clamp(raw);
const DURATION_CONSTRAINT_REGEX = {
  under: /\b(?:under|less than|below|shorter than|max(?:imum)?(?: of)?)\s+(\d{1,3})\s*(?:min|mins|minute|minutes)\b/i,
  over: /\b(?:over|more than|above|longer than|min(?:imum)?(?: of)?)\s+(\d{1,3})\s*(?:min|mins|minute|minutes)\b/i
};

const parseDurationConstraint = (query) => {
  const underMatch = String(query || "").match(DURATION_CONSTRAINT_REGEX.under);
  if (underMatch) {
    const minutes = Number(underMatch[1]);
    if (Number.isFinite(minutes) && minutes > 0) {
      return { type: "max", seconds: minutes * 60 };
    }
  }
  const overMatch = String(query || "").match(DURATION_CONSTRAINT_REGEX.over);
  if (overMatch) {
    const minutes = Number(overMatch[1]);
    if (Number.isFinite(minutes) && minutes > 0) {
      return { type: "min", seconds: minutes * 60 };
    }
  }
  return null;
};

const buildRequirementTerms = (query) => {
  const clean = String(query || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 2 && !NOISE_TERMS.has(part));
  return Array.from(new Set(clean));
};

const buildVideoTextCorpus = (video) => {
  const title = video.title || "";
  const description = video.description || "";
  const folderName = video.folder_name || "";
  const tags = (video.video_tags || []).map((tag) => tag.tag).join(" ");
  const categories = (video.video_categories || [])
    .map((item) => item.category?.name || item.category?.slug || "")
    .join(" ");

  return normalizeLower([title, description, folderName, tags, categories].join(" "));
};

const computeRequirementCoverage = (video, terms) => {
  if (!terms.length) return 0;
  const corpus = buildVideoTextCorpus(video);
  let matched = 0;
  for (const term of terms) {
    if (corpus.includes(term)) matched += 1;
  }
  return clamp(matched / terms.length);
};

const scoreDurationMatch = (video, constraint) => {
  if (!constraint) return 0;
  const duration = Number(video.duration_seconds || 0);
  if (!Number.isFinite(duration) || duration <= 0) return -0.08;
  if (constraint.type === "max") {
    return duration <= constraint.seconds ? 0.1 : -0.18;
  }
  return duration >= constraint.seconds ? 0.1 : -0.18;
};

const buildHeuristicReason = ({ metadataScore, transcriptScore, semanticScore, video }) => {
  if (semanticScore >= 0.68) {
    return "Matches because semantic context from transcript and metadata aligns closely with your brief.";
  }
  if (transcriptScore >= metadataScore && transcriptScore > 0.3) {
    return "Matches because transcript content directly reflects key ideas from your brief.";
  }

  const topTag = video.video_tags?.[0]?.tag;
  if (topTag) {
    return `Matches because its metadata and tag "${topTag}" align with your brief context.`;
  }

  return "Matches because title, description, and folder context are relevant to your brief.";
};

const buildExplanationCandidates = (ranked) =>
  ranked.slice(0, 12).map((entry) => ({
    id: entry.video.id,
    title: entry.video.title,
    description: String(entry.video.description || "").slice(0, 220),
    folder: entry.video.folder_name || "",
    tags: (entry.video.video_tags || []).map((tag) => tag.tag).slice(0, 5),
    categories: (entry.video.video_categories || []).map((item) => item.category?.name).filter(Boolean).slice(0, 4),
    strongestSignal:
      entry.semanticScore >= entry.transcriptScore && entry.semanticScore >= entry.metadataScore
        ? "semantic"
        : entry.transcriptScore >= entry.metadataScore
          ? "transcript"
          : "metadata"
  }));

export class SearchService {
  constructor({ prisma }) {
    this.prisma = prisma;
  }

  async search(query, limit = 30) {
    const q = normalize(query);
    if (!q) return [];
    const qIntent = buildSearchIntentQuery(q);
    const qLower = normalizeLower(qIntent);
    const requirementTerms = buildRequirementTerms(q);
    const durationConstraint = parseDurationConstraint(q);

    const metadataRows = await this.prisma.$queryRawUnsafe(
      `
      SELECT
        v.id AS video_id,
        (
          COALESCE(ts_rank_cd(v.metadata_tsv, websearch_to_tsquery('english', $1)), 0) * 1.4
          + CASE WHEN v.title ILIKE $2 THEN 0.35 ELSE 0 END
          + CASE WHEN coalesce(v.description, '') ILIKE $2 THEN 0.2 ELSE 0 END
          + CASE WHEN coalesce(v.folder_name, '') ILIKE $2 THEN 0.15 ELSE 0 END
          + COALESCE(MAX(CASE WHEN coalesce(vt.normalized_tag, '') LIKE $3 THEN 0.3 ELSE 0 END), 0)
          + COALESCE(MAX(CASE WHEN coalesce(lower(c.name), '') LIKE $3 OR coalesce(lower(c.slug), '') LIKE $3 THEN 0.25 ELSE 0 END), 0)
        ) AS metadata_score
      FROM "videos" v
      LEFT JOIN "video_tags" vt ON vt.video_id = v.id
      LEFT JOIN "video_categories" vc ON vc.video_id = v.id
      LEFT JOIN "categories" c ON c.id = vc.category_id
      WHERE v.status = 'active'
        AND (
          v.metadata_tsv @@ websearch_to_tsquery('english', $1)
          OR v.title ILIKE $2
          OR coalesce(v.description, '') ILIKE $2
          OR coalesce(v.folder_name, '') ILIKE $2
          OR coalesce(vt.normalized_tag, '') LIKE $3
          OR coalesce(lower(c.name), '') LIKE $3
          OR coalesce(lower(c.slug), '') LIKE $3
        )
      GROUP BY v.id
      ORDER BY metadata_score DESC
      LIMIT $4;
      `,
      qIntent,
      `%${qIntent}%`,
      `%${qLower}%`,
      limit * 3
    );

    const transcriptRows = await this.prisma.$queryRawUnsafe(
      `
      SELECT
        tc.video_id,
        (
          COALESCE(MAX(ts_rank_cd(tc.content_tsv, websearch_to_tsquery('english', $1))), 0) * 1.2
          + COALESCE(MAX(CASE WHEN tc.content ILIKE $2 THEN 0.2 ELSE 0 END), 0)
        ) AS transcript_score
      FROM "transcript_chunks" tc
      JOIN "transcripts" t ON t.id = tc.transcript_id
      JOIN "videos" v ON v.id = tc.video_id
      WHERE v.status = 'active'
        AND t.is_active = true
        AND t.status = 'complete'
        AND (
          tc.content_tsv @@ websearch_to_tsquery('english', $1)
          OR tc.content ILIKE $2
        )
      GROUP BY tc.video_id
      ORDER BY transcript_score DESC
      LIMIT $3;
      `,
      qIntent,
      `%${qIntent}%`,
      limit * 3
    );

    const metadataScoreMap = toScoreMap(metadataRows, "video_id", "metadata_score");
    const transcriptScoreMap = toScoreMap(transcriptRows, "video_id", "transcript_score");
    const metadataIds = toIdSet(metadataRows, "video_id");
    const transcriptIds = toIdSet(transcriptRows, "video_id");
    const semanticVideoScores = new Map();
    let runtimeAiConfig = null;
    let openai = null;

    try {
      runtimeAiConfig = await new AdminAiConfigService({ prisma: this.prisma }).getRuntimeConfig();
      if (runtimeAiConfig.openAiApiKey) {
        openai = new OpenAiService({
          apiKey: runtimeAiConfig.openAiApiKey,
          embeddingModel: runtimeAiConfig.embeddingModel,
          transcriptionModel: runtimeAiConfig.transcriptionModel
        });
      }
      if (openai?.isConfigured()) {
        const queryEmbedding = await openai.createEmbedding(qIntent, runtimeAiConfig.embeddingModel);
        const vectorLiteral = `[${queryEmbedding.join(",")}]`;
        const semanticRows = await this.prisma.$queryRawUnsafe(
          `
          WITH scores AS (
            SELECT
              COALESCE(e.video_id, tc.video_id) AS video_id,
              CASE
                WHEN e.scope = 'video_metadata' THEN (1 - (e.embedding <=> $1::vector))
                ELSE (1 - (e.embedding <=> $1::vector)) * 0.9
              END AS similarity
            FROM "embeddings" e
            LEFT JOIN "transcript_chunks" tc ON tc.id = e.transcript_chunk_id
            LEFT JOIN "videos" v ON v.id = COALESCE(e.video_id, tc.video_id)
            WHERE e.scope IN ('video_metadata', 'transcript_chunk')
              AND v.status = 'active'
          )
          SELECT video_id, MAX(similarity) AS similarity
          FROM scores
          WHERE video_id IS NOT NULL
          GROUP BY video_id
          ORDER BY MAX(similarity) DESC
          LIMIT $2;
          `,
          vectorLiteral,
          limit * 3
        );

        for (const row of semanticRows) {
          semanticVideoScores.set(row.video_id, Number(row.similarity) || 0);
        }
      }
    } catch {
      // Semantic search is best-effort for MVP.
    }

    const ids = new Set([
      ...metadataIds,
      ...transcriptIds,
      ...Array.from(semanticVideoScores.keys())
    ]);

    if (ids.size === 0) return [];

    const videos = await this.prisma.videos.findMany({
      where: { id: { in: Array.from(ids) } },
      include: {
        video_tags: true,
        video_categories: {
          include: { category: true }
        }
      }
    });

    const sensitivity = clamp(Number(runtimeAiConfig?.matchSensitivity ?? 0.65));
    const metadataWeight = 0.45 - sensitivity * 0.1;
    const transcriptWeight = 0.25 - sensitivity * 0.05;
    const semanticWeight = 0.3 + sensitivity * 0.15;
    const minScoreThreshold = 0.14 + sensitivity * 0.16;

    const rankedEntries = videos
      .map((video) => {
        const metadataScore = normalizeMetadataScore(metadataScoreMap.get(video.id) || (metadataIds.has(video.id) ? 0.25 : 0));
        const transcriptScore = normalizeTranscriptScore(transcriptScoreMap.get(video.id) || (transcriptIds.has(video.id) ? 0.25 : 0));
        const semanticScore = normalizeSemanticScore(semanticVideoScores.get(video.id) || 0);
        const requirementCoverageScore = computeRequirementCoverage(video, requirementTerms);
        const durationScore = scoreDurationMatch(video, durationConstraint);
        const merged =
          metadataScore * metadataWeight +
          transcriptScore * transcriptWeight +
          semanticScore * semanticWeight +
          requirementCoverageScore * 0.18 +
          durationScore;

        return {
          video,
          metadataScore,
          transcriptScore,
          semanticScore,
          requirementCoverageScore,
          mergedScore: clamp(merged, 0, 0.99)
        };
      })
      .filter((entry) => {
        if (entry.mergedScore < minScoreThreshold) return false;
        if (requirementTerms.length >= 4) {
          return entry.requirementCoverageScore >= 0.25 || entry.semanticScore >= 0.72;
        }
        return true;
      })
      .sort((a, b) => b.mergedScore - a.mergedScore)
      .slice(0, limit);

    if (rankedEntries.length === 0) {
      return [];
    }

    const aiReasonMap = new Map();
    if (openai?.isConfigured()) {
      try {
        const explanationModel = String(runtimeAiConfig?.explanationModel || "gpt-4o-mini");
        const safeModel = explanationModel.includes("transcribe") ? "gpt-4o-mini" : explanationModel;
        const aiCandidates = buildExplanationCandidates(rankedEntries);
        const reasons = await openai.generateMatchReasons({
          query: q,
          candidates: aiCandidates,
          systemPrompt: runtimeAiConfig?.matchReasonPrompt,
          modelOverride: safeModel
        });
        for (const [key, value] of reasons.entries()) {
          aiReasonMap.set(key, value);
        }
      } catch {
        // Explanations are best-effort. We fallback to deterministic reasons.
      }
    }

    const ranked = rankedEntries.map((entry) => {
      const reason =
        aiReasonMap.get(entry.video.id) ||
        buildHeuristicReason({
          metadataScore: entry.metadataScore,
          transcriptScore: entry.transcriptScore,
          semanticScore: entry.semanticScore,
          video: entry.video
        });
      return toVideoCardDto(entry.video, {
        matchScore: entry.mergedScore,
        matchReason: reason
      });
    });

    return ranked;
  }
}
