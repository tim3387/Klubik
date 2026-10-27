"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const TABS = [
  { href: "/", label: "Accueil", icon: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /> },
  { href: "/missions", label: "Missions", icon: <path d="M4 6h16M4 12h16M4 18h10" /> },
  { href: "/actions", label: "Actions", icon: <path d="M9 12l2 2 4-4M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" /> },
  { href: "/reglages", label: "Réglages", icon: <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2-1.2L14.5 3h-5l-.4 2.6a7.6 7.6 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 2 1.2l.4 2.6h5l.4-2.6a7.6 7.6 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z" /> },
];

export default function TabBar() {
  const path = usePathname();
  const [counts, setCounts] = useState<{ actions: number; missions: number }>({ actions: 0, missions: 0 });
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const r = await fetch("/api/status", { cache: "no-store" });
        if (r.ok && !stop) setCounts(await r.json());
      } catch {}
    };
    tick();
    const id = setInterval(tick, 15000);
    return () => { stop = true; clearInterval(id); };
  }, [path]);
  return (
    <div className="tabbar">
      <nav>
        {TABS.map((t) => {
          const active = t.href === "/" ? path === "/" || path.startsWith("/agents") : path.startsWith(t.href);
          const n = t.href === "/actions" ? counts.actions : t.href === "/missions" ? counts.missions : 0;
          return (
            <Link key={t.href} href={t.href} className={`tab${active ? " active" : ""}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{t.icon}</svg>
              {t.label}
              {n > 0 && <span className="badge">{n}</span>}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
