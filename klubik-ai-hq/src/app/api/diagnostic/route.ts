// État du serveur pour vérifier le déploiement (mémoire, moteur, base, sauvegardes). Réservé à l'utilisateur connecté.
import { NextResponse } from "next/server";
import { diagnostic } from "@/lib/diagnostic";
import { guard } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  return NextResponse.json(await diagnostic());
}
