import { NextResponse } from "next/server";
import { prisma } from "@/src/server/db/prisma";
import { resolveCurrentUser } from "@/src/server/auth/user-context";
import { FavoriteService } from "@/src/server/services/favorite-service";

export const runtime = "nodejs";

export async function GET(request) {
  try {
    const user = await resolveCurrentUser(prisma);
    const service = new FavoriteService({ prisma });
    const items = await service.listForUser(user.id);
    return NextResponse.json({ items });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const user = await resolveCurrentUser(prisma);
    const body = await request.json();
    const service = new FavoriteService({ prisma });
    await service.add(user.id, body?.videoId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

export async function DELETE(request) {
  try {
    const user = await resolveCurrentUser(prisma);
    const body = await request.json();
    const service = new FavoriteService({ prisma });
    await service.remove(user.id, body?.videoId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
