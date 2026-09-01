"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import catalog from "@/data/labs.json";
import { storyFor } from "./learning-content";

type Objective = { id: string; label: string; points: number; flagKey: string };
type Hint = { id: string; title: string; penalty: number; body: string };
type Lab = {
  id: string; number: string; title: string; subtitle: string; track: string; difficulty: string;
  minutes: number; description: string; skills: string[]; prerequisites: string[]; target: string;
  objectives: Objective[]; hints: Hint[]; solution: string;
};
type View = "home" | "learn" | "library" | "progress" | "setup";
type Runtime = "stopped" | "starting" | "running" | "resetting";
type Progress = Record<string, { completedObjectives: string[]; hints: string[]; score: number; solutionUnlocked: boolean }>;

const labs = catalog as Lab[];
const controllerUrl = "http://127.0.0.1:3030";
const tracks = ["ALL", "FOUNDATION", "RECON", "WEB", "API", "CAPSTONE"];

function difficultyClass(difficulty: string) {
  return difficulty === "ADVANCED" ? "difficulty-advanced" : difficulty === "INTERMEDIATE" ? "difficulty-intermediate" : "difficulty-core";
}

function friendlyHint(lab: Lab, index: number) {
  const story = storyFor(lab.id);
  return index === 0
    ? `Start with the evidence named in the mission: ${story.evidence}`
    : `Stay within the training range. Ask what response or artifact proves the objective: ${story.outcome}`;
}

