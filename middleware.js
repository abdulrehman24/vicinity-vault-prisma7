import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

const PROTECTED_PAGES = ["/search", "/featured", "/playlists", "/personal", "/admin"];
const PROTECTED_API_PREFIXES = ["/api/search", "/api/featured", "/api/playlists", "/api/personal", "/api/nav"];
const ADMIN_API_PREFIX = "/api/admin";
const INTERNAL_ADMIN_API_PREFIX = "/api/internal/sync";

const isProtectedPage = (pathname) =>
  PROTECTED_PAGES.some((page) => pathname === page || pathname.startsWith(`${page}/`));

const isProtectedApi = (pathname) =>
  pathname.startsWith(ADMIN_API_PREFIX) ||
  PROTECTED_API_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

export async function middleware(request) {
  const { pathname, search } = request.nextUrl;
  let token = null;
  try {
    const isProduction = process.env.NODE_ENV === "production";
    token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
      cookieName: isProduction ? "__Secure-authjs.session-token" : "authjs.session-token",
      secureCookie: isProduction
    });
  } catch (_error) {
    token = null;
  }
  const isLoggedIn = Boolean(token?.uid || token?.sub);
  const isAdmin = token?.role === "admin";

  if (pathname === "/login" && isLoggedIn) {
    return NextResponse.redirect(new URL("/search", request.url));
  }

  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/admin") && (!isLoggedIn || !isAdmin)) {
    if (!isLoggedIn) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("next", pathname + search);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.redirect(new URL("/search?error=admin_required", request.url));
  }

  if (isProtectedPage(pathname) && !isLoggedIn) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname + search);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname.startsWith(ADMIN_API_PREFIX) && (!isLoggedIn || !isAdmin)) {
    return NextResponse.json({ error: "Admin access required." }, { status: isLoggedIn ? 403 : 401 });
  }

  if (pathname.startsWith(INTERNAL_ADMIN_API_PREFIX) && (!isLoggedIn || !isAdmin)) {
    return NextResponse.json({ error: "Admin access required." }, { status: isLoggedIn ? 403 : 401 });
  }

  if (isProtectedApi(pathname) && !isLoggedIn) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/login",
    "/search/:path*",
    "/featured/:path*",
    "/playlists/:path*",
    "/personal/:path*",
    "/admin/:path*",
    "/api/admin/:path*",
    "/api/internal/sync/:path*",
    "/api/search/:path*",
    "/api/featured/:path*",
    "/api/nav/:path*",
    "/api/playlists/:path*",
    "/api/personal/:path*"
  ]
};
