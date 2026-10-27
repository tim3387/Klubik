"use client";

export default function LogoutButton() {
  return (
    <button
      className="btn danger block"
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
        window.location.href = "/login";
      }}
    >
      Se déconnecter
    </button>
  );
}
