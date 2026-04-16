import { NextResponse } from "next/server";
import { prisma } from "@/src/server/db/prisma";
import { resolveCurrentUser } from "@/src/server/auth/user-context";
import { FeaturedService } from "@/src/server/services/featured-service";

export const runtime = "nodejs";

export async function GET() {
  try {
    await resolveCurrentUser(prisma);
    const service = new FeaturedService({ prisma });
    const results = await service.listFeatured(24);
    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
