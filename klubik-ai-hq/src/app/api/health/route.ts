// Contrôle de santé de l'hébergeur. Il vérifie que le serveur répond, pas la base : redémarrer le serveur
// ne réparerait pas une base injoignable (le moteur reprend tout seul quand elle revient). Public, sans détail.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true });
}
