// auth-api — регистрация / вход / выход / текущий пользователь (cookie-сессии) + Google OAuth
import { db, json, getUser, createSession, destroySession, hashPassword, verifyPassword, type SessionUser } from "./_lib.js";

export const config = { runtime: "nodejs" };

const PHONE_RE = /^[+]?[\d\s().-]{6,20}$/;

function normalizePhone(raw: string): string {
  return raw.replace(/[^\d+]/g, "");
}

export async function POST(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }
  try {
    const body = await req.json();

    if (body.action === "signup") return await signup(body);
    if (body.action === "signin") return await signin(body);
    if (body.action === "signout") return await signout(req);
    if (body.action === "me") return await me(req);
    if (body.action === "google_url") return await googleUrl(body);
    if (body.action === "google_complete") return await googleComplete(body);
    return json({ ok: false, code: "bad_action", message: "Unknown action" }, 400);
  } catch (e) {
    return json({ ok: false, code: "network", message: String((e as Error)?.message ?? e) }, 500);
  }
}

// ---------- обычная регистрация / вход ----------

async function signup(body: any): Promise<Response> {
  const { email, password, full_name, phone } = body;
  if (!email || !password || typeof password !== "string" || password.length < 6)
    return json({ ok: false, code: "bad_request", message: "E-Mail und Passwort (min. 6 Zeichen) erforderlich." }, 400);
  if (!phone || typeof phone !== "string" || !PHONE_RE.test(phone.trim()))
    return json({ ok: false, code: "bad_request", message: "Bitte gib eine gültige Telefonnummer an." }, 400);

  const p = db();
  const exists = await p.query(`select id from app_users where lower(email) = lower($1)`, [email]);
  if (exists.rows.length > 0)
    return json({ ok: false, code: "exists", message: "Ein Konto mit dieser E-Mail existiert bereits." }, 409);

  const password_hash = await hashPassword(password);
  const inserted = await p.query<{ id: string; email: string; full_name: string | null; role: SessionUser["role"]; phone: string | null }>(
    `insert into app_users (email, password_hash, full_name, role, phone) values ($1, $2, $3, 'member', $4)
     returning id, email, full_name, role, phone`,
    [email.trim(), password_hash, full_name?.trim() || null, normalizePhone(phone)],
  );
  const user = inserted.rows[0];
  const { setCookie } = await createSession(user.id);
  return json({ ok: true, user }, 200, { "Set-Cookie": setCookie });
}

async function signin(body: any): Promise<Response> {
  const { email, password } = body;
  if (!email || !password)
    return json({ ok: false, code: "bad_request", message: "E-Mail und Passwort erforderlich." }, 400);

  const p = db();
  const res = await p.query<{ id: string; email: string; full_name: string | null; role: SessionUser["role"]; phone: string | null; password_hash: string }>(
    `select id, email, full_name, role, phone, password_hash from app_users where lower(email) = lower($1)`,
    [email.trim()],
  );
  const user = res.rows[0];
  if (!user || !(await verifyPassword(password, user.password_hash)))
    return json({ ok: false, code: "invalid", message: "E-Mail oder Passwort falsch." }, 401);

  const { setCookie } = await createSession(user.id);
  const { password_hash: _ph, ...safe } = user;
  return json({ ok: true, user: safe }, 200, { "Set-Cookie": setCookie });
}

/**
 * action:'google_complete' — завершение Google-входа для пользователя без телефона:
 * проверяет pending-токен, сохраняет телефон и ставит cookie-сессию.
 */
async function googleComplete(body: any): Promise<Response> {
  const pendingToken = String(body.pending ?? "");
  const phone = String(body.phone ?? "");
  if (!pendingToken || !phone || !PHONE_RE.test(phone.trim()))
    return json({ ok: false, code: "bad_request", message: "Bitte gib eine gültige Telefonnummer an." }, 400);

  const pendingHash = await sha256HexPending(pendingToken);
  const p = db();
  const pend = await p.query<{ user_id: string; expires_at: string }>(
    `select user_id, expires_at from google_pending_users where token_hash = $1 and expires_at > now()`,
    [pendingHash],
  );
  if (pend.rows.length === 0)
    return json({ ok: false, code: "expired", message: "Anmeldung abgelaufen. Bitte erneut mit Google anmelden." }, 401);

  const userId = pend.rows[0].user_id;
  await p.query(`update app_users set phone = $1 where id = $2`, [normalizePhone(phone), userId]);
  await p.query(`delete from google_pending_users where token_hash = $1`, [pendingHash]);

  const { setCookie } = await createSession(userId);
  return json({ ok: true }, 200, { "Set-Cookie": setCookie });
}

async function signout(req: Request): Promise<Response> {
  const setCookie = await destroySession(req);
  return json({ ok: true }, 200, { "Set-Cookie": setCookie });
}

async function me(req: Request): Promise<Response> {
  const user = await getUser(req);
  if (!user) return json({ ok: false, code: "unauthorized", message: "Nicht angemeldet." }, 401);
  return json({ ok: true, user });
}

// ---------- Google OAuth ----------

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

/** action:'google_url' → возвращает ссылку на согласие Google. */
async function googleUrl(body: any): Promise<Response> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return json({ ok: false, code: "config", message: "Google-Login ist nicht konfiguriert." }, 500);
  const redirectTo = typeof body.redirect === "string" && body.redirect.startsWith("/") ? body.redirect : "/account";
  const state = Buffer.from(JSON.stringify({ r: redirectTo, n: Math.random().toString(36).slice(2) }), "utf8").toString("base64url");
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", "https://tennishalle.vercel.app/api/auth/google/callback");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");
  return json({ ok: true, url: url.toString() });
}
