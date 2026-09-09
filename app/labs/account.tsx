"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { controllerRequest } from "../controller-client";
import { readCheckpoints } from "./checkpoint-storage";
import "./workspace.css";

export type User = { id: number; username: string; role: "admin" | "learner"; mustChangePassword: boolean; disabled: boolean };
type Session = { user: User | null; csrfToken: string; setupRequired?: boolean };
export function AccountGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [message, setMessage] = useState("Connecting to your local lab…");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState(false);
  const [admin, setAdmin] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const result = await controllerRequest<Session>("/api/session"); setSession(result); setMessage("");
      if (result.user?.role === "admin" && !result.user.mustChangePassword) {
        try { const keys = Object.keys(readCheckpoints(localStorage)); if (keys.length) await controllerRequest("/api/checkpoints/import", { method: "POST", headers: { "X-CSRF-Token": result.csrfToken, "Content-Type": "application/json" }, body: JSON.stringify({ keys }) }); } catch { /* Browser import can retry on the next sign-in. */ }
      }
    } catch (error) { setMessage((error as Error).message); }
  }, []);
  useEffect(() => {
    // This effect hydrates an external session; state changes follow the HTTP response.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    const expired = () => { setSession({ user: null, csrfToken: "" }); setMessage("Your session ended. Sign in to continue."); setAdmin(false); setSettings(false); };
    window.addEventListener("reconlab:session-ended", expired);
    const changed = (event: StorageEvent) => { if (event.key === "reconlab.accountChanged") { setSession(null); void refresh(); } };
    window.addEventListener("storage", changed);
    return () => { window.removeEventListener("reconlab:session-ended", expired); window.removeEventListener("storage", changed); };
  }, [refresh]);
  const announce = () => { try { localStorage.setItem("reconlab.accountChanged", String(Date.now())); } catch { /* Session is authoritative on the server. */ } };
  async function authenticate() {
    setBusy(true); setMessage("");
    try {
      if (session?.user) {
        await controllerRequest("/api/auth/password", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": session.csrfToken }, body: JSON.stringify({ currentPassword: password, newPassword }) });
        setSession({ user: null, csrfToken: "" }); setSettings(false); setNewPassword(""); setMessage("Password changed. Sign in with your new password.");
      } else {
        const result = await controllerRequest<Session>("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
        setSession(result); await refresh();
      }
      setPassword(""); announce();
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  async function logout() {
    try { await controllerRequest("/api/auth/logout", { method: "POST", headers: { "X-CSRF-Token": session!.csrfToken } }); setSession({ user: null, csrfToken: "" }); setAdmin(false); setSettings(false); announce(); }
    catch (error) { setMessage((error as Error).message); }
  }
  if (!session || !session.user || session.user.mustChangePassword || settings) return <main className="standalone-workspace account-page">
    <p className="eyebrow green">RECON//LAB</p><h1>{session?.user ? "Choose your password" : "Sign in to your lab"}</h1>
    {session?.setupRequired ? <><p>Create the first administrator in your project terminal:</p><pre>npm.cmd run admin:create -- admin</pre><p>Existing lab progress will be imported into this account. On macOS/Linux use npm.</p><button onClick={() => void refresh()}>Check setup</button></> : session && <form onSubmit={(event) => { event.preventDefault(); void authenticate(); }}>
      {!session.user && <label>Username<input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required /></label>}
      <label>{session.user ? "Current or temporary password" : "Password"}<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={256} required /></label>
      {session.user && <label>New password · at least 12 characters<input type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={12} maxLength={256} required /></label>}
      <button disabled={busy}>{session.user ? "Save password" : "Sign in"}</button>
      {settings && <button type="button" onClick={() => setSettings(false)}>Cancel</button>}
    </form>}
    <p role="status">{message}</p>{!session && <button onClick={() => void refresh()}>Reconnect</button>}
  </main>;
  return <><div className="account-bar"><span>{session.user.username}</span><button onClick={() => setSettings(true)}>Password</button>{session.user.role === "admin" && <button onClick={() => setAdmin(!admin)}>{admin ? "Return to labs" : "Administration"}</button>}<button onClick={() => void logout()}>Sign out</button><span role="status">{message}</span></div>{admin ? <Admin csrf={session.csrfToken} /> : <div key={session.user.id}>{children}</div>}</>;
}

function Admin({ csrf }: { csrf: string }) {
  const [users, setUsers] = useState<User[]>([]);
  const [runtime, setRuntime] = useState<{ capacity: number; active: { instanceId: string; username: string; labId: string; runtime: string; expiresAt: number | null }[] }>({ capacity: 0, active: [] });
  const [username, setUsername] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    try { const [accounts, instances] = await Promise.all([controllerRequest<User[]>("/api/admin/users"), controllerRequest<typeof runtime>("/api/admin/instances")]); setUsers(accounts); setRuntime(instances); }
    catch (error) { setMessage((error as Error).message); }
  }, []);
  // Hydrate the admin view from external server state, then poll it.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void refresh(); const timer = setInterval(() => void refresh(), 5000); return () => clearInterval(timer); }, [refresh]);
  async function mutate(path: string, body = {}) {
    setBusy(true); setMessage("");
    try { const result = await controllerRequest<{ temporaryPassword?: string }>(path, { method: "POST", headers: { "X-CSRF-Token": csrf, "Content-Type": "application/json" }, body: JSON.stringify(body) }); setMessage(result.temporaryPassword ? `One-time password: ${result.temporaryPassword} — copy it now and give it to the learner.` : "Saved."); await refresh(); }
    catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  return <main className="standalone-workspace"><h1>Lab administration</h1><p role="status">{message}</p><section className="workspace-section"><h2>Accounts</h2><form className="workspace-actions" onSubmit={(e) => { e.preventDefault(); void mutate("/api/admin/users", { username }); }}><label>New learner username <input value={username} onChange={(e) => setUsername(e.target.value)} pattern="[a-zA-Z0-9][a-zA-Z0-9_-]{2,31}" required /></label><button disabled={busy}>Create learner</button></form>
    {users.map((user) => <div className="admin-row" key={user.id}><span>{user.username} · {user.role} · {user.disabled ? "disabled" : user.mustChangePassword ? "password change needed" : "active"}</span>{user.role === "learner" && <><button disabled={busy} onClick={() => void mutate(`/api/admin/users/${user.id}/${user.disabled ? "enable" : "disable"}`)}>{user.disabled ? "Enable" : "Disable"}</button><button disabled={busy} onClick={() => { if (confirm(`Reset ${user.username}'s password and sign them out?`)) void mutate(`/api/admin/users/${user.id}/reset-password`); }}>Reset password</button></>}</div>)}
    </section><section className="workspace-section"><h2>Active instances · {runtime.active.length}/{runtime.capacity}</h2>{!runtime.active.length && <p>No instances running.</p>}{runtime.active.map((run) => <div className="admin-row" key={run.instanceId}><span>{run.username} · {run.labId} · {run.runtime}{run.expiresAt ? ` · expires ${new Date(run.expiresAt).toLocaleTimeString()}` : ""}</span><button disabled={busy} onClick={() => void mutate(`/api/admin/instances/${run.instanceId}/stop`)}>Stop instance</button></div>)}</section></main>;
}
