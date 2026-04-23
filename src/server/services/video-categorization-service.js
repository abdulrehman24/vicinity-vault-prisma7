const DEFAULT_CATEGORY_KEYWORDS = {
  corporate: ["corporate", "company", "brand", "business", "office", "internal"],
  healthcare: ["healthcare", "medical", "hospital", "clinic", "patient", "pharma", "biotech"],
  event: ["event", "conference", "summit", "expo", "launch", "ceremony"],
  testimonial: ["testimonial", "customer story", "case study", "review", "client story"],
  documentary: ["documentary", "storytelling", "behind the scenes", "journey"],
  interview: ["interview", "talking head", "q&a", "conversation", "speaker"],
  training: ["training", "onboarding", "tutorial", "how to", "instructional"]
};

const normalizeText = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const scoreCategory = (text, keywords = []) => {
  if (!text || !keywords.length) return 0;
  let score = 0;
  for (const keyword of keywords) {
    const key = normalizeText(keyword);
    if (!key) continue;
    if (text.includes(key)) {
      score += key.includes(" ") ? 0.25 : 0.15;
    }
  }
  return Math.min(0.99, score);
};

export class VideoCategorizationService {
  constructor({ prisma, logger = console }) {
    this.prisma = prisma;
    this.logger = logger;
  }

  async ensureDefaultCategories() {
    const entries = Object.entries(DEFAULT_CATEGORY_KEYWORDS);
    if (!entries.length) return;

    await Promise.all(
      entries.map(([slug]) =>
        this.prisma.categories.upsert({
          where: { slug },
          update: {},
          create: {
            slug,
            name: slug.charAt(0).toUpperCase() + slug.slice(1)
          }
        })
      )
    );
  }

  async categorizeVideo({ videoId, title, description, folderName, tags = [], transcriptText = "" }) {
    this.logger.debug("Video categorization started", { videoId });
    await this.ensureDefaultCategories();

    const categories = await this.prisma.categories.findMany({
      select: { id: true, slug: true, name: true, description: true }
    });

    if (!categories.length) {
      this.logger.warn("Video categorization skipped: no categories configured", { videoId });
      return { assigned: 0 };
    }

    const corpus = normalizeText(
      [title, description, folderName, ...(tags || []), transcriptText]
        .filter(Boolean)
        .join(" ")
    );

    if (!corpus) {
      await this.prisma.video_categories.deleteMany({ where: { video_id: videoId } });
      this.logger.info("Video categorization cleared: empty corpus", { videoId });
      return { assigned: 0 };
    }

    const ranked = categories
      .map((category) => {
        const fallbackKeys = [
          category.slug,
          category.name,
          ...(category.description ? [category.description] : [])
        ];
        const configured = DEFAULT_CATEGORY_KEYWORDS[category.slug] || [];
        const confidence = scoreCategory(corpus, [...configured, ...fallbackKeys]);
        return {
          categoryId: category.id,
          confidence
        };
      })
      .filter((item) => item.confidence >= 0.15)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3);

    await this.prisma.video_categories.deleteMany({ where: { video_id: videoId } });
    if (!ranked.length) {
      this.logger.info("Video categorization completed: no category matched threshold", { videoId });
      return { assigned: 0 };
    }

    await this.prisma.video_categories.createMany({
      data: ranked.map((item) => ({
        video_id: videoId,
        category_id: item.categoryId,
        confidence: item.confidence
      }))
    });

    this.logger.info("Video categorization saved", {
      videoId,
      assigned: ranked.length
    });
    return { assigned: ranked.length };
  }
}
