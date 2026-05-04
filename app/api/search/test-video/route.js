import { NextResponse } from "next/server";
import { prisma } from "@/src/server/db/prisma";
import { resolveCurrentUser } from "@/src/server/auth/user-context";
import { VimeoClient } from "@/src/server/services/vimeo-client";
import { inferVideoIntent } from "@/src/server/services/search-service";
import { decryptSecret } from "@/src/server/security/secrets";

export const runtime = "nodejs";

const extractVimeoId = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return raw;

  const match = raw.match(/vimeo\.com\/(?:video\/)?(\d+)/i) || raw.match(/\/(\d+)(?:\/|$|\?)/);
  return match?.[1] || null;
};

export async function POST(request) {
  try {
    await resolveCurrentUser(prisma);
    const body = await request.json().catch(() => ({}));
    const input = String(body?.vimeoId || "");
    const sourceId = String(body?.sourceId || "").trim();
    const vimeoId = extractVimeoId(input);

    if (!vimeoId) {
      return NextResponse.json({ error: "Please provide a valid Vimeo ID or Vimeo URL." }, { status: 400 });
    }

    let client = new VimeoClient();
    if (sourceId) {
      const source = await prisma.data_sources.findFirst({
        where: { id: sourceId, platform: "vimeo" },
        select: { id: true, name: true, status: true, access_token_encrypted: true }
      });
      if (!source) {
        return NextResponse.json({ error: "Selected Vimeo source was not found." }, { status: 404 });
      }
      const token = decryptSecret(source.access_token_encrypted);
      if (!token) {
        return NextResponse.json({ error: `Source "${source.name}" has no valid Vimeo token.` }, { status: 400 });
      }
      client = new VimeoClient(token);
    }

    const video = await client.getVideoById(vimeoId);
    const inferredIntent = inferVideoIntent({
      title: video.title,
      description: video.description,
      folder_name: video.folderName,
      video_tags: (video.tags || []).map((tag) => ({ tag })),
      video_categories: []
    });

    return NextResponse.json({
      input,
      vimeoId,
      sourceId: sourceId || null,
      inferredIntent,
      video
    });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to fetch Vimeo video." }, { status: 500 });
  }
}

export async function GET() {
  try {
    await resolveCurrentUser(prisma);
    const sources = await prisma.data_sources.findMany({
      where: { platform: "vimeo" },
      orderBy: { created_at: "asc" },
      select: { id: true, name: true, status: true, access_token_encrypted: true }
    });

    const items = sources.map((source) => ({
      id: source.id,
      name: source.name,
      status: source.status,
      hasToken: Boolean(decryptSecret(source.access_token_encrypted))
    }));

    return NextResponse.json({ sources: items });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to load Vimeo sources." }, { status: 500 });
  }
}
