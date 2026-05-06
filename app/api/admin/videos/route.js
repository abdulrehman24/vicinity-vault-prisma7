import { NextResponse } from "next/server";
import { prisma } from "@/src/server/db/prisma";
import { assertAdminRequest } from "@/src/server/auth/admin";
import { AdminVideoService } from "@/src/server/services/admin-video-service";

export const runtime = "nodejs";

export async function GET(request) {
  try {
    await assertAdminRequest(request, prisma);
    const url = new URL(request.url);
    const service = new AdminVideoService({ prisma });
    const result = await service.listVideos({
      page: Number(url.searchParams.get("page") || 1),
      limit: Number(url.searchParams.get("limit") || 25),
      search: String(url.searchParams.get("search") || ""),
      folder: String(url.searchParams.get("folder") || ""),
      sourceId: String(url.searchParams.get("sourceId") || "")
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode || 400 });
  }
}
