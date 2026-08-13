import { createHmac, timingSafeEqual } from "node:crypto";

export function createFlag(secret, labId, objectiveId, runId) {
  const digest = createHmac("sha256", secret)
    .update(`${labId}:${objectiveId}:${runId}`)
    .digest("hex")
    .slice(0, 24);
  return `RLAB{${digest}}`;
}

export function equalSecret(actual, expected) {
  const left = Buffer.from(String(actual));
  const right = Buffer.from(String(expected));
  return left.length === right.length && timingSafeEqual(left, right);
}

export function isLoopbackAddress(address = "") {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

export function isAllowedHost(host = "", port = "3030") {
  return host === `127.0.0.1:${port}` || host === `localhost:${port}`;
}

export function isAllowedOrigin(origin = "", allowedOrigins = []) {
  return allowedOrigins.includes(origin);
}

export function parseCookies(header = "") {
  return Object.fromEntries(
    header.split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
      const separator = part.indexOf("=");
      if (separator < 0) return [part, ""];
      return [part.slice(0, separator), decodeURIComponent(part.slice(separator + 1))];
    }),
  );
}
