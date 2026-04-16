import { NextResponse } from "next/server";
import { prisma } from "@/src/server/db/prisma";
import { resolveCurrentUser } from "@/src/server/auth/user-context";
import { PlaylistService } from "@/src/server/services/playlist-service";

export const runtime = "nodejs";

const buildShareUrl = (request, token) => {
  if (!token) return null;
  const base = request.nextUrl?.origin || "";
  return `${base}/playlists/shared/${token}`;
};

export async function GET(request, { params }) {
  try {
    const user = await resolveCurrentUser(prisma);
    const service = new PlaylistService({ prisma });
    const settings = await service.getShareSettings({
      shortlistId: params.id,
      userId: user.id
    });
    return NextResponse.json({
      sharing: {
        ...settings,
        shareUrl: buildShareUrl(request, settings.shareToken)
      }
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode || 400 });
  }
}

export async function PATCH(request, { params }) {
  try {
    const user = await resolveCurrentUser(prisma);
    const body = await request.json().catch(() => ({}));
    const service = new PlaylistService({ prisma });
    const sharing = await service.updateShareSettings({
      shortlistId: params.id,
      userId: user.id,
      action: String(body?.action || "").trim(),
      expiryDays: Number.isFinite(body?.expiryDays) ? Number(body.expiryDays) : undefined
    });

    return NextResponse.json({
      sharing: {
        ...sharing,
        shareUrl: buildShareUrl(request, sharing.shareToken)
      }
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode || 400 });
  }
}
