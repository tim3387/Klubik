"use client";
// Page affichée si une page ne peut pas se charger (ex. base de données momentanément injoignable).
// Les données ne sont pas perdues : les missions reprennent automatiquement quand la base revient.
export default function Erreur({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="login">
      <div className="card">
        <img src="/logo-klubik.png" alt="Klubik" />
        <h1 style={{ fontSize: 20, textAlign: "center", marginBottom: 8 }}>Service momentanément indisponible</h1>
        <p className="muted small" style={{ textAlign: "center", margin: "0 0 16px" }}>
          La base de données ne répond pas (maintenance, coupure ou mise en pause de l'hébergeur). Tes données ne sont pas perdues :
          les missions en cours reprendront automatiquement dès son retour, et des sauvegardes chiffrées existent hors de la base.
        </p>
        <button className="btn primary block" onClick={() => reset()}>Réessayer</button>
      </div>
    </main>
  );
}
