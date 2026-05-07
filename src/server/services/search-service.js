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
  "industry",
  "sector",
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
const DURATION_MINUTE_PART = "(\\d{1,3}(?:\\.\\d{1,2})?)";
const DURATION_CONSTRAINT_REGEX = {
  between: new RegExp(
    `\\b(?:between\\s+)?${DURATION_MINUTE_PART}\\s*(?:-|to|and)\\s*${DURATION_MINUTE_PART}\\s*(?:min|mins|minute|minutes)\\b`,
    "i"
  ),
  under: new RegExp(
    `\\b(?:under|less than|below|shorter than|max(?:imum)?(?: of)?)\\s+${DURATION_MINUTE_PART}\\s*(?:min|mins|minute|minutes)\\b`,
    "i"
  ),
  over: new RegExp(
    `\\b(?:over|more than|above|longer than|min(?:imum)?(?: of)?)\\s+${DURATION_MINUTE_PART}\\s*(?:min|mins|minute|minutes)\\b`,
    "i"
  )
};

export const parseDurationConstraint = (query) => {
  const betweenMatch = String(query || "").match(DURATION_CONSTRAINT_REGEX.between);
  if (betweenMatch) {
    const first = Number(betweenMatch[1]);
    const second = Number(betweenMatch[2]);
    if (Number.isFinite(first) && Number.isFinite(second) && first > 0 && second > 0) {
      const min = Math.min(first, second);
      const max = Math.max(first, second);
      return { type: "range", minSeconds: min * 60, maxSeconds: max * 60 };
    }
  }

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
  const expanded = [...clean];
  for (const term of clean) {
    const group = CHILDCARE_TERM_TO_GROUP[term];
    if (!group) continue;
    // Add only the canonical group token to avoid diluting coverage thresholds.
    expanded.push(group);
  }
  return Array.from(new Set(expanded));
};

const CHILDCARE_DOMAIN_ALIASES = {
  childcare: [
    "childcare",
    "child care",
    "early childhood",
    "early childhood education",
    "ece",
    "ecda",
    "early years",
    "preschool",
    "pre school",
    "kindergarten",
    "infant care",
    "toddler care",
    "child development",
    "anchor operator",
    "sparkle tots",
    "pcf"
  ]
};

const CHILDCARE_TERM_TO_GROUP = Object.entries(CHILDCARE_DOMAIN_ALIASES).reduce((acc, [group, aliases]) => {
  for (const alias of aliases) {
    acc[alias] = group;
  }
  return acc;
}, {});

const REQUIREMENT_SYNONYMS = {
  format: [
    "highlight",
    "highlights",
    "event",
    "interview",
    "interviews",
    "testimonial",
    "testimonials",
    "case study",
    "documentary",
    "promo",
    "commercial"
  ],
  audience: ["corporate", "enterprise", "b2b", "executive", "boardroom"],
  style: ["premium", "luxury", "cinematic", "polished", "elegant", "high-end"],
  industry: ["healthcare", "medical", "hospital", "pharma", "biotech", "clinical", "hospitality", "hotel", "resort", "travel"]
};

const INTENT_TAXONOMY = {
  industry: {
    healthcare: [
      "healthcare",
      "medical",
      "hospital",
      "doctor",
      "doctors",
      "physician",
      "physicians",
      "patient",
      "patients",
      "clinical",
      "clinic",
      "nurse",
      "nurses",
      "pharma",
      "biotech",
      "symposium"
    ],
    hospitality: [
      "hospitality",
      "hotel",
      "hotels",
      "resort",
      "resorts",
      "tourism",
      "travel",
      "guest",
      "guests",
      "intercontinental"
    ],
    childcare: [
      "childcare",
      "child care",
      "ecda",
      "ece",
      "early childhood",
      "early childhood education",
      "early years",
      "preschool",
      "pre school",
      "kindergarten",
      "infant care",
      "toddler care",
      "child development",
      "anchor operator",
      "sparkle tots",
      "pcf"
    ]
  },
  format: {
    testimonial: ["testimonial", "testimonials", "client story", "customer story"],
    brand: ["brand video", "brand film", "brand", "company profile"],
    case_study: ["case study", "case-study", "success story"],
    interview: ["interview", "interviews", "talking head"],
    highlights: ["highlight", "highlights", "recap"]
  },
  audience: {
    corporate: ["corporate", "enterprise", "b2b", "executive", "boardroom"]
  },
  style: {
    cinematic: ["cinematic", "premium", "luxury", "polished", "elegant", "high-end"]
  }
};

const EXACT_PHRASE_INTENTS = [
  "brand video",
  "brand film",
  "case study",
  "client story",
  "customer story",
  "company profile",
  "talking head"
];

