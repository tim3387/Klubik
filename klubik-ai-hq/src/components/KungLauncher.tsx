"use client";
// Carte d'accueil de Kung : confier une mission dès l'ouverture de l'application.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PROFILES } from "@/lib/agents/profiles";
import Avatar from "./Avatar";

const kung = PROFILES.kung;

export default function KungLauncher() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function send(value: string) {
    const t = value.trim();
    if (!t || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ agentId: "kung", text: t }) });
      const d = await r.json();
      if (!r.ok) { setErr(d.error ?? "Envoi impossible."); setBusy(false); return; }
      router.push(`/agents/kung?c=${d.conversationId}`);
    } catch {
      setErr("Connexion perdue : vérifie dans la conversation de Kung avant de renvoyer.");
      setBusy(false);
    }
  }

  return (
    <section className="kung-card">
      <Link href="/agents/kung" className="kung-head" aria-label="Ouvrir la conversation avec Kung">
        <div className="kung-stage"><Avatar agent={kung} forme="entier" size={132} priority decorative /></div>
        <div className="kung-id">
          <span className="eyebrow">Ton manager</span>
          <div className="kung-name">{kung.nom}</div>
          <div className="kung-role">{kung.role}</div>
          <p>{kung.description}</p>
        </div>
      </Link>
      <form className="kung-ask" onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <textarea
          rows={2}
          value={text}
          placeholder="Confie une mission à Kung…"
          aria-label="Confier une mission à Kung"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(hover: hover)").matches) { e.preventDefault(); send(text); } }}
        />
        <button className="send" type="submit" disabled={!text.trim() || busy} aria-label="Envoyer à Kung">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
        </button>
      </form>
      <div className="kung-chips">
        {kung.suggestions.slice(0, 3).map((s) => (
          <button key={s} type="button" className="chip-btn" disabled={busy} onClick={() => send(s)}>{s}</button>
        ))}
      </div>
      {err && <div className="banner err" style={{ margin: "10px 0 0" }}>{err}</div>}
    </section>
  );
}
