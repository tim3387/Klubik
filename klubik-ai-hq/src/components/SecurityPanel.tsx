"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface Device { id: string; label: string; created_at: string; last_seen: string; current: boolean }

export default function SecurityPanel({ devices, passwordManaged }: { devices: Device[]; passwordManaged: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });

  async function call(body: object) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/auth/security", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json();
      setMsg({ ok: r.ok, text: d.message ?? d.error ?? "Erreur." });
      if (r.ok) { setPw({ current: "", next: "", confirm: "" }); router.refresh(); }
    } catch {
      setMsg({ ok: false, text: "Serveur injoignable." });
    } finally {
      setBusy(false);
    }
  }

  const date = (d: string) => new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Paris" });
  return (
    <div className="card">
      <p className="small muted" style={{ margin: "0 0 10px" }}>
        Appareils de confiance : les tentatives de connexion venant d'ailleurs ne peuvent pas les bloquer.
      </p>
      <div className="list">
        {devices.map((d) => (
          <div key={d.id} className="row">
            <div className="grow">
              <div className="title">{d.label}{d.current ? " · cet appareil" : ""}</div>
              <div className="meta">depuis le {date(d.created_at)} · vu le {date(d.last_seen)}</div>
            </div>
            {!d.current && <button className="btn ghost" style={{ minHeight: 36, padding: "6px 12px" }} disabled={busy} onClick={() => call({ action: "revoke", id: d.id })}>Retirer</button>}
          </div>
        ))}
      </div>
      {devices.length > 1 && (
        <div className="btn-row">
          <button className="btn ghost" disabled={busy} onClick={() => confirm("Déconnecter tous les autres appareils ?") && call({ action: "logout-others" })}>Déconnecter les autres appareils</button>
        </div>
      )}

      {passwordManaged && (
        <details style={{ marginTop: 14 }}>
          <summary>Changer le mot de passe</summary>
          <form style={{ marginTop: 10 }} onSubmit={(e) => {
            e.preventDefault();
            if (pw.next !== pw.confirm) { setMsg({ ok: false, text: "Les deux nouveaux mots de passe ne correspondent pas." }); return; }
            call({ action: "password", current: pw.current, next: pw.next });
          }}>
            <div className="field"><label htmlFor="pwc">Mot de passe actuel</label>
              <input id="pwc" className="input" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required /></div>
            <div className="field"><label htmlFor="pwn">Nouveau (12 caractères minimum)</label>
              <input id="pwn" className="input" type="password" autoComplete="new-password" minLength={12} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required /></div>
            <div className="field"><label htmlFor="pwn2">Confirmation</label>
              <input id="pwn2" className="input" type="password" autoComplete="new-password" minLength={12} value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} required /></div>
            <button className="btn primary block" disabled={busy}>Changer le mot de passe</button>
          </form>
        </details>
      )}
      {msg && <div className={`banner ${msg.ok ? "ok" : "err"}`} style={{ marginTop: 12, marginBottom: 0 }}>{msg.text}</div>}
    </div>
  );
}
