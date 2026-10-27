// Tout est privé, sauf la connexion, la configuration initiale, le contrôle de santé et les ressources PWA.
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

const PUBLIC = [/^\/login$/, /^\/setup$/, /^\/api\/auth\/(login|setup)$/, /^\/api\/health$/, /^\/manifest\.webmanifest$/, /^\/icons\//, /^\/logo-klubik\.png$/];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((r) => r.test(pathname))) return NextResponse.next();
  const user = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (user) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
