import crypto from "node:crypto";

// Sign a short payload with APP_SECRET for use as OAuth `state`.
// Format: base64url(payload).hex(hmac)

function secret(): string {
  const s = process.env.APP_SECRET;
  if (!s || s.length < 16) throw new Error("APP_SECRET missing or too short (need 16+ chars)");
  return s;
}

export function signState(payload: Record<string, string>): string {
  const json = JSON.stringify({ ...payload, n: crypto.randomBytes(8).toString("hex") });
  const b64 = Buffer.from(json).toString("base64url");
  const mac = crypto.createHmac("sha256", secret()).update(b64).digest("hex");
  return `${b64}.${mac}`;
}

export function verifyState(state: string): Record<string, string> | null {
  const [b64, mac] = state.split(".");
  if (!b64 || !mac) return null;
  const expected = crypto.createHmac("sha256", secret()).update(b64).digest("hex");
  const a = Buffer.from(mac, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(b64, "base64url").toString());
  } catch {
    return null;
  }
}
