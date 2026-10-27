"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AppSettings, ModelId } from "@/lib/settings";

const AGENTS: { id: keyof AppSettings["models"]; nom: string }[] = [
  { id: "kung", nom: "Kung" }, { id: "popi", nom: "Popi" }, { id: "jojo", nom: "Jojo" }, { id: "bililou", nom: "Bililou" },
];

export default function CostSettings({ value, modeles }: { value: AppSettings; modeles: Record<ModelId, { label: string; note: string }> }) {
  const router = useRouter();
  const [v, setV] = useState(value);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(v) });
      const d = await r.json();
      setMsg({ ok: r.ok, text: r.ok ? "Réglages enregistrés (effet immédiat sur les prochaines missions)." : d.error });
      if (r.ok) router.refresh();
    } catch {
      setMsg({ ok: false, text: "Serveur injoignable." });
    } finally {
      setBusy(false);
    }
  }

  const select = (val: ModelId, onChange: (m: ModelId) => void, id: string) => (
    <select id={id} className="input" value={val} onChange={(e) => onChange(e.target.value as ModelId)}>
      {(Object.keys(modeles) as ModelId[]).map((m) => <option key={m} value={m}>{modeles[m].label}</option>)}
    </select>
  );
  const num = (val: number, onChange: (n: number) => void, id: string, step = 1) => (
    <input id={id} className="input" type="number" inputMode="decimal" min={0} step={step} value={val} onChange={(e) => onChange(Number(e.target.value))} />
  );

  return (
    <div>
      <div className="kpis" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="field"><label htmlFor="mb">Plafond mensuel ($)</label>{num(v.monthlyBudget, (n) => setV({ ...v, monthlyBudget: n }), "mb")}</div>
        <div className="field"><label htmlFor="mi">Plafond par mission ($)</label>{num(v.missionBudget, (n) => setV({ ...v, missionBudget: n }), "mi", 0.5)}</div>
      </div>
      <div className="kpis" style={{ gridTemplateColumns: "1fr 1fr" }}>
        {AGENTS.map((a) => (
          <div key={a.id} className="field"><label htmlFor={`m-${a.id}`}>{a.nom}</label>
            {select(v.models[a.id], (m) => setV({ ...v, models: { ...v.models, [a.id]: m } }), `m-${a.id}`)}</div>
        ))}
      </div>
      <div className="field"><label htmlFor="deep">Modèle « réflexion approfondie » (option par message)</label>
        {select(v.deepModel, (m) => setV({ ...v, deepModel: m }), "deep")}</div>
      <div className="field"><label htmlFor="att">Conservation des captures d'écran (jours)</label>{num(v.attachmentDays, (n) => setV({ ...v, attachmentDays: n }), "att")}</div>
      <ul className="small muted" style={{ paddingLeft: 18, margin: "0 0 12px" }}>
        {(Object.keys(modeles) as ModelId[]).map((m) => <li key={m}><b>{modeles[m].label}</b> : {modeles[m].note}</li>)}
      </ul>
      <button className="btn primary block" disabled={busy} onClick={save}>{busy ? "Enregistrement…" : "Enregistrer"}</button>
      {msg && <div className={`banner ${msg.ok ? "ok" : "err"}`} style={{ marginTop: 10, marginBottom: 0 }}>{msg.text}</div>}
    </div>
  );
}
