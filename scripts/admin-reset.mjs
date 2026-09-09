import { openAccounts } from "../controller/accounts.mjs";

const accounts = openAccounts(".lab/accounts.sqlite");
try {
  const admin = accounts.db.prepare("SELECT id, username FROM users WHERE role='admin' ORDER BY id LIMIT 1").get();
  if (!admin) throw new Error("No administrator account exists.");
  const result = accounts.resetPassword(admin.id);
  console.log(`Administrator: ${admin.username}`);
  console.log(`One-time password: ${result.temporaryPassword}`);
  console.log("Sign in and change it immediately.");
} finally {
  accounts.db.close();
}
