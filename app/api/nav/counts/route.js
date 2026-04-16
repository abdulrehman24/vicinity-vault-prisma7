import { NextResponse } from "next/server";
import { shortlist_visibility } from "@prisma/client";
import { prisma } from "@/src/server/db/prisma";
import { resolveCurrentUser } from "@/src/server/auth/user-context";
import { FeaturedService } from "@/src/server/services/featured-service";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await resolveCurrentUser(prisma);
    const featuredService = new FeaturedService({ prisma });

    const [featuredCount, teamPlaylistCount, savedCount] = await Promise.all([
      featuredService.countFeatured(24),
      prisma.shortlists.count({
        where: {
          visibility: shortlist_visibility.team,
          is_archived: false
        }
      }),
      prisma.favourites.count({
        where: { user_id: user.id }
      })
    ]);

    return NextResponse.json({
      featuredCount,
      teamPlaylistCount,
      savedCount
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode || 500 });
  }
}