export function ReconLab() {
  const [view, setView] = useState<View>("home");
  const [selectedId, setSelectedId] = useState("roe-lab-ops");
  const [query, setQuery] = useState("");
  const [track, setTrack] = useState("ALL");
  const [connected, setConnected] = useState(false);
  const [csrf, setCsrf] = useState("");
  const [runtime, setRuntime] = useState<Runtime>("stopped");
  const [progress, setProgress] = useState<Progress>({});
  const [flag, setFlag] = useState("");
  const [revealedHints, setRevealedHints] = useState<string[]>([]);
  const [solutionVisible, setSolutionVisible] = useState(false);
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("Connect the local range when you are ready to begin.");
  const [busy, setBusy] = useState(false);

  const selected = labs.find((lab) => lab.id === selectedId) ?? labs[0];
  const story = storyFor(selected.id);
  const selectedProgress = progress[selected.id] ?? { completedObjectives: [], hints: [], score: 100, solutionUnlocked: false };

  useEffect(() => {
    let cancelled = false;
    async function connect() {
      try {
        const response = await fetch(`${controllerUrl}/api/session`, { credentials: "include" });
        if (!response.ok) throw new Error("controller unavailable");
        const session = (await response.json()) as { csrfToken: string; runtime: Runtime };
        const progressResponse = await fetch(`${controllerUrl}/api/progress`, { credentials: "include" });
        const progressData = progressResponse.ok ? (await progressResponse.json()) as Progress : {};
        if (!cancelled) {
          setCsrf(session.csrfToken);
          setRuntime(session.runtime);
          setProgress(progressData);
          setConnected(true);
          setMessage("Local range connected. Targets are isolated on this device only.");
        }
      } catch {
        if (!cancelled) {
          setConnected(false);
          setMessage("Preview mode. Run npm run lab from the project folder to connect Docker targets.");
        }
      }
    }
    void connect();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    fetch(`${controllerUrl}/api/notes/${selectedId}`, { credentials: "include" })
      .then((response) => response.ok ? response.json() : { body: "" })
      .then((result: { body?: string }) => { if (!cancelled) setNotes(result.body ?? ""); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [connected, selectedId]);

  const filteredLabs = useMemo(() => {
    const normalized = query.toLowerCase().trim();
    return labs.filter((lab) => {
      const module = storyFor(lab.id);
      const searchable = `${lab.title} ${module.mission} ${module.campaignName} ${lab.skills.join(" ")}`.toLowerCase();
      return (track === "ALL" || lab.track === track) && (!normalized || searchable.includes(normalized));
    });
  }, [query, track]);

  const completedModules = labs.filter((lab) => (progress[lab.id]?.completedObjectives.length ?? 0) === lab.objectives.length).length;
  const objectiveCount = labs.reduce((total, lab) => total + lab.objectives.length, 0);
  const solvedObjectives = Object.values(progress).reduce((total, item) => total + item.completedObjectives.length, 0);
  const totalXp = Object.values(progress).reduce((total, item) => total + item.score, 0);
  const nextLab = labs.find((lab) => (progress[lab.id]?.completedObjectives.length ?? 0) < lab.objectives.length) ?? labs.at(-1)!;
  const badges = [
    { id: "scope", name: "Scoped Operator", detail: "Complete the Rules of Engagement proof.", earned: (progress["roe-lab-ops"]?.completedObjectives.length ?? 0) === 1 },
    { id: "recon", name: "Evidence Hunter", detail: "Complete every Recon & Enumeration module.", earned: labs.filter((lab) => lab.track === "RECON").every((lab) => (progress[lab.id]?.completedObjectives.length ?? 0) === lab.objectives.length) },
    { id: "defense", name: "Defensive Thinker", detail: "Verify three web-risk objectives.", earned: labs.filter((lab) => lab.track === "WEB").reduce((total, lab) => total + (progress[lab.id]?.completedObjectives.length ?? 0), 0) >= 3 },
    { id: "incident", name: "Incident Closer", detail: "Complete the Quiet Route capstone.", earned: (progress["capstone-chain"]?.completedObjectives.length ?? 0) === 2 },
  ];
  const earnedBadges = badges.filter((badge) => badge.earned);

  function chooseLab(labId: string) {
    setSelectedId(labId);
    setFlag("");
    setRevealedHints([]);
    setSolutionVisible(false);
    setView("learn");
  }

  async function refreshRangeConnection() {
    try {
      const response = await fetch(`${controllerUrl}/api/session`, { credentials: "include" });
      if (!response.ok) throw new Error("controller unavailable");
      const session = (await response.json()) as { csrfToken: string; runtime: Runtime };
      const progressResponse = await fetch(`${controllerUrl}/api/progress`, { credentials: "include" });
      const progressData = progressResponse.ok ? (await progressResponse.json()) as Progress : {};
      setCsrf(session.csrfToken);
      setRuntime(session.runtime);
      setProgress(progressData);
      setConnected(true);
      setMessage("Local range connected. Targets are isolated on this device only.");
    } catch {
      setConnected(false);
      setRuntime("stopped");
      setMessage("The controller is not ready yet. Run npm run lab, wait a moment, then check again.");
    }
  }

  async function controllerAction(action: "start" | "stop" | "reset") {
    if (!connected) {
      setMessage("The local range is not connected. Run npm run lab first, then return here.");
      return;
    }
    setBusy(true);
    if (action === "start") setRuntime("starting");
    if (action === "reset") setRuntime("resetting");
    try {
      const response = await fetch(`${controllerUrl}/api/labs/${selected.id}/${action}`, {
        method: "POST", credentials: "include", headers: { "X-CSRF-Token": csrf },
      });
      const result = await response.json() as { runtime?: Runtime; error?: string; message?: string };
      if (!response.ok) throw new Error(result.error ?? "The range action failed.");
      setRuntime(result.runtime ?? (action === "stop" ? "stopped" : "running"));
      setMessage(result.message ?? `Lab ${action} complete.`);
    } catch (error) {
      setRuntime("stopped");
      setMessage(error instanceof Error ? error.message : "The range could not be controlled.");
    } finally { setBusy(false); }
  }

  async function submitFlag(objective: Objective) {
    if (!flag.trim()) return;
    if (!connected) { setMessage("Flag validation needs the local controller. Start the range first."); return; }
    setBusy(true);
    try {
      const response = await fetch(`${controllerUrl}/api/labs/${selected.id}/objectives/${objective.id}/submit`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
        body: JSON.stringify({ flag: flag.trim() }),
      });
      const result = await response.json() as { correct?: boolean; progress?: Progress[string]; error?: string };
      if (!response.ok || !result.correct) throw new Error(result.error ?? "That proof is not valid yet.");
      if (result.progress) setProgress((current) => ({ ...current, [selected.id]: result.progress! }));
      setFlag("");
      setMessage(`Objective complete: +${objective.points} XP.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The proof could not be verified.");
    } finally { setBusy(false); }
  }

  async function unlockHint(hint: Hint) {
    if (revealedHints.includes(hint.id) || selectedProgress.hints.includes(hint.id)) return;
    setRevealedHints((current) => [...current, hint.id]);
    setMessage(`Hint opened: ${hint.penalty} XP held back for this module.`);
    if (!connected) return;
    try {
      const response = await fetch(`${controllerUrl}/api/labs/${selected.id}/hints/${hint.id}/unlock`, {
        method: "POST", credentials: "include", headers: { "X-CSRF-Token": csrf },
      });
      const result = await response.json() as { progress?: Progress[string] };
      if (result.progress) setProgress((current) => ({ ...current, [selected.id]: result.progress! }));
    } catch { setMessage("The hint is open locally but its score change could not be saved."); }
  }

  async function unlockSolution() {
    setSolutionVisible(true);
    setMessage("Full walkthrough opened. Use it to understand the evidence, then reset and try again.");
    if (!connected) return;
    try {
      const response = await fetch(`${controllerUrl}/api/labs/${selected.id}/solution/unlock`, {
        method: "POST", credentials: "include", headers: { "X-CSRF-Token": csrf },
      });
      const result = await response.json() as { progress?: Progress[string] };
      if (result.progress) setProgress((current) => ({ ...current, [selected.id]: result.progress! }));
    } catch { setMessage("The walkthrough is open, but the score change could not be saved."); }
  }

  async function saveNotes() {
    if (!connected) { setMessage("Notes stay in this page until the local controller is connected."); return; }
    try {
      const response = await fetch(`${controllerUrl}/api/notes`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
        body: JSON.stringify({ labId: selected.id, body: notes }),
      });
      if (!response.ok) throw new Error("save failed");
      setMessage("Evidence notes saved to your local learning record.");
    } catch { setMessage("Notes could not be saved. The controller may be unavailable."); }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setView("home")} aria-label="Open RECON LAB home">
          <span className="brand-mark">R/</span><span><strong>RECON//LAB</strong><small>SAFE CYBER LEARNING</small></span>
        </button>
        <nav className="main-nav" aria-label="Primary navigation">
          <button className={view === "home" ? "active" : ""} onClick={() => setView("home")}><span>01</span> Home</button>
          <button className={view === "learn" ? "active" : ""} onClick={() => setView("learn")}><span>02</span> Learn <em>{labs.length}</em></button>
          <button className={view === "library" ? "active" : ""} onClick={() => setView("library")}><span>03</span> Defend</button>
          <button className={view === "progress" ? "active" : ""} onClick={() => setView("progress")}><span>04</span> Progress</button>
          <button className={view === "setup" ? "active" : ""} onClick={() => setView("setup")}><span>05</span> Set up</button>
        </nav>
        <div className="sidebar-paths"><p className="eyebrow">Learning paths</p>{["FOUNDATION", "RECON", "WEB", "CAPSTONE"].map((item) => <button key={item} onClick={() => { setTrack(item); setView("learn"); }}><i className={`path-dot ${item.toLowerCase()}`} />{item === "FOUNDATION" ? "FOUNDATIONS" : item}<small>{labs.filter((lab) => lab.track === item).length}</small></button>)}</div>
        <div className="range-status"><span className={connected ? "status-dot online" : "status-dot"} /><div><strong>{connected ? "LOCAL RANGE READY" : "PREVIEW MODE"}</strong><p>{connected ? "Isolated Docker targets" : "Connect Docker to launch labs"}</p></div></div>
      </aside>

      <section className="app-content">
        <header className="topbar"><p><span className="live-dot" /> AUTHORIZED TRAINING ENVIRONMENT <small>Everything outside this range is out of scope.</small></p><div><span className="xp-pill">{totalXp.toLocaleString()} XP</span><button className="profile-button" aria-label="Your profile">RL</button></div></header>

        {view === "home" && <section className="page home-page">
          <div className="home-hero"><div><p className="eyebrow green">BEGINNER PATH / LOCAL-FIRST BETA</p><h1>Learn the why.<br /><span>Prove the how.</span></h1><p>Build real security judgment through guided, isolated investigations. Every objective begins with a reason, stays within an authorized scope, and ends with a defensive lesson.</p><div className="hero-actions"><button className="button primary" onClick={() => chooseLab(nextLab.id)}>Continue learning <b>→</b></button><button className="button secondary" onClick={() => setView("library")}>Explore defenses</button></div></div><div className="hero-route"><p>YOUR NEXT INVESTIGATION</p><strong>{nextLab.number}. {nextLab.title}</strong><span>{storyFor(nextLab.id).mission}</span><div className="route-line"><i /><i /><i /><i /></div><small>{nextLab.minutes} min · {storyFor(nextLab.id).campaignName}</small></div></div>
          <div className="stat-grid"><article><small>MODULES COMPLETED</small><strong>{completedModules}<span>/{labs.length}</span></strong><div className="progress-track"><i style={{ width: `${(completedModules / labs.length) * 100}%` }} /></div></article><article><small>OBJECTIVES VERIFIED</small><strong>{solvedObjectives}<span>/{objectiveCount}</span></strong><p>Evidence-based progress</p></article><article><small>RANGE STATUS</small><strong className={runtime === "running" ? "positive" : "muted"}>{runtime === "running" ? "ONLINE" : "READY"}</strong><p>{connected ? "Controller connected" : "Start when Docker is ready"}</p></article></div>
          <section className="section"><div className="section-title"><div><p className="eyebrow">CHOOSE A PATH</p><h2>Learn in a sequence that makes sense</h2></div><button className="text-button" onClick={() => { setTrack("ALL"); setView("learn"); }}>View all modules →</button></div><div className="campaign-grid">{["FOUNDATION", "RECON", "WEB"].map((item) => { const first = labs.find((lab) => lab.track === item)!; const modules = labs.filter((lab) => lab.track === item); const pathName = item === "FOUNDATION" ? "Range Foundations" : item === "RECON" ? "Recon & Enumeration" : "Web Exploitation & Defense"; return <button className="campaign-card" key={item} onClick={() => { setTrack(item); chooseLab(first.id); }}><span className={`campaign-icon ${item.toLowerCase()}`}>{item === "FOUNDATION" ? "01" : item === "RECON" ? "02" : "03"}</span><p>{pathName}</p><strong>{item === "FOUNDATION" ? "Prepare for safe practice" : item === "RECON" ? "Follow the evidence trail" : "Test and fix web risk"}</strong><small>{modules.length} guided modules</small><b>Open path →</b></button>; })}</div></section>
          <section className="setup-card"><div><p className="eyebrow">FIRST TIME HERE?</p><h2>Set up your safe local range</h2><p>Check Docker, launch the local controller, then begin with a short scope orientation.</p></div><div className="setup-card-actions"><button className="button secondary" onClick={() => setView("setup")}>Set up range</button><button className="button primary" onClick={() => chooseLab("roe-lab-ops")}>Start orientation</button></div></section>
        </section>}

        {view === "learn" && <section className="page learn-page">
          <header className="module-header"><div><p className="eyebrow">{story.campaignName} / MODULE {selected.number}</p><h1>{selected.title}</h1><p>{story.mission}</p></div><div className="runtime-actions"><span className={`runtime-badge ${runtime}`}>{runtime === "running" ? "● RANGE ONLINE" : runtime === "starting" ? "STARTING" : runtime === "resetting" ? "RESETTING" : "RANGE OFFLINE"}</span><button className="button compact secondary" disabled={busy} onClick={() => void controllerAction("reset")}>Reset</button>{runtime === "running" ? <button className="button compact danger" disabled={busy} onClick={() => void controllerAction("stop")}>Stop</button> : <button className="button compact primary" disabled={busy} onClick={() => void controllerAction("start")}>Start lab</button>}</div></header>
          <div className="learn-layout"><aside className="module-browser"><label className="search"><span>⌕</span><input aria-label="Search learning modules" placeholder="Search modules or skills" value={query} onChange={(event) => setQuery(event.target.value)} /></label><div className="filter-row" role="group" aria-label="Filter by learning path">{tracks.map((item) => <button key={item} className={track === item ? "selected" : ""} onClick={() => setTrack(item)}>{item === "FOUNDATION" ? "BASE" : item}</button>)}</div><div className="module-list">{filteredLabs.map((lab) => { const done = (progress[lab.id]?.completedObjectives.length ?? 0) === lab.objectives.length; return <button key={lab.id} className={lab.id === selected.id ? "module-row active" : "module-row"} onClick={() => chooseLab(lab.id)}><span>{done ? "✓" : lab.number}</span><div><strong>{lab.title}</strong><small>{storyFor(lab.id).mission}</small></div><em className={difficultyClass(lab.difficulty)}>{lab.difficulty.slice(0, 3)}</em></button>; })}</div></aside>
            <article className="mission-content"><section className="mission-card"><div className="mission-top"><span className={`tag ${difficultyClass(selected.difficulty)}`}>{selected.difficulty}</span><span className="tag">{selected.minutes} MIN</span></div><p className="eyebrow green">YOUR ROLE</p><h2>{story.mission}</h2><p>{story.briefing}</p><div className="mission-facts"><div><small>STARTING EVIDENCE</small><strong>{story.evidence}</strong></div><div><small>SUCCESS LOOKS LIKE</small><strong>{story.outcome}</strong></div></div></section>
              <section className="learning-steps"><p className="eyebrow">LEARNING FLOW</p><div><article><span>1</span><div><strong>Understand the context</strong><p>Read why this investigation matters and what is authorized.</p></div></article><article><span>2</span><div><strong>Collect evidence</strong><p>Use only the training targets and record what changes your hypothesis.</p></div></article><article><span>3</span><div><strong>Prove the objective</strong><p>Submit the range proof when your evidence supports the finding.</p></div></article><article><span>4</span><div><strong>Defend the system</strong><p>Finish by connecting the finding to a practical control.</p></div></article></div></section>
              <section className="objectives-panel"><div className="card-heading"><div><p className="eyebrow">OBJECTIVES</p><h2>What you are proving</h2></div><strong>{selectedProgress.completedObjectives.length}/{selected.objectives.length}</strong></div>{selected.objectives.map((objective) => { const complete = selectedProgress.completedObjectives.includes(objective.id); const label = story.objectives[objective.id] ?? objective.label; return <div className={complete ? "objective complete" : "objective"} key={objective.id}><span>{complete ? "✓" : ""}</span><div><strong>{label}</strong><small>{objective.points} XP · Valid only inside this range</small></div>{!complete && <div className="flag-entry"><input aria-label={`Proof for ${label}`} value={flag} onChange={(event) => setFlag(event.target.value)} placeholder="RLAB{...}" onKeyDown={(event) => { if (event.key === "Enter") void submitFlag(objective); }} /><button disabled={busy || !flag.trim()} onClick={() => void submitFlag(objective)}>Verify</button></div>}</div>; })}</section>
              <section className="defense-card"><p className="eyebrow">DEFENSIVE TAKEAWAY</p><h2>How to prevent this finding</h2><p>{story.defense}</p></section>
            </article>
            <aside className="lab-tools"><section className="tool-card"><div className="tool-heading"><div><p className="eyebrow">RANGE CONTROL</p><strong>{runtime === "running" ? "Your lab is running" : "Ready when you are"}</strong></div><span className={connected ? "status-dot online" : "status-dot"} /></div><p>{connected ? "This range runs on your device in an isolated, no-egress Docker network." : "Connect the local controller to launch Docker targets and save progress."}</p><code>{selected.target}</code></section><section className="hint-card"><div className="card-heading"><div><p className="eyebrow">NEED A NUDGE?</p><h2>Hints</h2></div><small>Score: {selectedProgress.score}</small></div>{selected.hints.map((hint, index) => { const visible = revealedHints.includes(hint.id) || selectedProgress.hints.includes(hint.id); return <div className="hint" key={hint.id}><span>0{index + 1}</span><div><strong>{visible ? `Hint ${index + 1}` : "Locked hint"}</strong>{visible && <p>{friendlyHint(selected, index)}</p>}</div><button disabled={visible} onClick={() => void unlockHint(hint)}>{visible ? "Open" : `-${hint.penalty} XP`}</button></div>; })}<button className="solution-button" onClick={() => void unlockSolution()} disabled={solutionVisible || selectedProgress.solutionUnlocked}>{solutionVisible || selectedProgress.solutionUnlocked ? "Walkthrough open" : "Open full walkthrough"}</button>{(solutionVisible || selectedProgress.solutionUnlocked) && <p className="solution-copy">Review the evidence chain, then reset the scenario and reproduce the finding without the walkthrough.</p>}</section><section className="notes-card"><div className="card-heading"><div><p className="eyebrow">YOUR NOTES</p><h2>Evidence log</h2></div><button className="text-button" onClick={() => void saveNotes()}>Save</button></div><textarea aria-label="Evidence notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={"What did you observe?\nWhat does it mean?\nWhat would you fix?"} /></section><section className="message-card"><span className={connected ? "status-dot online" : "status-dot"} /><p>{message}</p></section></aside>
          </div>
        </section>}

        {view === "library" && <section className="page library-page"><header className="page-heading"><p className="eyebrow green">DEFENSE LIBRARY</p><h1>Turn every finding into a fix</h1><p>Use the same lessons to understand how defenders discover, contain, and prevent common application risk.</p></header><div className="defense-grid">{labs.map((lab) => { const module = storyFor(lab.id); return <article key={lab.id} className="defense-entry"><div><span className="tag">{module.campaignName}</span><small>{lab.number}</small></div><h2>{lab.title}</h2><p className="defense-finding">{module.mission}</p><div><p><b>INVESTIGATE</b>{module.evidence}</p><p><b>PREVENT</b>{module.defense}</p></div><button className="text-button" onClick={() => chooseLab(lab.id)}>Open module →</button></article>; })}</div></section>}

        {view === "progress" && <section className="page progress-page"><header className="page-heading"><p className="eyebrow green">YOUR LEARNING RECORD</p><h1>Progress built on evidence</h1><p>Local progress is saved by the current controller. Account sync arrives in a later batch.</p></header><div className="progress-summary"><article><small>TOTAL XP</small><strong>{totalXp.toLocaleString()}</strong></article><article><small>OBJECTIVES</small><strong>{solvedObjectives}<span>/{objectiveCount}</span></strong></article><article className="completion-ring" style={{ "--completion": `${(solvedObjectives / objectiveCount) * 360}deg` } as CSSProperties}><span>{Math.round((solvedObjectives / objectiveCount) * 100)}%</span><small>COMPLETE</small></article></div><section className="badge-section"><div className="badge-heading"><div><p className="eyebrow green">RECOGNITION</p><h2>Milestones earned through practice</h2></div><p>{earnedBadges.length}/{badges.length} earned on this device</p></div><div className="badge-grid">{badges.map((badge) => <article className={badge.earned ? "badge-card earned" : "badge-card"} key={badge.id}><span aria-hidden="true">{badge.earned ? "✓" : "○"}</span><div><strong>{badge.name}</strong><p>{badge.detail}</p></div><small>{badge.earned ? "Earned" : "Locked"}</small></article>)}</div></section><div className="progress-list"><div className="progress-row heading"><span>MODULE</span><span>PATH</span><span>PROOF</span><span>STATUS</span></div>{labs.map((lab) => { const item = progress[lab.id]; const solved = item?.completedObjectives.length ?? 0; const complete = solved === lab.objectives.length; return <button className="progress-row" key={lab.id} onClick={() => chooseLab(lab.id)}><span><i>{lab.number}</i><strong>{lab.title}</strong></span><span>{storyFor(lab.id).campaignName}</span><span>{solved}/{lab.objectives.length}</span><span className={complete ? "done" : "not-started"}>{complete ? "Complete" : solved ? "In progress" : "Not started"}</span></button>; })}</div></section>}

        {view === "setup" && <section className="page setup-page"><header className="page-heading"><p className="eyebrow green">LOCAL RANGE SETUP</p><h1>Practice safely on your own device</h1><p>RECON//LAB starts the portal and a loopback-only controller. Training targets run in an isolated Docker network with no outbound access.</p></header><div className="setup-status-card"><div><span className={connected ? "status-dot online" : "status-dot"} /><div><p className="eyebrow">CONNECTION CHECK</p><strong>{connected ? "Local range connected" : "Local range not connected"}</strong><p>{connected ? "You can launch a guided lab whenever you are ready." : "Complete the three steps below, then check again."}</p></div></div><button className="button primary" onClick={() => void refreshRangeConnection()}>Check connection</button></div><div className="setup-steps"><article><span>01</span><div><p className="eyebrow">PREREQUISITES</p><h2>Install the local tools</h2><p>Install Node.js 22 or later and Docker Desktop. Open Docker once and wait until it reports that the engine is running.</p></div></article><article><span>02</span><div><p className="eyebrow">START</p><h2>Launch RECON//LAB</h2><p>From the project folder, run this one command. It starts the learning portal and local controller together.</p><code>npm run lab</code></div></article><article><span>03</span><div><p className="eyebrow">VERIFY</p><h2>Return to this page</h2><p>Use “Check connection.” When the range is connected, begin with orientation before starting a lab.</p><button className="text-button" onClick={() => chooseLab("roe-lab-ops")}>Open orientation →</button></div></article></div><section className="setup-safety"><p className="eyebrow">SAFETY BY DEFAULT</p><div><article><strong>Loopback controller</strong><p>Only this computer can control the local range.</p></article><article><strong>Isolated targets</strong><p>Docker targets are kept off the internet and outside your normal network.</p></article><article><strong>Scoped learning</strong><p>Every module states what is authorized and how to defend the finding.</p></article></div></section></section>}
      </section>
      <footer className="active-lab-bar"><div><span className={runtime === "running" ? "status-dot online" : "status-dot"} /><span><small>ACTIVE LAB</small><strong>{selected.number}. {selected.title}</strong></span></div><p>{runtime === "running" ? "Targets are running safely on this device." : "Choose Start lab when your local range is ready."}</p><button className="text-button" onClick={() => chooseLab(selected.id)}>Open workspace →</button></footer>
    </main>
  );
}
