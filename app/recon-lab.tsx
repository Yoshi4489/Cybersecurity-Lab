"use client";

import { useEffect, useMemo, useState } from "react";
import catalog from "@/data/labs.json";

type Objective = { id: string; label: string; points: number; flagKey: string };
type Hint = { id: string; title: string; penalty: number; body: string };
type Lab = {
  id: string;
  number: string;
  title: string;
  subtitle: string;
  track: string;
  difficulty: string;
  minutes: number;
  description: string;
  skills: string[];
  prerequisites: string[];
  target: string;
  objectives: Objective[];
  hints: Hint[];
  solution: string;
};
type View = "dashboard" | "labs" | "playbooks" | "progress";
type Progress = Record<
  string,
  { completedObjectives: string[]; hints: string[]; score: number; solutionUnlocked: boolean }
>;

const labs = catalog as Lab[];
const controllerUrl = "http://127.0.0.1:3030";
const tracks = ["ALL", "FOUNDATION", "RECON", "WEB", "API", "CAPSTONE"];
const playbookGuidance: Record<string, { detection: string; fix: string }> = {
  "roe-lab-ops": { detection: "ตรวจ scope record และ event timeline ก่อนรับผลทดสอบ", fix: "ใช้ written authorization, target allowlist และ time window ทุกครั้ง" },
  "passive-footprint": { detection: "ทำ exposure review ของ HTML, documents และ build artifacts", fix: "ลบ comments/metadata และแยกข้อมูลภายในออกจาก public build" },
  "dns-certificate-trail": { detection: "เทียบ DNS/certificate inventory กับ asset registry", fix: "ใช้ split DNS และไม่ตั้งชื่อ host ให้เผยหน้าที่หรือสิทธิ์" },
  "active-service-mapping": { detection: "มองหา connection sweep หลายพอร์ตในช่วงเวลาสั้น", fix: "จำกัด ingress, ปิด service ที่ไม่ใช้ และแยก management plane" },
  "http-fingerprinting": { detection: "สแกน response headers หา debug/version disclosure", fix: "ปิด diagnostic headers และใช้ standardized error responses" },
  "content-discovery": { detection: "แจ้งเตือน 404 burst และการขอ backup extensions", fix: "ไม่ deploy backups; block dotfiles และตรวจ release artifact" },
  "auth-enumeration": { detection: "เทียบ login failures ตาม username และ response variance", fix: "ใช้ข้อความและ timing ใกล้เคียงกัน พร้อม rate limiting" },
  "idor-bola": { detection: "หา user ที่ไล่ numeric IDs หรือขอ object ข้าม owner", fix: "ทำ object authorization ทุก request และใช้ opaque IDs เป็น defense-in-depth" },
  "sql-injection": { detection: "เฝ้าดู quote, comments และ tautology ใน input/query errors", fix: "ใช้ parameterized queries และลดสิทธิ์ database account" },
  "command-injection": { detection: "แจ้งเตือน shell metacharacters และ process tree ผิดปกติ", fix: "หลีกเลี่ยง shell; ใช้ structured API และ strict argument allowlist" },
  "cross-site-scripting": { detection: "เก็บ CSP violation reports และ script-like input", fix: "encode ตาม output context, sanitize HTML และบังคับ CSP" },
  "csrf-session": { detection: "ตรวจ state change ผ่าน GET หรือ Origin/Referer ผิดปกติ", fix: "ใช้ POST, CSRF token, SameSite cookies และ origin validation" },
  "ssrf-pivot": { detection: "จับ outbound จาก web tier ไป internal/metadata addresses", fix: "canonical URL allowlist, DNS/IP validation และ default-deny egress" },
  "path-traversal-lfi": { detection: "แจ้งเตือน ../, encoded separators และ sensitive filenames", fix: "canonicalize แล้วตรวจ base directory; ใช้ server-side file IDs" },
  "insecure-file-upload": { detection: "เทียบ extension, MIME และ magic bytes พร้อม quarantine log", fix: "allowlist format, rename file และเก็บนอก executable web root" },
  "jwt-mass-assignment": { detection: "แจ้งเตือน alg=none, claim mismatch และ role field จาก client", fix: "pin algorithm/key และ map request DTO ด้วย field allowlist" },
  "business-logic": { detection: "หา negative quantity, impossible totals และ replay patterns", fix: "บังคับ business invariants ฝั่ง server และทำ idempotency controls" },
  "capstone-chain": { detection: "correlate recon sweep, object access และ internal fetch เป็น timeline เดียว", fix: "ใช้ defense-in-depth: object auth, egress policy และ centralized telemetry" },
};

