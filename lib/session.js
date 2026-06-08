// Phiên đăng nhập ký HMAC-SHA256 (Web Crypto) — chạy được cả Node và Edge (middleware).
// Token = base64url(payload).base64url(chữ ký). payload = { u: username, exp: ms }.
// KHÔNG import node:crypto / fs ở đây để middleware (Edge runtime) dùng được.
const enc = new TextEncoder();

function b64url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(str) {
  const bin = atob(str.replace(/-/g, "+").replace(/_/g, "/"));
  const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return a;
}

async function hmacKey() {
  const secret = process.env.AUTH_SECRET || "dev-insecure-secret-please-set-AUTH_SECRET";
  return globalThis.crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

// payload: { username, name, role, menus }
export async function signSession(payload, days = 7) {
  const body = { ...payload, exp: Date.now() + days * 86400000 };
  const data = b64url(enc.encode(JSON.stringify(body)));
  const sig = await globalThis.crypto.subtle.sign("HMAC", await hmacKey(), enc.encode(data));
  return data + "." + b64url(new Uint8Array(sig));
}

// Trả về { username, name, role, menus } nếu token hợp lệ & chưa hết hạn, ngược lại null.
export async function verifySession(token) {
  if (!token || !token.includes(".")) return null;
  const [data, sig] = token.split(".");
  try {
    const ok = await globalThis.crypto.subtle.verify("HMAC", await hmacKey(), b64urlDecode(sig), enc.encode(data));
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(data)));
    if (!payload.exp || payload.exp < Date.now()) return null;
    if (!payload.username) return null;
    return { username: payload.username, name: payload.name, role: payload.role || "user", menus: payload.menus || [] };
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = "kb_session";
