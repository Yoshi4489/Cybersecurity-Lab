import type { ReactNode } from "react";

// Render the repository's small Markdown subset as React text, never raw HTML.
function inline(text: string): ReactNode[] {
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g).map((part, index) => {
    if (part.startsWith("`")) return <code key={index}>{part.slice(1, -1)}</code>;
    if (part.startsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) return /^https:\/\//.test(link[2]) ? <a key={index} href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a> : <span key={index}>{link[1]}</span>;
    return part;
  });
}

export function Markdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  for (let i = 0; i < lines.length;) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (line.startsWith("```")) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) code.push(lines[i++]);
      i++;
      blocks.push(<pre key={i}><code>{code.join("\n")}</code></pre>);
    } else if (/^#{1,4} /.test(line)) {
      blocks.push(<h3 key={i}>{inline(line.replace(/^#+ /, ""))}</h3>); i++;
    } else if (/^\s*(?:- |\d+\. )/.test(line)) {
      const ordered = /^\d+\. /.test(line);
      const items: ReactNode[] = [];
      while (i < lines.length && /^\s*(?:- |\d+\. )/.test(lines[i])) {
        let item = lines[i++].replace(/^\s*(?:- |\d+\. )/, "");
        while (i < lines.length && /^ {2}\S/.test(lines[i])) item += ` ${lines[i++].trim()}`;
        items.push(<li key={i}>{inline(item)}</li>);
      }
      blocks.push(ordered ? <ol key={i}>{items}</ol> : <ul key={i}>{items}</ul>);
    } else {
      const paragraph = [lines[i++]];
      while (i < lines.length && lines[i].trim() && !/^(?:#|```|- |\d+\. )/.test(lines[i])) paragraph.push(lines[i++]);
      blocks.push(<p key={i}>{inline(paragraph.join(" "))}</p>);
    }
  }
  return <div className="lab-markdown">{blocks}</div>;
}