function Glyph({ children }: { children: React.ReactNode }) {
  return <span className="glyph" aria-hidden="true">{children}</span>;
}

function difficultyTone(difficulty: string) {
  return difficulty === "ADVANCED" ? "danger" : difficulty === "INTERMEDIATE" ? "warm" : "cool";
}

export function ReconLab() {
  const [view, setView] = useState<View>("labs");
  const [selectedId, setSelectedId] = useState("roe-lab-ops");
  const [query, setQuery] = useState("");
  const [track, setTrack] = useState("ALL");
  const [connected, setConnected] = useState(false);
  const [csrf, setCsrf] = useState("");
  const [runtime, setRuntime] = useState<"stopped" | "starting" | "running" | "resetting">("stopped");
  const [progress, setProgress] = useState<Progress>({});
  const [flag, setFlag] = useState("");
  const [revealedHints, setRevealedHints] = useState<string[]>([]);
  const [solutionVisible, setSolutionVisible] = useState(false);
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("พร้อมเริ่มเมื่อ local controller เชื่อมต่อ");
  const [busy, setBusy] = useState(false);

  const selected = labs.find((lab) => lab.id === selectedId) ?? labs[0];
  const selectedProgress = progress[selected.id] ?? {
    completedObjectives: [],
    hints: [],
    score: 100,
    solutionUnlocked: false,
  };

  useEffect(() => {
    let cancelled = false;
    async function connect() {
      try {
        const response = await fetch(`${controllerUrl}/api/session`, { credentials: "include" });
        if (!response.ok) throw new Error("controller unavailable");
        const session = (await response.json()) as { csrfToken: string; runtime: typeof runtime };
        const progressResponse = await fetch(`${controllerUrl}/api/progress`, { credentials: "include" });
        const progressData = progressResponse.ok ? ((await progressResponse.json()) as Progress) : {};
        if (!cancelled) {
          setCsrf(session.csrfToken);
          setRuntime(session.runtime);
          setProgress(progressData);
          setConnected(true);
          setMessage("Controller เชื่อมต่อแล้ว — target network ถูกจำกัดอยู่ในเครื่องนี้");
        }
      } catch {
        if (!cancelled) {
          setConnected(false);
          setMessage("Preview mode — รัน npm run lab เพื่อเปิด controller และ Docker targets");
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
      const inTrack = track === "ALL" || lab.track === track;
      const searchable = `${lab.title} ${lab.subtitle} ${lab.skills.join(" ")}`.toLowerCase();
      return inTrack && (!normalized || searchable.includes(normalized));
    });
  }, [query, track]);

  const completedCount = Object.values(progress).filter((item) => item.completedObjectives?.length).length;
  const objectiveCount = labs.reduce((total, lab) => total + lab.objectives.length, 0);
  const solvedObjectives = Object.values(progress).reduce((total, item) => total + (item.completedObjectives?.length ?? 0), 0);
  const totalScore = Object.values(progress).reduce((total, item) => total + (item.score ?? 0), 0);

  async function controllerAction(action: "start" | "stop" | "reset") {
    if (!connected) {
      setMessage("ยังไม่พบ controller — เปิด terminal แล้วรัน npm run lab จากโฟลเดอร์โปรเจกต์");
      return;
    }
    setBusy(true);
    setRuntime(action === "reset" ? "resetting" : action === "start" ? "starting" : runtime);
    try {
      const response = await fetch(`${controllerUrl}/api/labs/${selected.id}/${action}`, {
        method: "POST",
        credentials: "include",
        headers: { "X-CSRF-Token": csrf },
      });
      const result = (await response.json()) as { runtime?: typeof runtime; error?: string; message?: string };
      if (!response.ok) throw new Error(result.error ?? "action failed");
      setRuntime(result.runtime ?? (action === "stop" ? "stopped" : "running"));
      setMessage(result.message ?? `Lab ${action} สำเร็จ`);
    } catch (error) {
      setRuntime("stopped");
      setMessage(error instanceof Error ? error.message : "ไม่สามารถควบคุม lab ได้");
    } finally {
      setBusy(false);
    }
  }

  async function submitFlag(objective: Objective) {
    if (!flag.trim()) return;
    if (!connected) {
      setMessage("การตรวจ flag ต้องใช้ local controller — รัน npm run lab ก่อน");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(
        `${controllerUrl}/api/labs/${selected.id}/objectives/${objective.id}/submit`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
          body: JSON.stringify({ flag: flag.trim() }),
        },
      );
      const result = (await response.json()) as { correct?: boolean; progress?: Progress[string]; error?: string };
      if (!response.ok || !result.correct) throw new Error(result.error ?? "Flag ยังไม่ถูกต้อง");
      if (result.progress) setProgress((current) => ({ ...current, [selected.id]: result.progress! }));
      setFlag("");
      setMessage(`Objective complete +${objective.points} pts`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ตรวจ flag ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function unlockHint(hint: Hint) {
    if (revealedHints.includes(hint.id)) return;
    setRevealedHints((current) => [...current, hint.id]);
    setMessage(`เปิด ${hint.title} — หัก ${hint.penalty} pts`);
    if (!connected) return;
    try {
      const response = await fetch(`${controllerUrl}/api/labs/${selected.id}/hints/${hint.id}/unlock`, {
        method: "POST",
        credentials: "include",
        headers: { "X-CSRF-Token": csrf },
      });
      const result = (await response.json()) as { progress?: Progress[string] };
      if (result.progress) setProgress((current) => ({ ...current, [selected.id]: result.progress! }));
    } catch { setMessage("Hint เปิดแล้วใน preview แต่ยังไม่บันทึกคะแนน"); }
  }

  async function unlockSolution() {
    setSolutionVisible(true);
    setMessage("เปิด solution แล้ว — lab นี้จะไม่คิดคะแนนเต็ม");
    if (!connected) return;
    try {
      const response = await fetch(`${controllerUrl}/api/labs/${selected.id}/solution/unlock`, {
        method: "POST", credentials: "include", headers: { "X-CSRF-Token": csrf },
      });
      const result = (await response.json()) as { progress?: Progress[string] };
      if (result.progress) setProgress((current) => ({ ...current, [selected.id]: result.progress! }));
    } catch { setMessage("Solution เปิดแล้วใน preview แต่ยังไม่บันทึกคะแนน"); }
  }

  async function saveNotes() {
    if (!connected) {
      setMessage("Notes ยังไม่ถูกบันทึก — เปิด local controller ก่อน");
      return;
    }
    const response = await fetch(`${controllerUrl}/api/notes`, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
      body: JSON.stringify({ labId: selected.id, body: notes }),
    });
    setMessage(response.ok ? "บันทึก notes แล้ว" : "บันทึก notes ไม่สำเร็จ");
  }

  function chooseLab(id: string) {
    setSelectedId(id);
    setFlag("");
    setRevealedHints([]);
    setSolutionVisible(false);
    setNotes("");
    setView("labs");
  }

  return (
    <main className="lab-shell">
      <aside className="sidebar">
        <div className="brand" aria-label="Recon Lab">
          <span className="brand-mark">R<span>{"//"}</span>L</span>
          <span className="brand-copy"><strong>RECON//LAB</strong><small>OFFENSIVE SECURITY RANGE</small></span>
        </div>

        <nav className="primary-nav" aria-label="เมนูหลัก">
          <button className={view === "dashboard" ? "active" : ""} onClick={() => setView("dashboard")}><Glyph>⌂</Glyph><span>Overview</span></button>
          <button className={view === "labs" ? "active" : ""} onClick={() => setView("labs")}><Glyph>⌁</Glyph><span>Lab Workspace</span><em>{labs.length}</em></button>
          <button className={view === "playbooks" ? "active" : ""} onClick={() => setView("playbooks")}><Glyph>▤</Glyph><span>Playbooks</span></button>
          <button className={view === "progress" ? "active" : ""} onClick={() => setView("progress")}><Glyph>↗</Glyph><span>Progress</span></button>
        </nav>

        <div className="sidebar-section">
          <p className="eyebrow">LEARNING PATHS</p>
          {tracks.slice(1).map((item) => {
            const count = labs.filter((lab) => lab.track === item).length;
            return <button key={item} className="path-row" onClick={() => { setTrack(item); setView("labs"); }}><span className={`path-dot ${item.toLowerCase()}`} />{item}<small>{count}</small></button>;
          })}
        </div>

        <div className="range-card">
          <div><span className={`status-light ${connected ? "online" : ""}`} /><strong>{connected ? "RANGE ONLINE" : "CONTROLLER OFFLINE"}</strong></div>
          <p>{connected ? "Isolated network · no egress" : "Portal preview is available"}</p>
          <code>127.0.0.1 · LOCAL ONLY</code>
        </div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div className="scope-banner"><Glyph>◉</Glyph><span>AUTHORIZED TRAINING ENVIRONMENT</span><small>Targets outside this range are out of scope.</small></div>
          <div className="top-actions"><span className="score-pill">{totalScore.toLocaleString()} <small>PTS</small></span><button className="icon-button" aria-label="การตั้งค่า">⚙</button><span className="avatar">OP</span></div>
        </header>

        {view === "dashboard" && (
          <section className="view dashboard-view">
            <div className="hero-panel">
              <div>
                <p className="eyebrow orange">LOCAL CYBER RANGE / COHORT 01</p>
                <h1>ฝึกคิดแบบ attacker<br /><span>ในขอบเขตที่ควบคุมได้</span></h1>
                <p>18 labs เชื่อม reconnaissance, web exploitation และ remediation evidence เข้าด้วยกันใน Docker network ที่ reset ได้ทุกเมื่อ</p>
                <div className="hero-actions"><button className="primary-button" onClick={() => setView("labs")}>เปิด Lab Workspace <span>→</span></button><button className="secondary-button" onClick={() => setView("playbooks")}>ดู Playbooks</button></div>
              </div>
              <div className="topology" aria-label="แผนผัง lab network">
                <div className="topology-label">ATTACK PATH / ISOLATED</div>
                <div className="node node-a">YOU<small>toolbox</small></div><i className="line l1" />
                <div className="node node-b">EDGE<small>gateway</small></div><i className="line l2" />
                <div className="node node-c">WEB<small>target</small></div><i className="line l3" />
                <div className="node node-d">INT<small>no route</small></div>
              </div>
            </div>
            <div className="metrics-grid">
              <article><small>LAB COMPLETION</small><strong>{completedCount}<span>/{labs.length}</span></strong><div className="meter"><i style={{ width: `${(completedCount / labs.length) * 100}%` }} /></div></article>
              <article><small>OBJECTIVES</small><strong>{solvedObjectives}<span>/{objectiveCount}</span></strong><p>validated proofs</p></article>
              <article><small>RANGE STATE</small><strong className={runtime === "running" ? "green" : "muted"}>{runtime.toUpperCase()}</strong><p>{connected ? "controller connected" : "preview only"}</p></article>
              <article><small>EST. COURSE</small><strong>15.5<span>H</span></strong><p>intermediate → advanced</p></article>
            </div>
            <div className="section-heading"><div><p className="eyebrow">RECOMMENDED NEXT</p><h2>เดิน attack path ต่อจากจุดล่าสุด</h2></div><button onClick={() => setView("labs")}>VIEW ALL LABS →</button></div>
            <div className="recommended-grid">{labs.slice(Math.min(completedCount, labs.length - 3), Math.min(completedCount, labs.length - 3) + 3).map((lab) => <LabCard key={lab.id} lab={lab} progress={progress[lab.id]} onOpen={() => chooseLab(lab.id)} />)}</div>
          </section>
        )}

        {view === "labs" && (
          <section className="view workspace-view">
            <div className="workspace-header">
              <div><p className="eyebrow">LAB WORKSPACE / {selected.track}</p><h1>{selected.number}. {selected.title}</h1><p>{selected.subtitle}</p></div>
              <div className="runtime-controls">
                <span className={`runtime-badge ${runtime}`}>{runtime === "running" ? "● TARGETS ONLINE" : runtime.toUpperCase()}</span>
                <button className="small-button" disabled={busy} onClick={() => void controllerAction("reset")}>↻ RESET</button>
                {runtime === "running" ? <button className="stop-button" disabled={busy} onClick={() => void controllerAction("stop")}>■ STOP</button> : <button className="primary-button compact" disabled={busy} onClick={() => void controllerAction("start")}>▶ START LAB</button>}
              </div>
            </div>

            <div className="workspace-grid">
              <aside className="lab-browser">
                <div className="search-box"><span>⌕</span><input aria-label="ค้นหา labs" placeholder="Search labs or skills" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
                <div className="track-tabs" role="group" aria-label="กรองตาม track">{tracks.map((item) => <button key={item} className={track === item ? "active" : ""} onClick={() => setTrack(item)}>{item === "FOUNDATION" ? "BASE" : item}</button>)}</div>
                <div className="lab-list">{filteredLabs.map((lab) => {
                  const done = progress[lab.id]?.completedObjectives?.length === lab.objectives.length;
                  return <button key={lab.id} className={`lab-row ${lab.id === selected.id ? "active" : ""}`} onClick={() => chooseLab(lab.id)}><span className="lab-index">{done ? "✓" : lab.number}</span><span><strong>{lab.title}</strong><small>{lab.track} · {lab.minutes} MIN</small></span><em className={difficultyTone(lab.difficulty)}>{lab.difficulty.slice(0, 3)}</em></button>;
                })}</div>
              </aside>

              <div className="lab-main">
                <div className="brief-card">
                  <div className="brief-top"><div><span className={`tag ${difficultyTone(selected.difficulty)}`}>{selected.difficulty}</span><span className="tag outline">{selected.minutes} MIN</span></div><code>{selected.target}</code></div>
                  <h2>Mission brief</h2><p>{selected.description}</p>
                  <div className="skill-pills">{selected.skills.map((skill) => <span key={skill}>{skill}</span>)}</div>
                  <div className="scope-strip"><span>◎</span><div><strong>IN SCOPE</strong><p>gateway · recon-node · services in Docker network</p></div><div><strong>OUT OF SCOPE</strong><p>host OS · public internet · other networks</p></div></div>
                </div>

                <div className="objectives-card">
                  <div className="card-heading"><div><p className="eyebrow">OBJECTIVES</p><h2>ส่ง proof ที่พบจาก target</h2></div><strong>{selectedProgress.completedObjectives.length}/{selected.objectives.length}</strong></div>
                  {selected.objectives.map((objective) => {
                    const done = selectedProgress.completedObjectives.includes(objective.id);
                    return <div className={`objective ${done ? "done" : ""}`} key={objective.id}><span className="objective-check">{done ? "✓" : ""}</span><div><strong>{objective.label}</strong><small>FLAG · {objective.points} PTS</small></div>{!done && <div className="flag-form"><input aria-label={`flag สำหรับ ${objective.label}`} value={flag} onChange={(event) => setFlag(event.target.value)} placeholder="RLAB{...}" onKeyDown={(event) => { if (event.key === "Enter") void submitFlag(objective); }} /><button disabled={busy || !flag.trim()} onClick={() => void submitFlag(objective)}>SUBMIT</button></div>}</div>;
                  })}
                </div>

                <div className="hints-card">
                  <div className="card-heading"><div><p className="eyebrow">ESCALATION LADDER</p><h2>Hints & solution</h2></div><small>Current score: {selectedProgress.score ?? 100}</small></div>
                  {selected.hints.map((hint, index) => {
                    const visible = revealedHints.includes(hint.id) || selectedProgress.hints.includes(hint.id);
                    return <div className="hint-row" key={hint.id}><span>0{index + 1}</span><div><strong>{hint.title}</strong>{visible && <p>{hint.body}</p>}</div><button onClick={() => void unlockHint(hint)} disabled={visible}>{visible ? "UNLOCKED" : `−${hint.penalty} PTS`}</button></div>;
                  })}
                  <div className="solution-row"><div><strong>Full solution</strong><p>{(solutionVisible || selectedProgress.solutionUnlocked) ? selected.solution : "ปลดล็อก walkthrough เต็มเมื่อยอมแพ้หรือต้องการทบทวน"}</p></div><button onClick={() => void unlockSolution()} disabled={solutionVisible || selectedProgress.solutionUnlocked}>{(solutionVisible || selectedProgress.solutionUnlocked) ? "VISIBLE" : "UNLOCK"}</button></div>
                </div>
              </div>

              <aside className="tool-panel">
                <div className="terminal-card">
                  <div className="terminal-head"><span><i /><i /><i /></span><strong>TOOLBOX / BASH</strong><small>{runtime === "running" ? "LIVE" : "IDLE"}</small></div>
                  {runtime === "running" ? <iframe title="Toolbox terminal" src="http://127.0.0.1:7681" sandbox="allow-same-origin allow-scripts allow-forms" /> : <div className="terminal-placeholder"><p><b>student@reconlab</b>:~$ <span>scope --show</span></p><p className="term-output">AUTHORIZED TARGETS</p><p className="term-output">  gateway:8080</p><p className="term-output">  recon-node:9090</p><p className="term-muted"># Start the lab to open an interactive shell.</p><p><b>student@reconlab</b>:~$ <i className="cursor" /></p></div>}
                </div>
                <div className="notes-card"><div className="card-heading"><div><p className="eyebrow">FIELD NOTES</p><h2>Evidence scratchpad</h2></div><button onClick={() => void saveNotes()}>SAVE</button></div><textarea aria-label="Field notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={"# Findings\n- endpoint\n- request / response\n- impact\n- remediation"} /></div>
                <div className="event-card"><span className={connected ? "online" : ""} /><div><strong>{connected ? "LOCAL CONTROLLER" : "PREVIEW MODE"}</strong><p>{message}</p></div></div>
              </aside>
            </div>
          </section>
        )}

        {view === "playbooks" && (
          <section className="view library-view">
            <div className="page-intro"><p className="eyebrow">SKILLS LIBRARY</p><h1>Playbooks ที่เชื่อมกับ lab จริง</h1><p>จาก mental model ไปสู่คำสั่ง หลักฐาน detection และ remediation — ทุกตัวอย่างจำกัดอยู่ใน RECON//LAB เท่านั้น</p></div>
            <div className="playbook-grid">{labs.map((lab) => <article className="playbook-card" key={lab.id}><div><span className={`tag ${difficultyTone(lab.difficulty)}`}>{lab.track}</span><small>{lab.number}</small></div><h2>{lab.title}</h2><p>{lab.description}</p><div className="playbook-sections"><span>ATTACK FLOW</span><span>DETECTION</span><span>FIX</span></div><ul>{lab.skills.map((skill) => <li key={skill}>{skill}</li>)}</ul><div className="playbook-guidance"><p><b>DETECT</b>{playbookGuidance[lab.id].detection}</p><p><b>FIX</b>{playbookGuidance[lab.id].fix}</p></div><button onClick={() => chooseLab(lab.id)}>OPEN LAB <span>→</span></button></article>)}</div>
          </section>
        )}

        {view === "progress" && (
          <section className="view progress-view">
            <div className="page-intro"><p className="eyebrow">OPERATIONS RECORD</p><h1>Progress & evidence</h1><p>คะแนนวัดความสำเร็จของ objectives และลดลงเมื่อใช้ hints หรือเปิด solution</p></div>
            <div className="progress-hero"><div><small>TOTAL SCORE</small><strong>{totalScore.toLocaleString()}</strong><span>PTS</span></div><div className="ring" style={{ "--value": `${(solvedObjectives / objectiveCount) * 360}deg` } as React.CSSProperties}><span>{Math.round((solvedObjectives / objectiveCount) * 100)}%</span></div><div><small>VALIDATED PROOFS</small><strong>{solvedObjectives}</strong><span>OF {objectiveCount}</span></div></div>
            <div className="progress-table"><div className="progress-row head"><span>LAB</span><span>TRACK</span><span>PROOFS</span><span>SCORE</span><span>STATUS</span></div>{labs.map((lab) => { const item = progress[lab.id]; const solved = item?.completedObjectives?.length ?? 0; return <button className="progress-row" key={lab.id} onClick={() => chooseLab(lab.id)}><span><em>{lab.number}</em><strong>{lab.title}</strong></span><span>{lab.track}</span><span>{solved}/{lab.objectives.length}</span><span>{item?.score ?? 100}</span><span className={solved === lab.objectives.length ? "complete" : "open"}>{solved === lab.objectives.length ? "COMPLETE" : "OPEN"}</span></button>; })}</div>
          </section>
        )}
      </section>
    </main>
  );
}

function LabCard({ lab, progress, onOpen }: { lab: Lab; progress?: Progress[string]; onOpen: () => void }) {
  const solved = progress?.completedObjectives?.length ?? 0;
  return <article className="lab-card"><div><span className={`tag ${difficultyTone(lab.difficulty)}`}>{lab.track}</span><small>{lab.number}</small></div><h3>{lab.title}</h3><p>{lab.subtitle}</p><div className="card-meta"><span>◷ {lab.minutes} MIN</span><span>◉ {solved}/{lab.objectives.length} PROOF</span></div><button onClick={onOpen}>OPEN WORKSPACE <span>→</span></button></article>;
}
