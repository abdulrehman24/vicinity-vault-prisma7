import { NextResponse } from "next/server";
import { prisma } from "@/src/server/db/prisma";
import { resolveCurrentUser } from "@/src/server/auth/user-context";
import { PlaylistService } from "@/src/server/services/playlist-service";

export const runtime = "nodejs";

export async function POST(request, { params }) {
  try {
    const body = await request.json();
    const user = await resolveCurrentUser(prisma);
    const service = new PlaylistService({ prisma });
    await service.addVideo({
      shortlistId: params.id,
      videoId: body?.videoId,
      userId: user.id
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const body = await request.json();
    const user = await resolveCurrentUser(prisma);
    const service = new PlaylistService({ prisma });
    await service.removeVideo({
      shortlistId: params.id,
      videoId: body?.videoId,
      userId: user.id
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
