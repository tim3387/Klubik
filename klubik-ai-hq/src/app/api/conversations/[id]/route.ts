import { NextResponse, type NextRequest } from "next/server";
import { guard } from "@/lib/session";
import { conversationActivity, conversationMessages } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "Identifiant invalide." }, { status: 400 });
  const after = Number(req.nextUrl.searchParams.get("after") ?? 0) || 0;
  const [messages, activity] = await Promise.all([conversationMessages(id, after), conversationActivity(id)]);
  return NextResponse.json({ messages, activity });
}
