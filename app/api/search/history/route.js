import { NextResponse } from "next/server";
import { prisma } from "@/src/server/db/prisma";
import { resolveCurrentUser } from "@/src/server/auth/user-context";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await resolveCurrentUser(prisma);
    const items = await prisma.$queryRaw`
      SELECT id::text AS id, query, result_count, search_count, updated_at
      FROM "search_history"
      WHERE user_id = ${user.id}::uuid
      ORDER BY updated_at DESC
      LIMIT 12
    `;

    return NextResponse.json({ items });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
