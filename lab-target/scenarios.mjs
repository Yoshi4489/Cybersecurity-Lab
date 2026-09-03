export function hasTrainingSession(cookieHeader = "") {
  return String(cookieHeader).split(";").map((part) => part.trim()).includes("northstar_session=student-session");
}

function decodeSegment(segment) {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
}

export function decodeJwtUnsafe(token) {
  const [header, payload] = String(token).split(".");
  if (!header || !payload) throw new Error("malformed JWT");
  return { header: decodeSegment(header), payload: decodeSegment(payload) };
}

export function acceptsUnsafeUpload(filename, contentType) {
  return String(filename).includes(".jpg")
    && !String(filename).endsWith(".jpg")
    && String(contentType).split(";", 1)[0].trim().toLowerCase() === "image/jpeg";
}
