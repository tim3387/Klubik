"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentProfile } from "@/lib/agents/definitions";
import Avatar from "./Avatar";
import Markdown from "./Markdown";
import { quand } from "./format";

interface Msg { id: number; role: "user" | "agent" | "event"; agent_id: string | null; content: string; created_at: string }
interface Activity { id: string; agent_id: string; status: string; title: string; steps: number; error: string | null }
const NOMS: Record<string, string> = { kung: "Kung", popi: "Popi", jojo: "Jojo", bililou: "Bililou" };

export default function Chat(props: {
  profile: AgentProfile;
  history: { id: string; title: string | null; updated_at: string }[];
  initialConversationId: string | null;
  initialMessages: Msg[];
  initialActivity: Activity[];
  apiReady: boolean;
}) {
  const { profile } = props;
  const router = useRouter();
  const [conversationId, setConversationId] = useState(props.initialConversationId);
  const [messages, setMessages] = useState<Msg[]>(props.initialMessages);
  const [activity, setActivity] = useState<Activity[]>(props.initialActivity);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const lastId = useRef(props.initialMessages.at(-1)?.id ?? 0);
  const bottom = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const busy = activity.length > 0;

  const poll = useCallback(async () => {
    if (!conversationId) return;
    try {
      const r = await fetch(`/api/conversations/${conversationId}?after=${lastId.current}`, { cache: "no-store" });
      if (!r.ok) return;
      const d = (await r.json()) as { messages: Msg[]; activity: Activity[] };
      if (d.messages.length) {
        lastId.current = d.messages.at(-1)!.id;
        setMessages((prev) => [...prev, ...d.messages.filter((m) => !prev.some((p) => p.id === m.id))]);
      }
      setActivity(d.activity);
    } catch {}
  }, [conversationId]);

  // Rafraîchissement : rapide pendant qu'un agent travaille, lent sinon (synchronisation iPhone ↔ ordinateur).
  useEffect(() => {
    if (!conversationId) return;
    const id = setInterval(poll, busy ? 2500 : 10000);
    const onVisible = () => { if (document.visibilityState === "visible") poll(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVisible); };
  }, [conversationId, busy, poll]);

  useEffect(() => {
    if (messages.length) bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, busy]);

  async function send(value: string) {
    const t = value.trim();
    if (!t || sending) return;
    setSending(true);
    setError(null);
    try {
      const r = await fetch("/api/chat", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ agentId: profile.id, conversationId, text: t }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error ?? "Envoi impossible."); return; }
      setText("");
      if (area.current) area.current.style.height = "auto";
      if (!conversationId) {
        setConversationId(d.conversationId);
        window.history.replaceState(null, "", `/agents/${profile.id}?c=${d.conversationId}`);
      }
      setActivity([{ id: d.taskId, agent_id: profile.id, status: "ready", title: t, steps: 0, error: null }]);
      const r2 = await fetch(`/api/conversations/${d.conversationId}?after=${lastId.current}`, { cache: "no-store" });
      if (r2.ok) {
        const d2 = (await r2.json()) as { messages: Msg[]; activity: Activity[] };
        if (d2.messages.length) lastId.current = d2.messages.at(-1)!.id;
        setMessages((prev) => [...prev, ...d2.messages.filter((m) => !prev.some((p) => p.id === m.id))]);
        setActivity(d2.activity);
      }
    } catch {
      setError("Connexion perdue. Ton message n'a peut-être pas été envoyé : vérifie avant de renvoyer.");
    } finally {
      setSending(false);
    }
  }

  // Libellés fidèles à l'état réel : « en file » tant qu'aucune étape n'a démarré (ex. clé API absente).
  const ETAT: Record<string, string> = { ready: "en file d'attente", running: "travaille", waiting: "attend ses collègues" };
  const etat = (a: Activity) => (a.status === "ready" && a.steps > 0 ? "travaille" : ETAT[a.status] ?? a.status);
  const working = activity.map((a) => `${NOMS[a.agent_id] ?? a.agent_id} ${etat(a)}`);
  const enCours = activity.some((a) => a.status !== "ready" || a.steps > 0);

  return (
    <div className="chat">
      <header className="chat-head">
        <Link href="/" className="icon-btn" aria-label="Retour">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </Link>
        <Avatar agent={profile} size={40} />
        <div className="grow">
          <div className="name">{profile.nom}</div>
          <div className="role">{busy ? (enCours ? "en train de travailler…" : "demande en file d'attente") : `${profile.role} · ${profile.animal}`}</div>
        </div>
        <button className="icon-btn" aria-label="Historique des conversations" onClick={() => { setShowHistory((v) => !v); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 8v4l3 2M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5" /></svg>
        </button>
        <button className="icon-btn" aria-label="Nouvelle conversation" onClick={() => router.push(`/agents/${profile.id}`)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        </button>
      </header>

      {showHistory && (
        <div style={{ padding: "12px 16px 0" }}>
          {props.history.length === 0 ? <div className="empty">Aucune conversation précédente avec {profile.nom}.</div> : (
            <div className="list">
              {props.history.map((h) => (
                <Link key={h.id} href={`/agents/${profile.id}?c=${h.id}`} className="row" onClick={() => setShowHistory(false)}>
                  <div className="grow"><div className="title">{h.title ?? "Conversation"}</div><div className="meta">{quand(h.updated_at)}</div></div>
                  {h.id === conversationId && <span className="chip blue">ouverte</span>}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="messages">
        {!props.apiReady && <div className="banner warn">{profile.nom} ne peut pas encore répondre : la clé API Claude n'est pas configurée sur le serveur. Tes messages seront traités dès qu'elle le sera.</div>}
        {messages.length === 0 && (
          <div className="hero-agent">
            <Avatar agent={profile} size={84} />
            <h2>{profile.nom}</h2>
            <div className="muted small">{profile.role} · {profile.animal}</div>
            <p className="muted" style={{ margin: "4px 0 0", fontSize: 14 }}>{profile.description}</p>
            <div className="suggestions" style={{ width: "100%" }}>
              {profile.suggestions.map((s) => (
                <button key={s} className="suggestion" onClick={() => send(s)} disabled={sending}>{s}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) =>
          m.role === "user" ? <div key={m.id} className="bubble user">{m.content}</div>
          : m.role === "agent" ? (
            <div key={m.id} className="bubble agent">
              {m.agent_id && m.agent_id !== profile.id && <div className="small muted" style={{ fontWeight: 700 }}>{NOMS[m.agent_id] ?? m.agent_id}</div>}
              <div className="md"><Markdown text={m.content} /></div>
            </div>
          )
          : <div key={m.id} className="event">{m.content}</div>,
        )}
        {busy && (
          <div className="working"><span className="dot pulse" style={{ color: profile.couleur }} />{working.join(" · ")}</div>
        )}
        {busy && <div className="muted small" style={{ alignSelf: "flex-start" }}>Tu peux fermer l'app : la demande est enregistrée sur le serveur.</div>}
        {error && <div className="banner err">{error}</div>}
        <div ref={bottom} />
      </div>

      <form className="composer" onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <textarea
          ref={area}
          rows={1}
          value={text}
          placeholder={busy ? "Réponse en préparation…" : `Écrire à ${profile.nom}…`}
          disabled={busy}
          onChange={(e) => {
            setText(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(hover: hover)").matches) { e.preventDefault(); send(text); }
          }}
        />
        <button className="send" type="submit" disabled={!text.trim() || sending || busy} aria-label="Envoyer">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
        </button>
      </form>
    </div>
  );
}
