// Rendu Markdown minimal et sûr (aucun HTML brut injecté : tout passe par React, qui échappe le texte).
import { Fragment, type ReactNode } from "react";

function inline(text: string, key = 0): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\((https?:\/\/[^)\s]+)\)|https?:\/\/[^\s)]+|\*[^*\s][^*]*\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    const k = `${key}-${i++}`;
    if (t.startsWith("**")) out.push(<strong key={k}>{inline(t.slice(2, -2), i)}</strong>);
    else if (t.startsWith("`")) out.push(<code key={k}>{t.slice(1, -1)}</code>);
    else if (t.startsWith("[")) {
      const label = t.slice(1, t.indexOf("]("));
      out.push(<a key={k} href={m[2]} target="_blank" rel="noopener noreferrer">{label}</a>);
    } else if (t.startsWith("http")) out.push(<a key={k} href={t} target="_blank" rel="noopener noreferrer">{t}</a>);
    else out.push(<em key={k}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export default function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (l.startsWith("```")) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) code.push(lines[i++]);
      i++;
      blocks.push(<pre key={blocks.length}>{code.join("\n")}</pre>);
      continue;
    }
    if (/^#{1,6}\s/.test(l)) { blocks.push(<h3 key={blocks.length}>{inline(l.replace(/^#{1,6}\s/, ""))}</h3>); i++; continue; }
    if (/^\s*[-*•]\s/.test(l)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*•]\s/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*•]\s/, ""));
      blocks.push(<ul key={blocks.length}>{items.map((t, j) => <li key={j}>{inline(t, j)}</li>)}</ul>);
      continue;
    }
    if (/^\s*\d+[.)]\s/.test(l)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+[.)]\s/, ""));
      blocks.push(<ol key={blocks.length}>{items.map((t, j) => <li key={j}>{inline(t, j)}</li>)}</ol>);
      continue;
    }
    if (l.startsWith(">")) {
      const q: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) q.push(lines[i++].replace(/^>\s?/, ""));
      blocks.push(<blockquote key={blocks.length}>{q.map((t, j) => <Fragment key={j}>{inline(t, j)}{j < q.length - 1 && <br />}</Fragment>)}</blockquote>);
      continue;
    }
    if (/^\|.*\|\s*$/.test(l)) {
      const rows: string[][] = [];
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) {
        const cells = lines[i++].trim().slice(1, -1).split("|").map((c) => c.trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
      }
      blocks.push(
        <table key={blocks.length}><tbody>{rows.map((r, j) => <tr key={j}>{r.map((c, k) => (j === 0 ? <th key={k}>{inline(c, k)}</th> : <td key={k}>{inline(c, k)}</td>))}</tr>)}</tbody></table>,
      );
      continue;
    }
    if (!l.trim()) { i++; continue; }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|\s*[-*•]\s|\s*\d+[.)]\s|>|```|\|)/.test(lines[i])) para.push(lines[i++]);
    blocks.push(<p key={blocks.length}>{para.map((t, j) => <Fragment key={j}>{inline(t, j)}{j < para.length - 1 && <br />}</Fragment>)}</p>);
  }
  return <div className="md">{blocks}</div>;
}
