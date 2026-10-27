import { NextResponse, type NextRequest } from "next/server";
import { decide, type Decision } from "@/lib/actions";
import { getSql } from "@/lib/db";
import { guard } from "@/lib/session";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;
  const { decision } = (await req.json().catch(() => ({}))) as { decision?: Decision };
  if (!decision || !["approve", "reject", "sent"].includes(decision)) return NextResponse.json({ error: "Décision invalide." }, { status: 400 });
  const r = await decide(getSql(), id, decision);
  return NextResponse.json(r, { status: r.ok ? 200 : 409 });
}
