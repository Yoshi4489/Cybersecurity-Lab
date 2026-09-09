"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { controllerRequest } from "../controller-client";
import { Markdown } from "./markdown";
import { Checkpoint, type Question } from "./checkpoint";
import { LabTerminal } from "./terminal";
import { createProgressRequests } from "./progress-requests";
import "./workspace.css";

type Lab = {
  id: string; title: string; campaign: string; mode: string; minutes: number; prerequisites: string[]; subnet: string;
  learningOutcomes: string[]; scope: string; scenario: string; basics: string; objectivesText: string; solution: string; takeaway: string;
  objectives: { id: string; title: string; points: number; dependsOn: string[]; description: string; evidence: string; observation: string; hints: { title: string; body: string }[]; checkpoint: Question }[];
  hints: { title: string; hints: { title: string; body: string }[] }[];
};
type Status = { runId: string | null; completedObjectives: string[]; checks?: string[]; runtime?: string; error?: string; subnet?: string; expiresAt?: number; canExtend?: boolean; terminalAvailable?: boolean; targets?: { id: string; label: string }[] };

export function LabWorkspace({ labs }: { labs: Lab[] }) {
  const [selectedId, setSelectedId] = useState(labs[0].id);
  const [csrf, setCsrf] = useState("");
  const [progress, setProgress] = useState<Record<string, Status>>({});
  const [message, setMessage] = useState("Reading material is available without Docker. Connecting to the local controller…");
  const [busy, setBusy] = useState(false);
  const [flags, setFlags] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [now, setNow] = useState(Date.now());
  const requests = useRef(createProgressRequests());
  const original = labs.find((lab) => lab.id === selectedId)!;
  const runtimeSubnet = progress[selectedId]?.subnet;
  const selected: Lab = runtimeSubnet ? JSON.parse(JSON.stringify(original).split(original.subnet.split(".").slice(0, 3).join(".") + ".").join(runtimeSubnet.split(".").slice(0, 3).join(".") + ".")) : original;
  const status = progress[selectedId];
  const completed = status?.completedObjectives ?? [];
  const checkKey = (objectiveId: string) => `${selectedId}/${status?.runId ?? "reading"}/${objectiveId}`;
  const checksPassed = status?.checks?.length ?? 0;

  useEffect(() => {
    try {
      const savedId = localStorage.getItem("reconlab.selectedLab");
      if (labs.some((lab) => lab.id === savedId)) setSelectedId(savedId!);
    } catch { /* Reading and practice still work when browser storage is unavailable. */ }
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [labs]);

  function selectLab(id: string) {
    setSelectedId(id);
    setMessage("Start or resume this lab to investigate in its toolbox.");
    try { localStorage.setItem("reconlab.selectedLab", id); } catch { /* Device preference only. */ }
  }

  async function passCheck(objectiveId: string, answer: number) {
    const id = selectedId;
    if (!status?.runId) { setMessage("Start the lab to save this understanding check."); return; }
    if (!requests.current.beginMutation(id)) return;
    try {
      const result = await controllerRequest<{ progress: Status }>(`/api/standalone/${id}/objectives/${objectiveId}/check`, { method: "POST", headers: { "X-CSRF-Token": csrf, "Content-Type": "application/json" }, body: JSON.stringify({ answer, runId: status.runId }) });
      setProgress((current) => ({ ...current, [id]: result.progress }));
    } catch (error) { setMessage((error as Error).message); }
    finally { requests.current.endMutation(id); }
  }

  const connect = useCallback(async () => {
    try {
      const session = await controllerRequest<{ csrfToken: string }>("/api/session");
      const reads = new Map(labs.map((lab) => [lab.id, requests.current.read(lab.id)]));
      const saved = await controllerRequest<Record<string, Status>>("/api/standalone/progress");
      setCsrf(session.csrfToken);
      setProgress((current) => ({ ...current, ...Object.fromEntries(Object.entries(saved).filter(([id]) => requests.current.current(id, reads.get(id) ?? null))) }));
      setMessage("Controller connected. Start or resume a lab, investigate in its toolbox, then submit each flag here.");
    } catch (error) { setCsrf(""); setMessage((error as Error).message); }
  }, [labs]);
  useEffect(() => { void connect(); }, [connect]);

  const refresh = useCallback(async () => {
    const read = requests.current.read(selectedId);
    if (read === null) return;
    try {
      const result = await controllerRequest<Status>(`/api/standalone/${selectedId}/status`);
      if (!requests.current.current(selectedId, read)) return;
      setProgress((current) => requests.current.current(selectedId, read) ? { ...current, [selectedId]: result } : current);
      if (result.error) setMessage(result.error);
      else setMessage((current) => {
        if (current === "Preparing your instance. The terminal appears when the lab is ready." && result.runtime === "running") return "Your instance is ready. Investigate in the terminal below.";
        if (current.startsWith("Stopping the lab.") && result.runtime === "stopped") return "Lab stopped. Your flags and progress are saved.";
        return current;
      });
    } catch (error) { if (requests.current.current(selectedId, read)) setMessage((error as Error).message); }
  }, [selectedId]);
  useEffect(() => {
    if (!csrf) return;
    void refresh();
    const timer = setInterval(() => { if (!document.hidden) void refresh(); }, 3000);
    return () => clearInterval(timer);
  }, [csrf, refresh]);

  async function lifecycle(action: "start" | "stop" | "reset" | "extend") {
    if (action === "reset" && !window.confirm(`Reset ${selected.title}? This deletes this lab's submitted progress and container files and creates new flags. Other labs are unchanged.`)) return;
    const id = selectedId;
    if (!requests.current.beginMutation(id)) return;
    let failed = false;
    setBusy(true); setMessage(`${action === "start" ? "Starting or resuming" : action === "stop" ? "Stopping" : action === "extend" ? "Extending" : "Resetting"} ${selected.title}. A first build can take several minutes; keep this page open.`);
    try {
      const result = await controllerRequest<Status>(`/api/standalone/${id}/${action}`, { method: "POST", headers: { "X-CSRF-Token": csrf } });
      setProgress((current) => ({ ...current, [id]: result }));
      if (action === "reset") { setFlags({}); setFeedback({}); }
      setMessage(result.error ?? (action === "extend" ? "Added 30 minutes to this lease." : action === "stop" ? "Stopping the lab. Flags and progress are preserved; toolbox temporary files are removed." : "Preparing your instance. The terminal appears when the lab is ready."));
    } catch (error) { failed = true; setMessage((error as Error).message); }
    finally { requests.current.endMutation(id); setBusy(false); }
    if (failed) await refresh();
  }

  async function submit(objectiveId: string) {
    if (!status?.checks?.includes(objectiveId)) return;
    const id = selectedId;
    const key = `${id}/${objectiveId}`;
    if (!requests.current.beginMutation(id)) return;
    setBusy(true);
    try {
      const result = await controllerRequest<{ progress: Status }>(`/api/standalone/${id}/objectives/${objectiveId}/submit`, {
        method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf }, body: JSON.stringify({ flag: flags[key]?.trim(), runId: status.runId }),
      });
      setProgress((current) => ({ ...current, [id]: { ...current[id], ...result.progress } }));
      setFlags((current) => ({ ...current, [key]: "" }));
      setFeedback((current) => ({ ...current, [key]: "Correct — objective verified and saved." }));
    } catch (error) { setFeedback((current) => ({ ...current, [key]: (error as Error).message })); }
    finally { requests.current.endMutation(id); setBusy(false); }
  }

  const operating = busy || ["building", "starting", "stopping", "resetting"].includes(status?.runtime ?? "");
  async function openTarget(targetId: string) {
    // Open synchronously to preserve the user's browser gesture across the request.
    const tab = window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    try { const result = await controllerRequest<{ url: string }>(`/api/standalone/${selectedId}/targets/${targetId}/launch`, { method: "POST", headers: { "X-CSRF-Token": csrf } }); if (tab) tab.location.href = result.url; else setMessage("Allow pop-ups for this portal, then open the target again."); }
    catch (error) { tab?.close(); setMessage((error as Error).message); }
  }
  return <main className="standalone-workspace">
    <header className="workspace-header"><Link href="/">RECON//LAB</Link><span>AUTHORIZED TRAINING ENVIRONMENT</span><Link href="/legacy">Legacy modules</Link></header>
    <div className="workspace-intro"><p className="eyebrow green">BEGINNER INVESTIGATIONS</p><h1>Follow the evidence. Close the case.</h1><p>{labs.length} investigations, with scenarios, tool briefings, per-flag hints, and complete walkthroughs right here.</p>
      <details className="workspace-help">
        <summary>New here? Terminals, key terms, quick fixes, and what comes next</summary>
        <div className="workspace-help-grid">
          <section>
            <h3>Two terminals, different jobs</h3>
            <p><strong>Host terminal</strong> — your own computer, in the project folder; it starts, stops, and checks labs.</p>
            <p><strong>Toolbox terminal</strong> — the panel further down, inside the lab&rsquo;s Linux container; run investigation commands there. A hostname such as <code>triage-node</code> only resolves inside its lab network.</p>
            <p>Copy from the toolbox with <code>Ctrl+Shift+C</code> and paste into it with <code>Ctrl+Shift+V</code> (<code>Cmd</code> on macOS). The flag boxes on this page use the normal <code>Ctrl+V</code> / <code>Cmd+V</code>.</p>
          </section>
          <section>
            <h3>Key terms</h3>
            <ul>
              <li><strong>Command</strong> — a program you type, such as <code>pwd</code> or <code>cat</code>.</li>
              <li><strong>Port</strong> — a numbered doorway for a network service.</li>
              <li><strong>DNS</strong> — maps names to network addresses.</li>
              <li><strong>Hash</strong> — a one-way fingerprint; not encryption.</li>
              <li><strong>Encoding</strong> — a reversible form such as Base64 or hex.</li>
              <li><strong>Flag</strong> — a generated <code>{"RLAB{…}"}</code> value that confirms an objective.</li>
            </ul>
          </section>
          <section>
            <h3>If something looks stuck</h3>
            <ul>
              <li>Docker error — start Docker Desktop, wait for its engine, then Reconnect.</li>
              <li>Hostname not found — use the toolbox terminal of the running lab, not the host.</li>
              <li>Flag rejected — submit only the <code>{"RLAB{…}"}</code> value: no <code>practice_flag=</code> prefix, quotes, or spaces, and not a token.</li>
              <li>Terminal closed — click <strong>Start / resume</strong>; toolbox <code>/tmp</code> files are cleared when a lab stops.</li>
            </ul>
          </section>
          <section>
            <h3>When you finish</h3>
            <p>You will have practiced the terminal, networking, DNS, Linux evidence, a web incident, and encoding. To keep going, try beginner rooms on TryHackMe, Hack The Box, or Root-Me, and revisit any lab&rsquo;s full walkthrough to review the reasoning. Everything here is a synthetic local exercise — always get explicit authorization before testing a real system.</p>
          </section>
        </div>
      </details>
    </div>
    <div className="workspace-layout">
      <nav className="workspace-nav" aria-label="Current curriculum">{labs.map((lab) => <button key={lab.id} disabled={busy} aria-current={selectedId === lab.id ? "page" : undefined} onClick={() => selectLab(lab.id)}><small>{lab.id.slice(0, 2)} / {lab.mode}</small><strong>{lab.title}</strong><span>{progress[lab.id]?.completedObjectives.length ?? 0}/{lab.objectives.length} flags</span></button>)}</nav>
      <article className="workspace-lesson" key={selectedId}>
        <header><p className="eyebrow green">{selected.campaign} / {selected.mode} / {selected.minutes} MIN</p><h2>{selected.title}</h2><p>Recommended first: {selected.prerequisites.length ? selected.prerequisites.map((id) => labs.find((lab) => lab.id === id)?.title).join("; ") : "None — start here"}. Prerequisites are guidance, not locks.</p></header>
        <section className="workspace-section workspace-control"><h2>Your instance</h2><p><strong>{status?.runtime ?? "Connecting"}</strong>{status?.expiresAt && status.runtime === "running" ? ` · ${Math.max(0, Math.ceil((status.expiresAt - now) / 60000))} minutes remaining` : ""}</p><div className="workspace-actions"><button disabled={busy} onClick={() => void connect()}>Reconnect</button><button disabled={busy || !csrf} onClick={() => void refresh()}>Refresh status</button><button className="primary" disabled={operating || !csrf} onClick={() => void lifecycle("start")}>Start / resume lab</button><button disabled={operating || !status?.canExtend} onClick={() => void lifecycle("extend")}>Extend 30 minutes</button><button disabled={operating || !csrf || !status?.runId} onClick={() => void lifecycle("stop")}>Stop lab</button><button disabled={operating || !csrf || !status?.runId} onClick={() => void lifecycle("reset")}>Reset this lab…</button></div><p role="status" aria-live="polite">{message}</p><p>One active lab per account. Each session lasts 60 minutes with one 30-minute extension. Stop or expiry saves flags and progress; temporary toolbox files are removed. Reset creates a fresh attempt.</p>
          {status?.terminalAvailable && status.runId && <><div className="workspace-actions">{status.targets?.map((target) => <button key={target.id} onClick={() => void openTarget(target.id)}>Open {target.label}</button>)}</div><LabTerminal key={status.runId} runId={status.runId} /></>}
          <details><summary>Host terminal fallback</summary><p>From the project directory, run:</p><pre><code>{`node scripts/standalone-labctl.mjs shell ${selectedId} --user <your-username>`}</code></pre></details>
        </section>
        <section className="workspace-section" aria-labelledby="scenario-heading"><h2 id="scenario-heading">Scenario</h2><Markdown text={selected.scenario} /><p><strong>Authorized scope:</strong> {selected.scope}. All other systems are out of scope.</p></section>
        <section className="workspace-section"><h2>What you need to know</h2><Markdown text={selected.basics} /></section>
        <section className="workspace-section"><h2>By the end, you can…</h2><ul>{selected.learningOutcomes.map((outcome) => <li key={outcome}>{outcome}</li>)}</ul></section>

        <section className="workspace-tasks" aria-labelledby="tasks-heading">
          <h2 id="tasks-heading">Your tasks</h2>
          <p>{completed.length}/{selected.objectives.length} flags verified · {checksPassed}/{selected.objectives.length} understanding checks passed.</p>
          <p>Work through each card. Understanding checks and verified flags are saved to your account for this run. Start the lab before submitting answers; reset starts a new attempt.</p>
          {selected.objectives.map((objective, index) => {
            const key = `${selectedId}/${objective.id}`;
            const understandingKey = checkKey(objective.id);
            const done = completed.includes(objective.id);
            const understood = Boolean(status?.checks?.includes(objective.id));
            const missing = objective.dependsOn.filter((id) => !completed.includes(id));
            return <section className="workspace-section workspace-task" key={key} aria-labelledby={`${key}-heading`}>
              <header><p className="eyebrow green">TASK {index + 1} · {objective.points} POINTS {done ? "· FLAG VERIFIED" : ""}</p><h3 id={`${key}-heading`}>{objective.title}</h3></header>
              <h4>Question</h4><Markdown text={objective.description} />
              <h4>Starting evidence</h4><Markdown text={objective.evidence} />
              <h4>Expected observation</h4><Markdown text={objective.observation} />
              <div className="workspace-task-hints"><h4>Hints for this flag</h4><p>Open one at a time; stop when you know what to try.</p>{objective.hints.map((hint) => <details key={hint.title}><summary>{hint.title}</summary><Markdown text={hint.body} /></details>)}</div>
              <Checkpoint key={understandingKey} id={understandingKey} question={objective.checkpoint} passed={understood} onPass={() => void passCheck(objective.id, objective.checkpoint.answer)} />
              <form className="workspace-flag" onSubmit={(event) => { event.preventDefault(); void submit(objective.id); }}>
                <label htmlFor={key}>Submit flag {index + 1}: {objective.title}</label>
                {!done && <><input id={key} autoComplete="off" spellCheck={false} maxLength={200} value={flags[key] ?? ""} onChange={(event) => setFlags((current) => ({ ...current, [key]: event.target.value }))} placeholder="RLAB{...}" /><button type="submit" disabled={busy || !csrf || !status?.runId || missing.length > 0 || !understood || !flags[key]?.trim()}>Submit flag {index + 1}</button>
                  {missing.length > 0 && <p>Verify first: {missing.map((id) => selected.objectives.find((item) => item.id === id)?.title).join("; ")}</p>}
                  {!understood && <p>Pass the understanding check above to enable this portal submission.</p>}
                </>}
                <p role="status">{feedback[key] ?? (done ? "Flag verified and saved for this run." : !csrf ? "Connect the controller to submit." : !status?.runId ? "Start this lab to generate its flags." : "Paste only the complete RLAB{...} value from your evidence.")}</p>
              </form>
            </section>;
          })}
        </section>
        <section className="workspace-section"><h2>Solution</h2><details className="workspace-solution"><summary>Reveal full walkthrough — spoilers for every flag</summary><p>All commands and expected observations are below. Run toolbox commands in the lab shell; submit discovered flags in the forms above. Placeholder tokens must be replaced with your evidence.</p><Markdown text={selected.solution} /></details></section>
        <section className="workspace-section"><h2>What this taught you</h2><Markdown text={selected.takeaway} /></section>
      </article>
    </div>
  </main>;
}
