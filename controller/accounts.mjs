import { randomBytes, scryptSync, createHash, timingSafeEqual } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export const token = () => randomBytes(32).toString("hex");
export const digest = (value) => createHash("sha256").update(value).digest("hex");
export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export function passwordHash(password, salt = token()) {
  if (typeof password !== "string" || password.length < 12 || password.length > 256) throw new ApiError(422, "Use a password between 12 and 256 characters.");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function passwordMatches(password, hash) {
  if (typeof password !== "string" || password.length > 256) return false;
  const [salt, expected] = hash.split(":");
  return timingSafeEqual(scryptSync(password, salt, 64), Buffer.from(expected, "hex"));
}

export function openAccounts(path) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','learner')),
      disabled INTEGER NOT NULL DEFAULT 0, must_change INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS account_sessions (
      hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
      csrf TEXT NOT NULL, expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_account_sessions_user ON account_sessions(user_id);
    CREATE TABLE IF NOT EXISTS login_attempts (name TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS instance_runs (
      id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), lab_id TEXT NOT NULL,
      runtime TEXT NOT NULL DEFAULT 'stopped', subnet TEXT NOT NULL UNIQUE,
      expires_at INTEGER, extended INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0,
      flags TEXT NOT NULL, completed TEXT NOT NULL DEFAULT '{}', checks TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL, error TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_current_run ON instance_runs(user_id,lab_id) WHERE archived=0;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_user_active_run ON instance_runs(user_id)
      WHERE runtime IN ('starting','building','running','stopping','resetting');
    CREATE TABLE IF NOT EXISTS account_events (
      id INTEGER PRIMARY KEY, user_id INTEGER, run_id TEXT, action TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS evidence_reports (
      run_id TEXT NOT NULL REFERENCES instance_runs(id), objective_id TEXT NOT NULL,
      responses TEXT NOT NULL, revision INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      PRIMARY KEY(run_id, objective_id)
    );
    CREATE TABLE IF NOT EXISTS account_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);
  const publicUser = (user) => user && ({ id: user.id, username: user.username, role: user.role, mustChangePassword: Boolean(user.must_change), disabled: Boolean(user.disabled) });
  const event = (user, action, run = null) => db.prepare("INSERT INTO account_events(user_id,run_id,action,created_at) VALUES(?,?,?,?)").run(user, run, action, Date.now());
  function createUser(username, role = "learner") {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,31}$/.test(username ?? "")) throw new ApiError(422, "Username must contain 3–32 letters, numbers, underscores or hyphens.");
    if (!["admin", "learner"].includes(role)) throw new ApiError(422, "Unknown role.");
    if (db.prepare("SELECT id FROM users WHERE username=?").get(username)) throw new ApiError(409, "Username is already in use.");
    const password = randomBytes(18).toString("base64url");
    const result = db.prepare("INSERT INTO users(username,password_hash,role,created_at) VALUES(?,?,?,?)").run(username, passwordHash(password), role, Date.now());
    event(Number(result.lastInsertRowid), "account_created");
    return { user: publicUser(db.prepare("SELECT * FROM users WHERE id=?").get(result.lastInsertRowid)), temporaryPassword: password };
  }
  const dummyHash = passwordHash(token());
  function login(username, password) {
    const name = String(username ?? "").toLowerCase().slice(0, 64);
    const now = Date.now();
    // A global bound also prevents rotating usernames to exhaust the local process.
    for (const key of ["*", name]) {
      const attempt = db.prepare("SELECT * FROM login_attempts WHERE name=?").get(key);
      if (attempt && attempt.reset_at > now && attempt.count >= (key === "*" ? 40 : 5)) throw new ApiError(429, "Too many login attempts. Try again in 15 minutes.");
    }
    const user = db.prepare("SELECT * FROM users WHERE username=?").get(name);
    const valid = passwordMatches(password, user?.password_hash ?? dummyHash);
    if (!valid || !user || user.disabled) {
      db.prepare("DELETE FROM login_attempts WHERE reset_at<=?").run(now);
      for (const key of ["*", name]) db.prepare("INSERT INTO login_attempts VALUES(?,1,?) ON CONFLICT(name) DO UPDATE SET count=count+1").run(key, now + 900000);
      throw new ApiError(401, "Username or password is incorrect.");
    }
    db.prepare("DELETE FROM login_attempts WHERE name=?").run(name);
    const sessionToken = token();
    const csrf = token();
    db.prepare("DELETE FROM account_sessions WHERE expires_at<=?").run(now);
    db.prepare("INSERT INTO account_sessions VALUES(?,?,?,?)").run(digest(sessionToken), user.id, csrf, now + 28800000);
    event(user.id, "login");
    return { user: publicUser(user), csrfToken: csrf, sessionToken };
  }
  function session(sessionToken) {
    if (!sessionToken) return null;
    const row = db.prepare(`SELECT s.hash,s.csrf,s.expires_at,u.* FROM account_sessions s JOIN users u ON u.id=s.user_id
      WHERE s.hash=? AND s.expires_at>? AND u.disabled=0`).get(digest(sessionToken), Date.now());
    return row ? { user: publicUser(row), csrfToken: row.csrf, hash: row.hash } : null;
  }
  function changePassword(id, oldPassword, newPassword) {
    const user = db.prepare("SELECT * FROM users WHERE id=?").get(id);
    if (!user || !passwordMatches(oldPassword, user.password_hash)) throw new ApiError(422, "Current password is incorrect.");
    if (oldPassword === newPassword) throw new ApiError(422, "Choose a different password.");
    db.prepare("UPDATE users SET password_hash=?,must_change=0 WHERE id=?").run(passwordHash(newPassword), id);
    db.prepare("DELETE FROM account_sessions WHERE user_id=?").run(id);
    event(id, "password_changed");
  }
  function resetPassword(id) {
    const password = randomBytes(18).toString("base64url");
    if (!db.prepare("UPDATE users SET password_hash=?,must_change=1 WHERE id=?").run(passwordHash(password), id).changes) throw new ApiError(404, "Account not found.");
    db.prepare("DELETE FROM account_sessions WHERE user_id=?").run(id);
    event(id, "password_reset");
    return { temporaryPassword: password };
  }
  return { db, event, createUser, login, session, changePassword, resetPassword, publicUser };
}
