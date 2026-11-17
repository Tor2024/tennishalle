// auth-api — регистрация / вход / выход / текущий пользователь (cookie-сессии) + Google OAuth + email-верификация (Brevo)
import { db, json, getUser, createSession, destroySession, hashPassword, verifyPassword, type SessionUser } from "./_lib.js";

export const config = { runtime: "nodejs" };

const PHONE_RE = /^[+]?[\d\s().-]{6,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SITE = "https://tennishalle.vercel.app";
// Sender = email аккаунта Brevo (verified), пока нет своего домена
const SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL ?? "kalchenko2022@gmail.com";

function normalizePhone(raw: string): string {
  return raw.replace(/[^\d+]/g, "");
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
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
    if (body.action === "resend_verification") return await resendVerification(body);
    if (body.action === "update_profile") return await updateProfile(req, body);
    if (body.action === "change_password") return await changePassword(req, body);
    return json({ ok: false, code: "bad_action", message: "Unknown action" }, 400);
  } catch (e) {
    return json({ ok: false, code: "network", message: String((e as Error)?.message ?? e) }, 500);
  }
}

// ---------- email-верификация (Brevo) ----------

async function genTokenHex(): Promise<string> {
  const buf = new Uint8Array(24);
  crypto.getRandomValues(buf);
  return Array.from(buf).map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface BrevoResp { status: number; body: unknown }

async function sendVerificationEmail(to: string, token: string): Promise<BrevoResp> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) throw new Error("BREVO_API_KEY fehlt");
  const link = `${SITE}/api/auth/verify?token=${token}`;
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { name: "TENNISHALLE", email: SENDER_EMAIL },
      to: [{ email: to }],
      subject: "Bestätige deine E-Mail-Adresse — TENNISHALLE",
      htmlContent: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto">
