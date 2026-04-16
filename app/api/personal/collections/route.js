import { NextResponse } from "next/server";
import { prisma } from "@/src/server/db/prisma";
import { resolveCurrentUser } from "@/src/server/auth/user-context";
import { PlaylistService } from "@/src/server/services/playlist-service";

export const runtime = "nodejs";

export async function GET(request) {
  try {
    const user = await resolveCurrentUser(prisma);
    const service = new PlaylistService({ prisma });
    const items = await service.listForOwner(user.id);
    return NextResponse.json({ items });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const user = await resolveCurrentUser(prisma);
    const service = new PlaylistService({ prisma });
    const item = await service.create({
      ownerUserId: user.id,
      visibility: "private",
      name: String(body?.name || "").trim(),
      description: String(body?.description || "").trim()
    });
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
