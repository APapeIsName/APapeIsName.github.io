import type { Env } from "./env";
import { HttpError, redirect } from "./http";

export interface Session {
  sub: string; // GitHub 숫자 ID
  login: string;
  avatar: string;
  role: "owner" | "guest";
  iat: number;
  exp: number;
}

const SESSION_DAYS = 7;
const enc = new TextEncoder();
const dec = new TextDecoder();

/* ── base64url ─────────────────────────────────── */
export function b64urlEncode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function b64urlDecode(str: string): Uint8Array {
  const s = str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4);
  const bin = atob(s);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  if (!secret || secret.length < 32) throw new HttpError(500, "SESSION_SECRET이 설정되지 않았거나 너무 짧아요 (32자 이상).");
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

/* ── 세션 토큰 (HS256 JWT) ─────────────────────── */
export async function signSession(payload: Omit<Session, "iat" | "exp">, secret: string, now = Date.now()): Promise<string> {
  const iat = Math.floor(now / 1000);
  const body: Session = { ...payload, iat, exp: iat + SESSION_DAYS * 86400 };
  const head = b64urlEncode(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const data = b64urlEncode(enc.encode(JSON.stringify(body)));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(`${head}.${data}`));
  return `${head}.${data}.${b64urlEncode(new Uint8Array(sig))}`;
}

export async function verifySession(token: string, secret: string, now = Date.now()): Promise<Session | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [head, data, sig] = parts;
  let ok = false;
  try {
    ok = await crypto.subtle.verify("HMAC", await hmacKey(secret), b64urlDecode(sig), enc.encode(`${head}.${data}`));
  } catch (e) {
    if (e instanceof HttpError) throw e;
    return null;
  }
  if (!ok) return null;
  try {
    const s = JSON.parse(dec.decode(b64urlDecode(data))) as Session;
    if (typeof s.exp !== "number" || s.exp * 1000 < now) return null;
    return s;
  } catch {
    return null;
  }
}

export async function requireUser(req: Request, env: Env): Promise<Session> {
  const m = (req.headers.get("Authorization") || "").match(/^Bearer\s+(.+)$/);
  if (!m) throw new HttpError(401, "로그인이 필요해요.");
  const s = await verifySession(m[1], env.SESSION_SECRET);
  if (!s) throw new HttpError(401, "로그인이 만료됐어요. 다시 로그인해 주세요.");
  return s;
}

/** 토큰의 역할만 믿지 않고, 지금 설정된 주인 ID와 다시 비교해요. */
export async function requireOwner(req: Request, env: Env): Promise<Session> {
  const s = await requireUser(req, env);
  if (!env.OWNER_GITHUB_ID || s.sub !== String(env.OWNER_GITHUB_ID)) throw new HttpError(403, "블로그 주인만 할 수 있어요.");
  return s;
}

/* ── GitHub OAuth ─────────────────────────────── */
/** 로그인 뒤 돌아갈 곳은 블로그 안의 경로만 허용해요 (다른 사이트로 빼돌리기 방지). */
export function safeReturnPath(p: string | null): string {
  if (!p || !p.startsWith("/") || p.startsWith("//") || p.includes("\\") || /[\r\n]/.test(p)) return "/";
  return p.split("#")[0];
}

function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.get("Cookie") || "";
  for (const part of raw.split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1));
  }
  return null;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function handleLogin(env: Env, url: URL): Response {
  if (!env.GITHUB_CLIENT_ID) throw new HttpError(500, "GITHUB_CLIENT_ID가 설정되지 않았어요.");
  const ret = safeReturnPath(url.searchParams.get("return"));
  const state = b64urlEncode(crypto.getRandomValues(new Uint8Array(16)));
  const cookieVal = `${state}.${b64urlEncode(enc.encode(ret))}`;
  const auth = new URL("https://github.com/login/oauth/authorize");
  auth.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  auth.searchParams.set("redirect_uri", `${url.origin}/auth/callback`);
  auth.searchParams.set("state", state);
  auth.searchParams.set("allow_signup", "false");
  return redirect(auth.toString(), {
    "Set-Cookie": `oauth_state=${encodeURIComponent(cookieVal)}; Path=/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
  });
}

export async function handleCallback(env: Env, req: Request, url: URL): Promise<Response> {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") || "";
  const cookie = readCookie(req, "oauth_state") || "";
  const [savedState, retB64] = cookie.split(".");
  if (!code || !savedState || !timingSafeEqual(state, savedState)) {
    throw new HttpError(400, "로그인 요청을 확인하지 못했어요. 처음부터 다시 시도해 주세요.");
  }
  const ret = safeReturnPath(retB64 ? dec.decode(b64urlDecode(retB64)) : "/");

  const tokRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${url.origin}/auth/callback`,
    }),
  });
  const tok = (await tokRes.json()) as { access_token?: string; error?: string };
  if (!tok.access_token) throw new HttpError(400, `GitHub 로그인에 실패했어요 (${tok.error || "토큰 없음"}).`);

  const userRes = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${tok.access_token}`, Accept: "application/vnd.github+json", "User-Agent": "cs-study-api" },
  });
  if (!userRes.ok) throw new HttpError(502, "GitHub 사용자 정보를 읽지 못했어요.");
  const user = (await userRes.json()) as { id: number; login: string; avatar_url: string };
  // GitHub 토큰은 여기서만 쓰고 저장하지 않아요.

  const role = env.OWNER_GITHUB_ID && String(user.id) === String(env.OWNER_GITHUB_ID) ? "owner" : "guest";
  const session = await signSession({ sub: String(user.id), login: user.login, avatar: user.avatar_url, role }, env.SESSION_SECRET);
  return redirect(`${env.BLOG_ORIGIN}${ret}#token=${session}`, {
    "Set-Cookie": "oauth_state=; Path=/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
    "Cache-Control": "no-store",
  });
}
