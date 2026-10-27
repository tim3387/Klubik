"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export interface BackupRow { id: number; created_at: string; reason: string; size: number; offsite: "ok" | "echec" | "non"; error: string | null; local: boolean; offsite_key: string | null }
type Source = { kind: "db"; id: number } | { kind: "offsite"; key: string };
interface Apercu { date: string; raison: string; counts: Record<string, number>; clubs: { identiques: number; modifies: number; absentsDeLaBase: number; absentsDeLaSauvegarde: number; exemples: number[] } }

const quand = (d: string) => new Date(d).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

export default function BackupPanel(props: { backups: BackupRow[]; offsite: { key: string; size: number; lastModified: string }[]; crmEmpty: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [sel, setSel] = useState<{ source: Source; label: string; apercu?: Apercu } | null>(null);
  const [pw, setPw] = useState("");

  async function call(body: object) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/backups", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) { setMsg({ ok: false, text: d.error ?? "Erreur." }); return null; }
      return d;
    } catch {
      setMsg({ ok: false, text: "Serveur injoignable." });
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function open(source: Source, label: string) {
    setSel({ source, label });
    setPw("");
    const d = await call({ action: "preview", source });
    if (d) setSel({ source, label, apercu: d.apercu });
  }

  async function restore() {
    if (!sel) return;
    const d = await call({ action: "restore", source: sel.source, mode: props.crmEmpty ? "complete" : "crm", password: pw });
    if (d) { setMsg({ ok: d.ok, text: d.message }); setSel(null); router.refresh(); }
  }

  const etat = (b: BackupRow) => b.offsite === "ok" ? <span className="chip green">externe vérifiée</span>
    : b.offsite === "echec" ? <span className="chip red" title={b.error ?? ""}>externe en échec</span>
    : <span className="chip gray">en base seulement</span>;

  return (
    <div>
      <button className="btn ghost block" disabled={busy} onClick={async () => { const d = await call({ action: "run" }); if (d) { setMsg({ ok: d.ok, text: d.message }); router.refresh(); } }}>
        {busy && !sel ? "Sauvegarde en cours…" : "Sauvegarder maintenant"}
      </button>
      {msg && <div className={`banner ${msg.ok ? "ok" : "err"}`} style={{ marginTop: 10, marginBottom: 0 }}>{msg.text}</div>}

      {sel && (
        <div className="card" style={{ marginTop: 12, boxShadow: "none", borderColor: "#fde3b0" }}>
          <b>Restaurer : {sel.label}</b>
          {!sel.apercu ? <p className="small muted">Déchiffrement et comparaison avec le CRM actuel…</p> : (
            <>
              <ul className="small" style={{ paddingLeft: 18 }}>
                <li>{sel.apercu.counts.crm_clubs} clubs dans la sauvegarde · {sel.apercu.counts.crm_journal} entrées de journal · {sel.apercu.counts.chat_messages} messages</li>
                {!props.crmEmpty && <li>Par rapport à aujourd'hui : {sel.apercu.clubs.identiques} identiques, <b>{sel.apercu.clubs.modifies} différents</b>
                  {sel.apercu.clubs.exemples.length > 0 && ` (ex. ID ${sel.apercu.clubs.exemples.join(", ")})`}, {sel.apercu.clubs.absentsDeLaBase} absents d'aujourd'hui, {sel.apercu.clubs.absentsDeLaSauvegarde} absents de la sauvegarde</li>}
                <li>{props.crmEmpty
                  ? "Restauration complète : CRM, journal, dossiers, conversations, missions et réglages."
                  : "Seuls les clubs et les réglages du CRM reviennent à cet état. Le journal et les dossiers récents sont conservés, et l'état actuel est sauvegardé avant."}</li>
              </ul>
              <div className="field"><label htmlFor="rpw">Ton mot de passe pour confirmer</label>
                <input id="rpw" className="input" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
              <div className="btn-row">
                <button className="btn primary" disabled={busy || !pw} onClick={restore}>{busy ? "Restauration…" : "Restaurer"}</button>
                <button className="btn ghost" disabled={busy} onClick={() => setSel(null)}>Annuler</button>
              </div>
            </>
          )}
        </div>
      )}

      {props.backups.length > 0 && (
        <div className="list" style={{ marginTop: 12 }}>
          {props.backups.map((b) => (
            <div key={b.id} className="row" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
              <div>
                <div className="title" style={{ whiteSpace: "normal" }}>{quand(b.created_at)} · {b.reason}</div>
                <div className="meta" style={{ whiteSpace: "normal", marginTop: 2 }}>{Math.round(b.size / 1024)} Ko chiffrés · {etat(b)}</div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {b.local && <a className="btn ghost" style={{ minHeight: 36, padding: "6px 10px", fontSize: 13 }} href={`/api/backups/download?id=${b.id}`}>Télécharger</a>}
                {(b.local || b.offsite === "ok") && <button className="btn ghost" style={{ minHeight: 36, padding: "6px 10px", fontSize: 13 }} disabled={busy} onClick={() => open({ kind: "db", id: b.id }, quand(b.created_at))}>Restaurer…</button>}
              </div>
            </div>
          ))}
        </div>
      )}

      {props.crmEmpty && props.offsite.length > 0 && (
        <>
          <p className="small" style={{ margin: "14px 0 6px" }}><b>Sauvegardes trouvées dans le stockage externe</b> (pour reconstruire une base perdue) :</p>
          <div className="list">
            {props.offsite.slice(0, 10).map((o) => (
              <div key={o.key} className="row">
                <div className="grow"><div className="title">{o.key.split("/").pop()}</div><div className="meta">{Math.round(o.size / 1024)} Ko · {quand(o.lastModified)}</div></div>
                <button className="btn ghost" style={{ minHeight: 36, padding: "6px 10px", fontSize: 13 }} disabled={busy} onClick={() => open({ kind: "offsite", key: o.key }, o.key.split("/").pop()!)}>Restaurer…</button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
