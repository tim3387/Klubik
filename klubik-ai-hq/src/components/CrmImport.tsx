"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface Apercu {
  fichier: string; sha256: string; clubs: number; colonnes: number; colonnesCalculees: string[];
  onglets: Record<string, number>; avertissements: string[]; baseActuelle: number;
  parametres: { statuts: string[]; canauxEnvoi: string[]; delaiRelance: number; objectifSemaine: number };
  statistiques: Record<string, unknown>;
}

export default function CrmImport() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [apercu, setApercu] = useState<Apercu | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function post(mode: "preview" | "confirm") {
    if (!file) return;
    setBusy(true);
    setErr(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("mode", mode);
    if (mode === "confirm" && apercu) fd.append("sha256", apercu.sha256);
    try {
      const r = await fetch("/api/crm/import", { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok) { setErr(d.error ?? "Import impossible."); return; }
      if (mode === "preview") setApercu(d.apercu);
      else if (d.ok) setDone(`Import terminé et vérifié : ${d.verification.clubs} clubs relus dans la base, chaque colonne identique au fichier. Sauvegarde : ${d.sauvegarde}.`);
      else setErr(`Import effectué mais la vérification a trouvé des écarts : ${d.verification.ecarts.join(", ")}`);
    } catch {
      setErr("Connexion perdue pendant l'envoi. Recharge la page pour vérifier l'état du CRM avant de réessayer.");
    } finally {
      setBusy(false);
    }
  }

  if (done) return (
    <div>
      <div className="banner ok">{done}</div>
      <button className="btn primary block" onClick={() => router.refresh()}>Continuer</button>
    </div>
  );
  return (
    <div>
      <div className="field">
        <label htmlFor="xlsx">Fichier de prospection (.xlsx)</label>
        <input id="xlsx" className="input" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => { setFile(e.target.files?.[0] ?? null); setApercu(null); setErr(null); }} />
      </div>
      {!apercu && <button className="btn primary block" disabled={!file || busy} onClick={() => post("preview")}>{busy ? "Analyse…" : "1. Analyser le fichier (rien n'est écrit)"}</button>}
      {apercu && (
        <div className="card" style={{ boxShadow: "none" }}>
          <b>Aperçu de {apercu.fichier}</b>
          <ul className="small" style={{ paddingLeft: 18, marginBottom: 0 }}>
            <li>{apercu.clubs} clubs · {apercu.colonnes} colonnes dont {apercu.colonnesCalculees.length} calculées (recalculées par l'app)</li>
            <li>Onglets archivés : {Object.entries(apercu.onglets).map(([k, n]) => `${k} (${n} cellules)`).join(", ")}</li>
            <li>Statuts : {apercu.parametres.statuts.join(", ")}</li>
            <li>Relance après {apercu.parametres.delaiRelance} jours · objectif {apercu.parametres.objectifSemaine} premiers contacts / semaine</li>
            <li>Empreinte : {apercu.sha256.slice(0, 16)}…</li>
          </ul>
          {apercu.avertissements.map((w) => <div key={w} className="banner warn" style={{ marginTop: 8, marginBottom: 0 }}>{w}</div>)}
          {apercu.baseActuelle > 0 ? (
            <div className="banner err" style={{ marginTop: 10, marginBottom: 0 }}>La base contient déjà {apercu.baseActuelle} clubs : l'import est bloqué pour ne rien écraser.</div>
          ) : (
            <div className="btn-row">
              <button className="btn primary" disabled={busy} onClick={() => post("confirm")}>{busy ? "Import et vérification…" : "2. Confirmer l'import"}</button>
              <button className="btn ghost" disabled={busy} onClick={() => setApercu(null)}>Annuler</button>
            </div>
          )}
        </div>
      )}
      {err && <div className="banner err" style={{ marginTop: 10 }}>{err}</div>}
    </div>
  );
}
