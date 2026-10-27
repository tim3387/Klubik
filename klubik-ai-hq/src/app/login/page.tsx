"use client";
import { useState } from "react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
      if (r.ok) { window.location.href = "/"; return; }
      setErr((await r.json().catch(() => ({}))).error ?? "Connexion impossible.");
    } catch {
      setErr("Serveur injoignable. Vérifie ta connexion.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <form className="card" onSubmit={submit}>
        <img src="/logo-klubik.png" alt="Klubik" />
        <h1 style={{ fontSize: 22, textAlign: "center", marginBottom: 4 }}>Klubik AI HQ</h1>
        <p className="muted small" style={{ textAlign: "center", margin: "0 0 20px" }}>Accès privé</p>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" className="input" type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="password">Mot de passe</label>
          <input id="password" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {err && <div className="banner err">{err}</div>}
        <button className="btn primary block" disabled={busy}>{busy ? "Connexion…" : "Se connecter"}</button>
      </form>
    </main>
  );
}
