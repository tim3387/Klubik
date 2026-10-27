"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface Props {
  id: string;
  kind: "crm_update" | "message_draft";
  title: string;
  agent: string;
  when: string;
  payload: Record<string, any>;
}

export default function ActionCard({ id, kind, title, agent, when, payload }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function decide(decision: "approve" | "reject" | "sent") {
    if (decision === "sent" && !confirm("Confirmes-tu avoir envoyé ce message toi-même ? Le CRM sera mis à jour en conséquence.")) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/actions/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision }) });
      const d = await r.json();
      setMsg({ ok: !!d.ok, text: d.message ?? d.error ?? "Erreur." });
      if (d.ok) setTimeout(() => router.refresh(), 900);
    } catch {
      setMsg({ ok: false, text: "Connexion perdue : recharge la page pour voir si la décision a été prise en compte." });
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    const t = payload.objet ? `${payload.objet}\n\n${payload.texte}` : String(payload.texte);
    try { await navigator.clipboard.writeText(t); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { setMsg({ ok: false, text: "Copie impossible : sélectionne le texte à la main." }); }
  }

  return (
    <div className="card">
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span className={`chip ${kind === "crm_update" ? "orange" : "blue"}`}>{kind === "crm_update" ? "Mise à jour CRM" : "Brouillon de message"}</span>
        <span className="small muted">par {agent} · {when}</span>
      </div>
      <h3 style={{ fontSize: 16, marginTop: 10 }}>{title}</h3>

      {kind === "crm_update" ? (
        <>
          <table className="diff"><tbody>
            {(payload.lignes as { champ: string; avant: string; apres: string }[] ?? []).map((l) => (
              <tr key={l.champ}><td>{l.champ}</td><td><div className="before">{l.avant}</div><div>{l.apres}</div></td></tr>
            ))}
          </tbody></table>
          {(payload.avertissements as string[] ?? []).map((w) => <div key={w} className="banner warn" style={{ marginTop: 8, marginBottom: 0 }}>⚠ {w}</div>)}
          <div className="btn-row">
            <button className="btn primary" disabled={busy || !!msg?.ok} onClick={() => decide("approve")}>Valider et écrire</button>
            <button className="btn danger" disabled={busy || !!msg?.ok} onClick={() => decide("reject")}>Refuser</button>
          </div>
        </>
      ) : (
        <>
          <div className="small muted" style={{ marginTop: 6 }}>{payload.canal} → {payload.destinataire} · {payload.type_message}</div>
          {payload.objet && <div className="small" style={{ marginTop: 8 }}><b>Objet :</b> {payload.objet}</div>}
          <div className="draft">{payload.texte}</div>
          {Array.isArray(payload.faits_utilises) && payload.faits_utilises.length > 0 && (
            <details><summary>Faits et sources utilisés ({payload.faits_utilises.length})</summary>
              <ul className="small" style={{ paddingLeft: 18 }}>{payload.faits_utilises.map((f: string) => <li key={f} style={{ overflowWrap: "anywhere" }}>{f}</li>)}</ul>
            </details>
          )}
          <p className="small muted" style={{ margin: "10px 0 0" }}>Rien n'est envoyé automatiquement. Copie le message, envoie-le toi-même, puis confirme.</p>
          <div className="btn-row">
            <button className="btn primary" onClick={copy} disabled={busy}>{copied ? "Copié ✓" : "Copier"}</button>
            <button className="btn success" disabled={busy || !!msg?.ok} onClick={() => decide("sent")}>J'ai envoyé</button>
            <button className="btn ghost" disabled={busy || !!msg?.ok} onClick={() => decide("reject")}>Écarter</button>
          </div>
        </>
      )}
      {msg && <div className={`banner ${msg.ok ? "ok" : "err"}`} style={{ marginTop: 12, marginBottom: 0 }}>{msg.text}</div>}
    </div>
  );
}
