import { NextResponse, type NextRequest } from "next/server";
import { getSql } from "@/lib/db";
import { guard } from "@/lib/session";
import { saveSettings } from "@/lib/settings";

export async function POST(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  const r = await saveSettings(getSql(), await req.json().catch(() => ({})));
  return r.ok ? NextResponse.json({ ok: true, value: r.value }) : NextResponse.json({ error: r.error }, { status: 400 });
}
