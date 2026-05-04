import { NextResponse } from "next/server";
import { prisma } from "@/src/server/db/prisma";
import { resolveCurrentUser } from "@/src/server/auth/user-context";
import { SearchService } from "@/src/server/services/search-service";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const user = await resolveCurrentUser(prisma);
    const body = await request.json().catch(() => ({}));
    const query = String(body?.query || "");
    const limit = Number.isFinite(body?.limit) ? Number(body.limit) : 30;
    const service = new SearchService({ prisma });
    const results = await service.search(query, limit);

    const normalizedQuery = query.trim().toLowerCase();
    if (normalizedQuery && results.length > 0) {
      await prisma.$executeRaw`
        INSERT INTO "search_history" (
          user_id,
          query,
          normalized_query,
          result_count,
          search_count,
          created_at,
          updated_at
        )
        VALUES (
          ${user.id}::uuid,
          ${query.trim()},
          ${normalizedQuery},
          ${results.length},
          1,
          NOW(),
          NOW()
        )
        ON CONFLICT (user_id, normalized_query)
        DO UPDATE SET
          query = EXCLUDED.query,
          result_count = EXCLUDED.result_count,
          search_count = "search_history".search_count + 1,
          updated_at = NOW()
      `;
    }

    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