<h1 style="font-size:22px;color:#0b120c">TENNISHALLE</h1>
<p>Willkommen bei TENNISHALLE! Bitte bestätige deine E-Mail-Adresse, um dein Konto zu aktivieren:</p>
<p><a href="${link}" style="display:inline-block;background:#d6f65a;color:#0b120c;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:bold">E-Mail bestätigen</a></p>
<p style="color:#666;font-size:13px">Oder kopiere diesen Link in deinen Browser:<br>${link}</p>
<p style="color:#666;font-size:13px">Der Link gilt für 24 Stunden. Falls du dich nicht registriert hast, ignoriere diese E-Mail.</p>
<p style="color:#666;font-size:13px">Hinweis: Bitte prüfe auch deinen <b>Spam-/Werbeordner</b>, falls die E-Mail nicht ankommt.</p>
</div>`,
    }),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

/** re-send письма подтверждения (например, если не пришло). */
async function resendVerification(body: any): Promise<Response> {
  const email = String(body.email ?? "").trim();
  if (!email || !EMAIL_RE.test(email))
    return json({ ok: false, code: "bad_request", message: "Bitte gib eine gültige E-Mail an." }, 400);
  const p = db();
  const u = await p.query<{ id: string; email: string; email_verified: boolean }>(
    `select id, email, email_verified from app_users where lower(email) = lower($1)`,
    [email],
  );
  if (u.rows.length === 0)
    return json({ ok: true, message: "Wenn ein Konto existiert, wurde eine E-Mail gesendet." });
  if (u.rows[0].email_verified)
    return json({ ok: true, message: "E-Mail ist bereits bestätigt. Du kannst dich anmelden." });
  const token = await genTokenHex();
  const tokenHash = await sha256Hex(token);
  await p.query(
    `insert into email_verification_tokens (token_hash, user_id, expires_at) values ($1, $2, now() + interval '24 hours')`,
    [tokenHash, u.rows[0].id],
  );
  try {
    await sendVerificationEmail(u.rows[0].email, token);
  } catch {
    return json({ ok: false, code: "mail", message: "E-Mail konnte nicht gesendet werden. Bitte später erneut versuchen." }, 500);
  }
  return json({ ok: true, message: "Bestätigungs-E-Mail gesendet. Bitte prüfe dein Postfach — auch den Spam-Ordner." });
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
  const inserted = await p.query<{ id: string; email: string }>(
    `insert into app_users (email, password_hash, full_name, role, phone, email_verified) values ($1, $2, $3, 'member', $4, false)
     returning id, email`,
    [email.trim(), password_hash, full_name?.trim() || null, normalizePhone(phone)],
  );
  const user = inserted.rows[0];

  const token = await genTokenHex();
  const tokenHash = await sha256Hex(token);
  await p.query(
    `insert into email_verification_tokens (token_hash, user_id, expires_at) values ($1, $2, now() + interval '24 hours')`,
    [tokenHash, user.id],
  );
  try {
    await sendVerificationEmail(user.email, token);
  } catch {
    // письмо не ушло — юзер может запросить повтор; но аккаунт уже создан
    return json({ ok: false, code: "mail", message: "Konto erstellt, aber Bestätigungs-E-Mail konnte nicht gesendet werden. Bitte fordere eine neue an." }, 500);
  }
  // до подтверждения сессию НЕ выдаём
  return json({ ok: true, requires_verification: true, message: "Bitte bestätige deine E-Mail-Adresse. Wir haben dir einen Link gesendet. Bitte prüfe auch deinen Spam-Ordner." });
}

async function signin(body: any): Promise<Response> {
  const { email, password } = body;
  if (!email || !password)
    return json({ ok: false, code: "bad_request", message: "E-Mail und Passwort erforderlich." }, 400);

  const p = db();
  const res = await p.query<{ id: string; email: string; full_name: string | null; role: SessionUser["role"]; phone: string | null; password_hash: string; email_verified: boolean }>(
    `select id, email, full_name, role, phone, password_hash, email_verified from app_users where lower(email) = lower($1)`,
    [email.trim()],
  );
  const user = res.rows[0];
  if (!user || !(await verifyPassword(password, user.password_hash)))
    return json({ ok: false, code: "invalid", message: "E-Mail oder Passwort falsch." }, 401);
  if (!user.email_verified)
    return json({ ok: false, code: "unverified", message: "Bitte bestätige zuerst deine E-Mail-Adresse (Link in deinem Postfach)." }, 403);

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

  const pendingHash = await sha256Hex(pendingToken);
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

/** action:'update_profile' — изменение имени и телефона в кабинете. */
async function updateProfile(req: Request, body: any): Promise<Response> {
  const user = await getUser(req);
  if (!user) return json({ ok: false, code: "unauthorized", message: "Nicht angemeldet." }, 401);

  const full_name = String(body.full_name ?? "").trim();
  const phone = String(body.phone ?? "").trim();
  if (full_name.length < 2)
    return json({ ok: false, code: "bad_request", message: "Bitte gib deinen vollständigen Namen an." }, 400);
  if (!phone || !PHONE_RE.test(phone))
    return json({ ok: false, code: "bad_request", message: "Bitte gib eine gültige Telefonnummer an." }, 400);

  const p = db();
  const updated = await p.query<{ id: string; email: string; full_name: string | null; role: SessionUser["role"]; phone: string | null }>(
    `update app_users set full_name = $1, phone = $2 where id = $3 returning id, email, full_name, role, phone`,
    [full_name, normalizePhone(phone), user.id],
  );
  return json({ ok: true, user: updated.rows[0], message: "Profil gespeichert." });
}

/** action:'change_password' — смена пароля (только для обычных аккаунтов). */
async function changePassword(req: Request, body: any): Promise<Response> {
  const user = await getUser(req);
  if (!user) return json({ ok: false, code: "unauthorized", message: "Nicht angemeldet." }, 401);

  const current = String(body.current ?? "");
  const next = String(body.next ?? "");
  if (typeof next !== "string" || next.length < 6)
    return json({ ok: false, code: "bad_request", message: "Neues Passwort muss mindestens 6 Zeichen haben." }, 400);

  const p = db();
  const row = await p.query<{ password_hash: string | null }>(`select password_hash from app_users where id = $1`, [user.id]);
  const hash = row.rows[0]?.password_hash;
  if (!hash)
    return json({ ok: false, code: "no_password", message: "Dein Konto nutzt die Google-Anmeldung — das Passwort kann nicht geändert werden." }, 400);
  if (!(await verifyPassword(current, hash)))
    return json({ ok: false, code: "invalid", message: "Aktuelles Passwort ist falsch." }, 400);

  const newHash = await hashPassword(next);
  await p.query(`update app_users set password_hash = $1 where id = $2`, [newHash, user.id]);
  return json({ ok: true, message: "Passwort geändert." });
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
