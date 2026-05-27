// Gates /admin and /api/admin/* on the standalone admin session cookie
// (lib/adminAuth.js). No Supabase auth — listing submissions are anonymous.

import { NextResponse } from "next/server";
import { isValidAdminCookie, adminCookieName } from "@/lib/adminAuth";

export async function middleware(request) {
  const path = request.nextUrl.pathname;

  const isAdminLoginRoute =
    path === "/admin/login" || path === "/api/admin/login";
  const isAdminArea =
    path === "/admin" ||
    path.startsWith("/admin/") ||
    path.startsWith("/api/admin/");

  if (isAdminArea && !isAdminLoginRoute) {
    const cookie = request.cookies.get(adminCookieName())?.value;
    if (!(await isValidAdminCookie(cookie))) {
      // Page requests: send to login so the admin can recover from an
      // expired cookie. API requests: 404 to keep the surface dark.
      if (!path.startsWith("/api/")) {
        return NextResponse.redirect(new URL("/admin/login", request.url));
      }
      return new NextResponse("Not found", { status: 404 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Only run on admin paths — everything else is anonymous public traffic.
    "/admin/:path*",
    "/api/admin/:path*",
  ],
};
