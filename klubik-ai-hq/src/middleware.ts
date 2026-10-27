// Tout est privé, sauf la connexion, la configuration initiale, le contrôle de santé et les ressources PWA.
// Le middleware vérifie la signature de session ; la révocation est contrôlée côté serveur (lib/session.ts).
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";

const PUBLIC = [/^\/login$/, /^\/setup$/, /^\/api\/auth\/(login|setup)$/, /^\/api\/health$/, /^\/manifest\.webmanifest$/, /^\/icons\//, /^\/logo-klubik\.png$/];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // Requêtes qui modifient des données : refusées si elles viennent d'un autre site (protection CSRF).
  if (req.method !== "GET" && req.method !== "HEAD") {
    const origin = req.headers.get("origin");
    if (origin) {
      // Hôtes légitimes : celui de la requête, celui transmis par le proxy de l'hébergeur, l'URL publique Render.
      const ok = [req.headers.get("host"), req.headers.get("x-forwarded-host"), process.env.RENDER_EXTERNAL_URL && new URL(process.env.RENDER_EXTERNAL_URL).host]
        .filter(Boolean);
      let o = "";
      try { o = new URL(origin).host; } catch { /* origine illisible : refusée */ }
      if (!ok.includes(o)) return NextResponse.json({ error: "Origine refusée" }, { status: 403 });
    }
  }
  if (PUBLIC.some((r) => r.test(pathname))) return NextResponse.next();
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (session) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
