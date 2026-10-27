// Compteurs légers pour l'interface (badge des actions, missions en cours).
import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { guard } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  const sql = getSql();
  const [r] = await sql<{ actions: number; missions: number }[]>`
    select (select count(*) from actions where status = 'pending')::int as actions,
           (select count(*) from tasks where parent_id is null and status in ('ready', 'running', 'waiting'))::int as missions`;
  return NextResponse.json(r);
}
