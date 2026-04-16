const slugify = (value) =>
  String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const toDto = (row) => ({
  id: String(row.id),
  name: row.name,
  slug: row.slug,
  description: row.description || ""
});

export class AdminGenreService {
  constructor({ prisma }) {
    this.prisma = prisma;
  }

  async listGenres() {
    const rows = await this.prisma.categories.findMany({
      orderBy: [{ name: "asc" }]
    });
    return rows.map(toDto);
  }

  async createGenre({ name, description = "" }) {
    const cleanName = String(name || "").trim();
    if (!cleanName) throw new Error("Genre name is required.");

    const baseSlug = slugify(cleanName);
    if (!baseSlug) throw new Error("Genre name must include letters or numbers.");

    let slug = baseSlug;
    let suffix = 1;
    // Ensure unique slug.
    while (await this.prisma.categories.findUnique({ where: { slug } })) {
      suffix += 1;
      slug = `${baseSlug}-${suffix}`;
    }

    const created = await this.prisma.categories.create({
      data: {
        name: cleanName,
        slug,
        description: String(description || "").trim() || null
      }
    });
    return toDto(created);
  }

  async updateGenre({ id, name, description }) {
    const genreId = BigInt(id);
    const existing = await this.prisma.categories.findUnique({ where: { id: genreId } });
    if (!existing) throw new Error("Genre not found.");

    const cleanName = name != null ? String(name).trim() : existing.name;
    if (!cleanName) throw new Error("Genre name is required.");

    let nextSlug = existing.slug;
    if (cleanName !== existing.name) {
      const baseSlug = slugify(cleanName);
      if (!baseSlug) throw new Error("Genre name must include letters or numbers.");
      nextSlug = baseSlug;
      let suffix = 1;
      while (true) {
        const row = await this.prisma.categories.findUnique({ where: { slug: nextSlug } });
        if (!row || row.id === genreId) break;
        suffix += 1;
        nextSlug = `${baseSlug}-${suffix}`;
      }
    }

    const updated = await this.prisma.categories.update({
      where: { id: genreId },
      data: {
        name: cleanName,
        slug: nextSlug,
        description:
          description != null ? String(description).trim() || null : existing.description
      }
    });

    return toDto(updated);
  }

  async deleteGenre(id) {
    const genreId = BigInt(id);
    const existing = await this.prisma.categories.findUnique({ where: { id: genreId } });
    if (!existing) throw new Error("Genre not found.");
    await this.prisma.categories.delete({ where: { id: genreId } });
  }
}
