"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { controllerRequest } from "../controller-client";
import { Markdown } from "./markdown";
import "./workspace.css";

type Lab = {
  id: string; title: string; campaign: string; mode: string; minutes: number; prerequisites: string[];
  learningOutcomes: string[]; scope: string; scenario: string; basics: string; objectivesText: string; solution: string; takeaway: string;
  objectives: { id: string; title: string; points: number; dependsOn: string[] }[];
  hints: { title: string; hints: { title: string; body: string }[] }[];
};
type Status = { runId: string | null; completedObjectives: string[]; runtime?: string; error?: string };

export function LabWorkspace({ labs }: { labs: Lab[] }) {
  const [selectedId, setSelectedId] = useState(labs[0].id);
  const [csrf, setCsrf] = useState("");
  const [progress, setProgress] = useState<Record<string, Status>>({});
  const [message, setMessage] = useState("Reading material is available without Docker. Connecting to the local controller…");
  const [busy, setBusy] = useState(false);
  const [flags, setFlags] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const selected = labs.find((lab) => lab.id === selectedId)!;
  const status = progress[selectedId];
  const completed = status?.completedObjectives ?? [];

  const connect = useCallback(async () => {
    try {
      const session = await controllerRequest<{ csrfToken: string }>("/api/session");
      const saved = await controllerRequest<Record<string, Status>>("/api/standalone/progress");
      setCsrf(session.csrfToken); setProgress(saved);
      setMessage("Controller connected. Start or resume a lab, investigate in its toolbox, then submit each flag here.");
    } catch (error) { setCsrf(""); setMessage((error as Error).message); }
  }, []);
  useEffect(() => { void connect(); }, [connect]);

  const refresh = useCallback(async () => {
    try {
      const result = await controllerRequest<Status>(`/api/standalone/${selectedId}/status`);
      setProgress((current) => ({ ...current, [selectedId]: result }));
      if (result.error) setMessage(result.error);
    } catch (error) { setMessage((error as Error).message); }
  }, [selectedId]);
  useEffect(() => {
    if (!csrf) return;
    void refresh();
    const timer = setInterval(() => { if (!document.hidden) void refresh(); }, 15000);
    return () => clearInterval(timer);
  }, [csrf, refresh]);

  async function lifecycle(action: "start" | "stop" | "reset") {
    if (action === "reset" && !window.confirm(`Reset ${selected.title}? This deletes this lab's submitted progress and container files and creates new flags. Other labs are unchanged.`)) return;
    const id = selectedId;
    setBusy(true); setMessage(`${action === "start" ? "Starting or resuming" : action === "stop" ? "Stopping" : "Resetting"} ${selected.title}. A first build can take several minutes; keep this page open.`);
    try {
      const result = await controllerRequest<Status>(`/api/standalone/${id}/${action}`, { method: "POST", headers: { "X-CSRF-Token": csrf } });
      setProgress((current) => ({ ...current, [id]: result }));
      if (action === "reset") { setFlags({}); setFeedback({}); }
      setMessage(result.error ?? (action === "stop" ? "Lab stopped. Submitted progress is saved; toolbox /tmp files are not retained." : "Lab ready. Open its toolbox using the command below. Submit the flags you discover in this page."));
    } catch (error) { setMessage((error as Error).message); await refresh(); }
    finally { setBusy(false); }
  }

  async function submit(objectiveId: string) {
    const id = selectedId;
    const key = `${id}/${objectiveId}`;
    setBusy(true);
    try {
      const result = await controllerRequest<{ progress: Status }>(`/api/standalone/${id}/objectives/${objectiveId}/submit`, {
        method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf }, body: JSON.stringify({ flag: flags[key]?.trim() }),
      });
      setProgress((current) => ({ ...current, [id]: { ...current[id], ...result.progress } }));
      setFlags((current) => ({ ...current, [key]: "" }));
      setFeedback((current) => ({ ...current, [key]: "Correct — objective verified and saved." }));
    } catch (error) { setFeedback((current) => ({ ...current, [key]: (error as Error).message })); }
    finally { setBusy(false); }
  }

  return <main className="standalone-workspace">
    <header className="workspace-header"><Link href="/">RECON//LAB</Link><span>AUTHORIZED TRAINING ENVIRONMENT</span><Link href="/">Original shared-range modules</Link></header>
    <div className="workspace-intro"><p className="eyebrow green">BEGINNER INVESTIGATIONS</p><h1>Follow the evidence. Close the case.</h1><p>{labs.length} investigations, with scenarios, tool briefings, per-flag hints, and complete walkthroughs right here.</p></div>
    <div className="workspace-layout">
      <nav className="workspace-nav" aria-label="Standalone labs">{labs.map((lab) => <button key={lab.id} disabled={busy} aria-current={selectedId === lab.id ? "page" : undefined} onClick={() => setSelectedId(lab.id)}><small>{lab.id.slice(0, 2)} / {lab.mode}</small><strong>{lab.title}</strong><span>{progress[lab.id]?.completedObjectives.length ?? 0}/{lab.objectives.length} flags</span></button>)}</nav>
      <article className="workspace-lesson" key={selectedId}>
        <header><p className="eyebrow green">{selected.campaign} / {selected.mode} / {selected.minutes} MIN</p><h2>{selected.title}</h2><p>Recommended first: {selected.prerequisites.length ? selected.prerequisites.map((id) => labs.find((lab) => lab.id === id)?.title).join("; ") : "None — start here"}. Prerequisites are guidance, not locks.</p></header>
        <section className="workspace-section" aria-labelledby="scenario-heading"><h2 id="scenario-heading">Scenario</h2><Markdown text={selected.scenario} /><p><strong>Authorized scope:</strong> {selected.scope}. All other systems are out of scope.</p></section>
        <section className="workspace-section"><h2>What you need to know</h2><Markdown text={selected.basics} /></section>
        <section className="workspace-section workspace-control"><h2>Lab controller</h2><p><strong>{csrf ? "Connected" : "Not connected"}</strong> · Lab: {status?.runtime ?? "status unknown"}</p><div className="workspace-actions"><button disabled={busy} onClick={() => void connect()}>Reconnect</button><button disabled={busy || !csrf} onClick={() => void refresh()}>Refresh status</button><button className="primary" disabled={busy || !csrf} onClick={() => void lifecycle("start")}>Start / resume lab</button><button disabled={busy || !csrf || !status?.runId} onClick={() => void lifecycle("stop")}>Stop lab</button><button disabled={busy || !csrf || !status?.runId} onClick={() => void lifecycle("reset")}>Reset this lab…</button></div><p role="status" aria-live="polite">{message}</p>
          {!csrf && <div><p>Start Node.js and Docker Desktop on this computer. In a terminal in the project folder:</p><pre><code>npm.cmd run lab</code></pre><p>On macOS/Linux use <code>npm run lab</code>. If an older controller is already running, stop it with <code>npm run lab:stop</code> first (this also stops the original shared range), then start again. Read this page at <code>http://127.0.0.1:5173/labs</code>, not port 3030.</p></div>}
          <h3>Open the investigation toolbox</h3><p>After Start / resume succeeds, run this in a terminal in the project folder. It opens Bash inside this lab&apos;s isolated container:</p><pre><code>{`node scripts/standalone-labctl.mjs shell ${selectedId}`}</code></pre><p>Run the investigation commands below inside that toolbox, not PowerShell. Keep this portal open to read instructions and submit flags. You do not need to open a local README or solution file. Commands that inspect downloaded evidence files are part of the investigation and run inside the toolbox.</p><p>Start / resume preserves flags and submitted progress. Stop preserves submissions, but removes downloaded toolbox /tmp files. Reset is a separate destructive retry.</p>
        </section>
        <section className="workspace-section"><h2>Objectives</h2><Markdown text={selected.objectivesText} /><p>Any CLI <code>verify</code> command shown is optional: paste the discovered flag into its matching form below instead.</p><h3>Submit flags · {completed.length}/{selected.objectives.length}</h3>
          {selected.objectives.map((objective, index) => {
            const key = `${selectedId}/${objective.id}`;
            const done = completed.includes(objective.id);
            const missing = objective.dependsOn.filter((id) => !completed.includes(id));
            return <form className="workspace-flag" key={key} onSubmit={(event) => { event.preventDefault(); void submit(objective.id); }}><label htmlFor={key}>Flag {index + 1}: {objective.title}</label><small>{objective.id} · {objective.points} points {done ? "· Verified" : ""}</small>{!done && <><input id={key} autoComplete="off" spellCheck={false} maxLength={200} value={flags[key] ?? ""} onChange={(event) => setFlags((current) => ({ ...current, [key]: event.target.value }))} placeholder="RLAB{...}" /><button type="submit" disabled={busy || !csrf || !status?.runId || missing.length > 0 || !flags[key]?.trim()}>Submit flag {index + 1}</button>{missing.length > 0 && <p>Verify first: {missing.join(", ")}</p>}</>}<p role="status">{feedback[key] ?? (done ? "Verified and saved for this run." : !csrf ? "Connect the controller to submit." : !status?.runId ? "Start this lab to generate its flags." : "Find this flag in the target's response.")}</p></form>;
          })}
        </section>
        <section className="workspace-section"><h2>Hints for each flag</h2><p>Open one hint at a time. Stop when you know what to try next.</p>{selected.hints.map((group) => <div key={group.title}><h3>{group.title}</h3>{group.hints.map((hint) => <details key={hint.title}><summary>{hint.title}</summary><Markdown text={hint.body} /></details>)}</div>)}</section>
        <section className="workspace-section"><h2>Solution</h2><details className="workspace-solution"><summary>Reveal full walkthrough — spoilers for every flag</summary><p>All commands and expected observations are below. Run toolbox commands in the lab shell; submit discovered flags in the forms above. Placeholder tokens must be replaced with your evidence.</p><Markdown text={selected.solution} /></details></section>
        <section className="workspace-section"><h2>What this taught you</h2><Markdown text={selected.takeaway} /></section>
      </article>
    </div>
  </main>;
}
