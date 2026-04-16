import { NextResponse } from "next/server";
import { prisma } from "@/src/server/db/prisma";
import { resolveCurrentUser } from "@/src/server/auth/user-context";
import { PlaylistService } from "@/src/server/services/playlist-service";

export const runtime = "nodejs";

export async function GET(_request, { params }) {
  try {
    const user = await resolveCurrentUser(prisma);
    const service = new PlaylistService({ prisma });
    const item = await service.getByShareToken(params.token, user.id);
    return NextResponse.json({ item });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
}
