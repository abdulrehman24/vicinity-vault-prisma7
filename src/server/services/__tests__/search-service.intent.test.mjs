import test from "node:test";
import assert from "node:assert/strict";
import {
  extractQueryIntent,
  inferVideoIntent,
  computeExactMatchScore,
  computeIntentAlignmentScore,
  parseDurationConstraint,
  isDurationMatch,
  hasSpecificIndustryIntent,
  selectSafeMatchReason
} from "../search-service.js";

const makeVideo = (overrides = {}) => ({
  id: "v1",
  title: "",
  description: "",
  folder_name: "",
  duration_seconds: 120,
  video_tags: [],
  video_categories: [],
  ...overrides
});

test("query intent parses healthcare testimonial", () => {
  const intent = extractQueryIntent("testimonial video in healthcare sector");
  assert.deepEqual(intent.industries, ["healthcare"]);
  assert.deepEqual(intent.formats, ["testimonial"]);
});

test("query intent parses hospitality brand video", () => {
  const intent = extractQueryIntent("hotel brand video");
  assert.deepEqual(intent.industries, ["hospitality"]);
  assert.deepEqual(intent.formats, ["brand"]);
});

test("alias coverage maps doctors symposium to healthcare", () => {
  const intent = extractQueryIntent("doctors symposium testimonial");
  assert.ok(intent.industries.includes("healthcare"));
  assert.ok(intent.formats.includes("testimonial"));
});

test("childcare query intent includes childcare industry aliases", () => {
  const intent = extractQueryIntent("ECDA childcare preschool showcase");
  assert.ok(intent.industries.includes("childcare"));
});

test("video intent infers childcare from ECDA metadata", () => {
  const video = makeVideo({
    title: "ECDA Childcare Anchor Operator Story",
    description: "Early childhood education and preschool insights"
  });
  const inferred = inferVideoIntent(video);
  assert.ok(inferred.industries.includes("childcare"));
});

test("video intent infers healthcare from title signals", () => {
  const video = makeVideo({ title: "Align Symposium - Doctors Testimonial Video" });
  const inferred = inferVideoIntent(video);
  assert.ok(inferred.industries.includes("healthcare"));
  assert.ok(inferred.formats.includes("testimonial"));
});

test("industry conflict penalizes non-matching intent", () => {
  const positive = computeIntentAlignmentScore(["healthcare"], ["healthcare"], {
    weight: 0.28,
    mismatchPenalty: 0.22
  });
  const negative = computeIntentAlignmentScore(["healthcare"], ["hospitality"], {
    weight: 0.28,
    mismatchPenalty: 0.22
  });

  assert.ok(positive > 0);
  assert.ok(negative < 0);
});

test("format preference favors testimonial phrase matches", () => {
  const query = "testimonial video in healthcare sector";
  const terms = ["testimonial", "healthcare"];

  const testimonialVideo = makeVideo({
    title: "Doctors Testimonial",
    description: "Client testimonial for a healthcare symposium"
  });
  const promoVideo = makeVideo({
    title: "Corporate Promo Reel",
    description: "General corporate highlights"
  });

  const testimonialScore = computeExactMatchScore(query, testimonialVideo, terms);
  const promoScore = computeExactMatchScore(query, promoVideo, terms);
  assert.ok(testimonialScore > promoScore);
});

test("childcare-specific terms outrank unrelated content", () => {
  const query = "childcare ECDA preschool";
  const terms = ["childcare", "ecda", "preschool", "early childhood"];

  const childcareVideo = makeVideo({
    title: "ECDA Childcare Transformation",
    description: "Preschool and early childhood programme highlights",
    video_tags: [{ tag: "childcare" }, { tag: "ecda" }]
  });
  const unrelatedVideo = makeVideo({
    title: "Hotel Brand Story",
    description: "Luxury hospitality experience",
    video_tags: [{ tag: "hospitality" }]
  });

  const childcareScore = computeExactMatchScore(query, childcareVideo, terms);
  const unrelatedScore = computeExactMatchScore(query, unrelatedVideo, terms);
  assert.ok(childcareScore > unrelatedScore);
});

test("specific-industry detection triggers for childcare aliases", () => {
  const intent = extractQueryIntent("show me childcare references");
  const specific = hasSpecificIndustryIntent(intent, ["childcare", "ecda"]);
  assert.equal(specific, true);
});

test("reason guard falls back to deterministic reason when evidence is weak", () => {
  const entry = {
    video: makeVideo({
      title: "General Corporate Highlights",
      description: "Broad reel with no childcare reference",
      video_tags: [{ tag: "corporate" }]
    }),
    metadataScore: 0.2,
    transcriptScore: 0.2,
    semanticScore: 0.1,
    exactMatchScore: 0.01,
    requirementCoverageScore: 0.05
  };

  const reason = selectSafeMatchReason({
    aiReason: "Matches because this contains childcare and ECDA stories.",
    entry,
    requirementTerms: ["childcare", "ecda"]
  });

  assert.ok(reason.startsWith("Matches because"));
  assert.notEqual(reason, "Matches because this contains childcare and ECDA stories.");
});

test("duration parsing supports decimals and strict matching", () => {
  const under = parseDurationConstraint("Corporate Video under 1.5 minutes");
  assert.equal(under?.type, "max");
  assert.equal(Math.round(under?.seconds || 0), 90);

  const range = parseDurationConstraint("Corporate Video 2 to 3 minutes");
  assert.equal(range?.type, "range");

  const ok = makeVideo({ duration_seconds: 150 });
  const bad = makeVideo({ duration_seconds: 230 });

  assert.equal(isDurationMatch(ok, range), true);
  assert.equal(isDurationMatch(bad, range), false);
});