const INDUSTRY_INTENT_ALIASES = {
  healthcare: [
    "healthcare",
    "medical",
    "hospital",
    "doctor",
    "doctors",
    "physician",
    "physicians",
    "patient",
    "patients",
    "clinical",
    "clinic",
    "nurse",
    "nurses",
    "pharma",
    "biotech",
      "symposium"
    ],
  hospitality: ["hospitality", "hotel", "hotels", "resort", "resorts", "tourism", "travel", "guest", "guests", "intercontinental"],
  childcare: [
    "childcare",
    "child care",
    "ecda",
    "ece",
    "early childhood",
    "early childhood education",
    "early years",
    "preschool",
    "pre school",
    "kindergarten",
    "infant care",
    "toddler care",
    "child development",
    "anchor operator",
    "sparkle tots",
    "pcf"
  ]
};

const INDUSTRY_TERM_TO_INTENT = Object.entries(INDUSTRY_INTENT_ALIASES).reduce((acc, [intent, aliases]) => {
  for (const alias of aliases) {
    acc[alias] = intent;
  }
  return acc;
}, {});

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const containsTerm = (text, term) => {
  if (!text || !term) return false;
  if (term.includes(" ")) {
    const pattern = new RegExp(`(?:^|\\s)${escapeRegExp(term)}(?:$|\\s)`, "i");
    return pattern.test(text);
  }
  const pattern = new RegExp(`\\b${escapeRegExp(term)}\\b`, "i");
  return pattern.test(text);
};

const canonicalizeIntentGroup = (queryText, groupMap) => {
  const canonical = new Set();
  for (const [name, aliases] of Object.entries(groupMap)) {
    if (aliases.some((alias) => containsTerm(queryText, alias))) {
      canonical.add(name);
    }
  }
  return Array.from(canonical);
};

export const extractQueryIntent = (query) => {
  const lower = normalizeLower(query);
  if (!lower) {
    return { industries: [], formats: [], audiences: [], styles: [] };
  }

  return {
    industries: canonicalizeIntentGroup(lower, INTENT_TAXONOMY.industry),
    formats: canonicalizeIntentGroup(lower, INTENT_TAXONOMY.format),
    audiences: canonicalizeIntentGroup(lower, INTENT_TAXONOMY.audience),
    styles: canonicalizeIntentGroup(lower, INTENT_TAXONOMY.style)
  };
};

