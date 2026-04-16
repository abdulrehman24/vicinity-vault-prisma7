import { NextResponse } from "next/server";
import { prisma } from "@/src/server/db/prisma";
import { resolveCurrentUser } from "@/src/server/auth/user-context";
import { SearchService } from "@/src/server/services/search-service";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    await resolveCurrentUser(prisma);
    const body = await request.json().catch(() => ({}));
    const query = String(body?.query || "");
    const limit = Number.isFinite(body?.limit) ? Number(body.limit) : 30;
    const service = new SearchService({ prisma });
    const results = await service.search(query, limit);
    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
