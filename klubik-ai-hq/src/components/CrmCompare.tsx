"use client";
import { useState } from "react";

interface Res { identique: boolean; clubsFichier: number; clubsBase: number; totalEcarts: number; ecarts: { id: number; club: string; champ: string; fichier: unknown; base: unknown }[]; seulementFichier: number[]; seulementBase: number[] }

export default function CrmCompare() {
  const [res, setRes] = useState<Res | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const v = (x: unknown) => (x === null || x === "" ? "(vide)" : String(x));
  return (
    <details style={{ marginTop: 12 }}>
      <summary>Comparer un fichier Excel avec la base</summary>
      <p className="small muted">Vérifie qu'un fichier (par exemple celui resté sur ton ordinateur) est identique au CRM cloud. Rien n'est modifié.</p>
      <input className="input" type="file" accept=".xlsx" disabled={busy} onChange={async (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        setBusy(true); setErr(null); setRes(null);
        const fd = new FormData();
        fd.append("file", f);
        try {
          const r = await fetch("/api/crm/compare", { method: "POST", body: fd });
          const d = await r.json();
          if (r.ok) setRes(d); else setErr(d.error);
        } catch { setErr("Serveur injoignable."); } finally { setBusy(false); }
      }} />
      {busy && <p className="small muted">Comparaison en cours…</p>}
      {err && <div className="banner err" style={{ marginTop: 8 }}>{err}</div>}
      {res && (res.identique
        ? <div className="banner ok" style={{ marginTop: 8 }}>Aucune divergence : les {res.clubsBase} clubs sont identiques, colonne par colonne.</div>
        : (
          <div className="banner warn" style={{ marginTop: 8 }}>
            {res.totalEcarts} valeur(s) différente(s){res.seulementFichier.length ? ` · ${res.seulementFichier.length} club(s) seulement dans le fichier` : ""}{res.seulementBase.length ? ` · ${res.seulementBase.length} club(s) seulement dans la base` : ""}.
            <ul className="small" style={{ paddingLeft: 18, marginBottom: 0 }}>
              {res.ecarts.slice(0, 20).map((x, i) => <li key={i}>[ID {x.id}] {x.club} · {x.champ} : fichier « {v(x.fichier)} » / base « {v(x.base)} »</li>)}
            </ul>
          </div>
        ))}
    </details>
  );
}