const extractStructuredRequirements = (query) => {
  const lower = normalizeLower(query);
  const matched = [];

  for (const [group, terms] of Object.entries(REQUIREMENT_SYNONYMS)) {
    const hits = terms.filter((term) => lower.includes(term));
    if (hits.length) {
      matched.push({ group, terms: Array.from(new Set(hits)) });
    }
  }

  return matched;
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

export const inferVideoIntent = (video) => {
  const corpus = buildVideoTextCorpus(video);
  return {
    industries: canonicalizeIntentGroup(corpus, INTENT_TAXONOMY.industry),
    formats: canonicalizeIntentGroup(corpus, INTENT_TAXONOMY.format),
    audiences: canonicalizeIntentGroup(corpus, INTENT_TAXONOMY.audience),
    styles: canonicalizeIntentGroup(corpus, INTENT_TAXONOMY.style)
  };
};

export const computeExactMatchScore = (query, video, requirementTerms = []) => {
  const queryLower = normalizeLower(query);
  const title = normalizeLower(video.title || "");
  const description = normalizeLower(video.description || "");
  const folder = normalizeLower(video.folder_name || "");
  const tags = normalizeLower((video.video_tags || []).map((tag) => tag.tag).join(" "));
  const categories = normalizeLower(
    (video.video_categories || [])
      .map((item) => item.category?.name || item.category?.slug || "")
      .join(" ")
  );
  const corpus = `${title} ${description} ${folder} ${tags} ${categories}`.trim();

  let score = 0;
  if (title && queryLower && containsTerm(title, queryLower)) score += 0.5;

  for (const phrase of EXACT_PHRASE_INTENTS) {
    if (containsTerm(queryLower, phrase)) {
      if (containsTerm(title, phrase)) score += 0.26;
      else if (containsTerm(tags, phrase) || containsTerm(categories, phrase)) score += 0.2;
      else if (containsTerm(corpus, phrase)) score += 0.12;
    }
  }

  for (const term of requirementTerms) {
    if (containsTerm(title, term)) score += 0.08;
    else if (containsTerm(tags, term) || containsTerm(categories, term)) score += 0.06;
    else if (containsTerm(corpus, term)) score += 0.03;
  }

  return clamp(score, 0, 1);
};

export const computeIntentAlignmentScore = (expected = [], actual = [], { weight = 0.2, mismatchPenalty = 0.2 } = {}) => {
  if (!expected.length) return 0;
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  const matches = expected.filter((item) => actualSet.has(item)).length;
  if (matches > 0) {
    return clamp((matches / expectedSet.size) * weight, 0, weight);
  }
  return -Math.abs(mismatchPenalty);
};

const computeRequirementCoverage = (video, terms, structuredRequirements = []) => {
  const corpus = buildVideoTextCorpus(video);
  let keywordCoverage = 0;

  if (terms.length) {
    let matched = 0;
    for (const term of terms) {
      if (corpus.includes(term)) matched += 1;
    }
    keywordCoverage = clamp(matched / terms.length);
  }

  if (!structuredRequirements.length) return keywordCoverage;

  let structuredMatched = 0;
  for (const requirement of structuredRequirements) {
    let isGroupMatched = requirement.terms.some((term) => corpus.includes(term));
    if (!isGroupMatched && requirement.group === "industry") {
      const industryIntents = Array.from(
        new Set(
          requirement.terms
            .map((term) => INDUSTRY_TERM_TO_INTENT[term])
            .filter(Boolean)
        )
      );
      isGroupMatched = industryIntents.some((intent) =>
        (INDUSTRY_INTENT_ALIASES[intent] || []).some((alias) => corpus.includes(alias))
      );
    }
    if (isGroupMatched) {
      structuredMatched += 1;
    }
  }
  const structuredCoverage = clamp(structuredMatched / structuredRequirements.length);

  return clamp(keywordCoverage * 0.55 + structuredCoverage * 0.45);
};

export const hasSpecificIndustryIntent = (queryIntent = {}, requirementTerms = []) => {
  if ((queryIntent.industries || []).length > 0) return true;
  return requirementTerms.some((term) => Boolean(INDUSTRY_TERM_TO_INTENT[term] || CHILDCARE_TERM_TO_GROUP[term]));
};

const matchesChildcareEvidence = (reason, video, requirementTerms = []) => {
  const lower = normalizeLower(reason);
  if (!lower) return false;
  const corpus = buildVideoTextCorpus(video);
  const evidenceTerms = requirementTerms.filter((term) => CHILDCARE_TERM_TO_GROUP[term] || term === "childcare");
  if (evidenceTerms.length === 0) return true;
  return evidenceTerms.some((term) => lower.includes(term) && corpus.includes(term));
};

export const isDurationMatch = (video, constraint) => {
  if (!constraint) return true;
  const duration = Number(video.duration_seconds || 0);
  if (!Number.isFinite(duration) || duration <= 0) return false;
  if (constraint.type === "range") {
    return duration >= constraint.minSeconds && duration <= constraint.maxSeconds;
  }
  if (constraint.type === "max") {
    return duration <= constraint.seconds;
  }
  return duration >= constraint.seconds;
};

const scoreDurationMatch = (video, constraint) => {
  if (!constraint) return 0;
  const duration = Number(video.duration_seconds || 0);
  if (!Number.isFinite(duration) || duration <= 0) return -0.08;
  if (constraint.type === "range") {
    return duration >= constraint.minSeconds && duration <= constraint.maxSeconds ? 0.12 : -0.2;
  }
  if (constraint.type === "max") {
    return duration <= constraint.seconds ? 0.1 : -0.18;
  }
  return duration >= constraint.seconds ? 0.1 : -0.18;
};

const pickBestMatchingTag = (video, requirementTerms = []) => {
  const tags = (video.video_tags || [])
    .map((item) => String(item?.tag || "").trim())
    .filter(Boolean);
  if (tags.length === 0) return null;

  const normalizedTerms = requirementTerms.map((term) => normalizeLower(term)).filter(Boolean);
  const matchingTag = tags.find((tag) => {
    const lowerTag = normalizeLower(tag);
    return normalizedTerms.some((term) => lowerTag.includes(term) || term.includes(lowerTag));
  });
  if (matchingTag) return matchingTag;
  return tags[0];
};

const buildHeuristicReason = ({ metadataScore, transcriptScore, semanticScore, video, requirementTerms = [] }) => {
  if (semanticScore >= 0.68) {
    return "Matches because semantic context from transcript and metadata aligns closely with your brief.";
  }
  if (transcriptScore >= metadataScore && transcriptScore > 0.3) {
    return "Matches because transcript content directly reflects key ideas from your brief.";
  }

  const topTag = pickBestMatchingTag(video, requirementTerms);
  if (topTag) {
    return `Matches because its metadata and tag "${topTag}" align with your brief context.`;
  }

  return "Matches because title, description, and folder context are relevant to your brief.";
};

export const selectSafeMatchReason = ({
  aiReason,
  entry,
  requirementTerms
}) => {
  if (!aiReason) {
    return buildHeuristicReason({
      metadataScore: entry.metadataScore,
      transcriptScore: entry.transcriptScore,
      semanticScore: entry.semanticScore,
      video: entry.video,
      requirementTerms
    });
  }

  const minEvidence = entry.exactMatchScore >= 0.06 || entry.requirementCoverageScore >= 0.2;
  const childcareEvidenceOk = matchesChildcareEvidence(aiReason, entry.video, requirementTerms);
  if (!minEvidence || !childcareEvidenceOk) {
    return buildHeuristicReason({
      metadataScore: entry.metadataScore,
      transcriptScore: entry.transcriptScore,
      semanticScore: entry.semanticScore,
      video: entry.video,
      requirementTerms
    });
  }
  return aiReason;
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

  async search(query, limitOrOptions = 30, maybeOffset = 0) {
    const options =
      typeof limitOrOptions === "object" && limitOrOptions !== null
        ? limitOrOptions
        : { limit: limitOrOptions, offset: maybeOffset };
    const limit = Math.max(1, Math.min(100, Number(options.limit) || 30));
    const offset = Math.max(0, Number(options.offset) || 0);
    const q = normalize(query);
    if (!q) return [];
    const candidateLimit = Math.max(limit + offset, limit) * 3;
    const qIntent = buildSearchIntentQuery(q);
    const qLower = normalizeLower(qIntent);
    const requirementTerms = buildRequirementTerms(q);
    const structuredRequirements = extractStructuredRequirements(q);
    const durationConstraint = parseDurationConstraint(q);
    const queryIntent = extractQueryIntent(q);
    const hasSpecificIntent = hasSpecificIndustryIntent(queryIntent, requirementTerms);

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
      candidateLimit
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
      candidateLimit
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
          candidateLimit
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
        const inferredVideoIntent = inferVideoIntent(video);
        const exactMatchScore = computeExactMatchScore(q, video, requirementTerms);
        const industryAlignmentScore = computeIntentAlignmentScore(
          queryIntent.industries,
          inferredVideoIntent.industries,
          { weight: hasSpecificIntent ? 0.34 : 0.28, mismatchPenalty: hasSpecificIntent ? 0.34 : 0.22 }
        );
        const formatAlignmentScore = computeIntentAlignmentScore(
          queryIntent.formats,
          inferredVideoIntent.formats,
          { weight: 0.2, mismatchPenalty: 0.12 }
        );
        const requirementCoverageScore = computeRequirementCoverage(
          video,
          requirementTerms,
          structuredRequirements
        );
        const durationScore = scoreDurationMatch(video, durationConstraint);
        const merged =
          metadataScore * (metadataWeight + 0.08) +
          transcriptScore * transcriptWeight +
          semanticScore * semanticWeight +
          exactMatchScore * (hasSpecificIntent ? 0.34 : 0.24) +
          industryAlignmentScore +
          formatAlignmentScore +
          requirementCoverageScore * (hasSpecificIntent ? 0.24 : 0.18) +
          durationScore;

        return {
          video,
          metadataScore,
          transcriptScore,
          semanticScore,
          exactMatchScore,
          industryAlignmentScore,
          formatAlignmentScore,
          requirementCoverageScore,
          rankingDebug: {
            inferredVideoIntent,
            queryIntent
          },
          mergedScore: clamp(merged, 0, 0.99)
        };
      })
      .filter((entry) => {
        if (durationConstraint && !isDurationMatch(entry.video, durationConstraint)) return false;
        if (entry.mergedScore < minScoreThreshold) return false;
        if (hasSpecificIntent) {
          const intentAligned = entry.industryAlignmentScore >= 0 || entry.requirementCoverageScore >= 0.3;
          const exactEnough =
            entry.exactMatchScore >= 0.06 ||
            entry.requirementCoverageScore >= 0.22 ||
            entry.semanticScore >= 0.74;
          if (!intentAligned || !exactEnough) return false;
        }
        if (structuredRequirements.length >= 2) {
          return entry.requirementCoverageScore >= 0.35 || entry.semanticScore >= 0.76;
        }
        if (requirementTerms.length >= 4) {
          return entry.requirementCoverageScore >= 0.25 || entry.semanticScore >= 0.72;
        }
        return true;
      })
      .sort((a, b) => b.mergedScore - a.mergedScore)
      .slice(offset, offset + limit);

    if (rankedEntries.length === 0) {
      return [];
    }

    const aiReasonMap = new Map();
    if (openai?.isConfigured()) {
      try {
        const explanationModel = String(runtimeAiConfig?.explanationModel || "gpt-5-nano");
        const safeModel = explanationModel.includes("transcribe") ? "gpt-5-nano" : explanationModel;
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
      const reason = selectSafeMatchReason({
        aiReason: aiReasonMap.get(entry.video.id),
        entry,
        requirementTerms
      });
      return toVideoCardDto(entry.video, {
        matchScore: entry.mergedScore,
        matchReason: reason
      });
    });

    return ranked;
  }
}
