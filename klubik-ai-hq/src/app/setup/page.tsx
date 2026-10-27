"use client";
import { useState } from "react";

// Première configuration : définit le mot de passe avec le code SETUP_TOKEN saisi dans l'hébergeur. Utilisable une seule fois.
export default function Setup() {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setErr("Les deux mots de passe ne correspondent pas."); return; }
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/auth/setup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, password }) });
      if (r.ok) setOk(true);
      else setErr((await r.json().catch(() => ({}))).error ?? "Configuration impossible.");
    } catch {
      setErr("Serveur injoignable.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <form className="card" onSubmit={submit}>
        <img src="/logo-klubik.png" alt="Klubik" />
        <h1 style={{ fontSize: 22, textAlign: "center", marginBottom: 4 }}>Première configuration</h1>
        {ok ? (
          <>
            <div className="banner ok" style={{ marginTop: 16 }}>Mot de passe enregistré. Cette page est désormais désactivée.</div>
            <a className="btn primary block" href="/login">Se connecter</a>
          </>
        ) : (
          <>
            <p className="muted small" style={{ textAlign: "center", margin: "0 0 20px" }}>Choisis ton mot de passe (12 caractères minimum).</p>
            <div className="field">
              <label htmlFor="token">Code de configuration</label>
              <input id="token" className="input" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="pw">Nouveau mot de passe</label>
              <input id="pw" className="input" type="password" autoComplete="new-password" minLength={12} value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="pw2">Confirmation</label>
              <input id="pw2" className="input" type="password" autoComplete="new-password" minLength={12} value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
            </div>
            {err && <div className="banner err">{err}</div>}
            <button className="btn primary block" disabled={busy}>{busy ? "Enregistrement…" : "Enregistrer"}</button>
          </>
        )}
      </form>
    </main>
  );
}
