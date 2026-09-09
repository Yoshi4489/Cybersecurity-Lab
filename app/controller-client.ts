// Match the portal hostname so SameSite=Strict cookies work on localhost too.
export function localControllerUrl() {
  const configured = process.env.NEXT_PUBLIC_LAB_CONTROLLER_URL;
  if (configured) return configured.replace(/\/$/, "");
  const host = typeof window !== "undefined" && window.location.hostname === "localhost" ? "localhost" : "127.0.0.1";
  return `http://${host}:3030`;
}

export async function controllerRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${localControllerUrl()}${path}`, { credentials: "include", ...options });
  } catch {
    throw new Error("Cannot reach the local controller. In a terminal in the project folder, run npm run lab (npm.cmd run lab on PowerShell), then click Reconnect. The portal is on port 5173; the API is on 3030.");
  }
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error(`The controller URL returned a web page (HTTP ${response.status}). Check that NEXT_PUBLIC_LAB_CONTROLLER_URL points to the API on port 3030, not the portal on 5173.`);
  }
  const result = await response.json();
  if (response.status === 401 && typeof window !== "undefined" && path !== "/api/auth/login") window.dispatchEvent(new Event("reconlab:session-ended"));
  if (!response.ok) throw new Error(response.status === 404
    ? "Controller route not found. Restart the local controller to load the updated lab API (npm run lab:stop, then npm run lab)."
    : result.error ?? `Controller request failed (${response.status}).`);
  return result as T;
}
