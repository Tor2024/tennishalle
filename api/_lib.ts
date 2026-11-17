// Общие хелперы для Vercel Functions: pg-пул, Berlin-время, cookie-сессии.
import { Pool } from "pg";

let pool: Pool | null = null;
export function db(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: `${process.env.DATABASE_URL}${(process.env.DATABASE_URL ?? '').includes('?') ? '&' : '?'}uselibpqcompat=true`,
      ssl: { rejectUnauthorized: false },
      max: 3,
    });
  }
  return pool;
}

export const TZ = "Europe/Berlin";
export const pad2 = (n: number) => String(n).padStart(2, "0");
export const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
export const toHHMM = (min: number) => `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`;

export function berlinToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}
export function berlinWeekday(dateKey: string): number {
  return new Date(`${dateKey}T12:00:00Z`).getUTCDay();
}
export function getBerlinOffsetMin(d: Date): number {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });
  const [hh, mm] = f.format(d).split(":").map(Number);
  const asUtc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hh, mm);
  return Math.round((asUtc - d.getTime()) / 60000);
}
export function berlinToUtc(dateKey: string, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const noon = new Date(`${dateKey}T12:00:00Z`);
  const off = getBerlinOffsetMin(noon);
  return new Date(new Date(`${dateKey}T${pad2(h)}:${pad2(m)}:00Z`).getTime() - off * 60000);
}
export function genRef(): string {
  const A = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  const b = new Uint8Array(6);
  crypto.getRandomValues(b);
  let s = "";
  for (let i = 0; i < 6; i++) s += A[b[i] % A.length];
  return s;
}

export function json(obj: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "content-type",
      ...headers,
    },
  });
}

// ---------- cookie-сессии (замена Supabase auth) ----------

export interface SessionUser {
  id: string;
  email: string;
  full_name: string | null;
  role: "member" | "owner" | "admin";
  phone?: string | null;
  has_password?: boolean;
}

const SESSION_COOKIE = "th_session";
const SESSION_TTL_MS = 30 * 24 * 3600000; // 30 дней

function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  return crypto.subtle.digest("SHA-256", data).then((buf) => {
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  });
}

function parseCookies(req: Request): Record<string, string> {
  const raw = req.headers.get("cookie") ?? "";
  const out: Record<string, string> = {};
  for (const part of raw.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

/** Возвращает пользователя по cookie-сессии или null. */
export async function getUser(req: Request): Promise<SessionUser | null> {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const { rows } = await db().query<{
    id: string;
    email: string;
    full_name: string | null;
    role: SessionUser["role"];
  }>(
    `select u.id, u.email, u.full_name, u.role, u.phone, (u.password_hash is not null) as has_password
       from app_sessions s join app_users u on u.id = s.user_id
      where s.token_hash = $1 and s.expires_at > now()`,
    [tokenHash],
  );
  return rows[0] ?? null;
}

/** Создаёт сессию и возвращает Set-Cookie значение. */
export async function createSession(userId: string): Promise<{ token: string; setCookie: string }> {
  const token = `${genRef()}${genRef()}${genRef()}${genRef()}`; // 24 символа
  const tokenHash = await sha256Hex(token);
  const expires = new Date(Date.now() + SESSION_TTL_MS);
  await db().query(
    `insert into app_sessions (token_hash, user_id, expires_at) values ($1, $2, $3)`,
    [tokenHash, userId, expires.toISOString()],
  );
  const setCookie = `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}`;
  return { token, setCookie };
}

/** Удаляет сессию и возвращает Set-Cookie для очистки. */
export async function destroySession(req: Request): Promise<string> {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (token) {
    const tokenHash = await sha256Hex(token);
    await db().query(`delete from app_sessions where token_hash = $1`, [tokenHash]);
  }
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

/** Пароль: scrypt-подобный хеш через pgcrypto crypt (bf). */
export async function hashPassword(plain: string): Promise<string> {
  // генерируем соль на стороне pg
  const { rows } = await db().query<{ hash: string }>(
    `select crypt($1, gen_salt('bf', 10)) as hash`,
    [plain],
  );
  return rows[0].hash;
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  const { rows } = await db().query<{ ok: boolean }>(
    `select crypt($1, $2) = $2 as ok`,
    [plain, hash],
  );
  return rows[0]?.ok === true;
}

// ---------- Brevo transactional emails (confirmation / reminder) ----------

const SITE_URL = "https://tennishalle.vercel.app";
const MAIL_SENDER = { name: "TENNISHALLE", email: process.env.BREVO_SENDER_EMAIL ?? "kalchenko2022@gmail.com" };

/** Отправляет письмо через Brevo. Возвращает true если принято (2xx). Fail — не бросаем. */
export async function sendBrevoEmail(to: string, subject: string, html: string): Promise<boolean> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return false;
  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ sender: MAIL_SENDER, to: [{ email: to }], subject, htmlContent: html }),
    });
    return res.status >= 200 && res.status < 300;
  } catch {
    return false;
  }
}

const MAIL_WRAP = (title: string, bodyHtml: string, buttonLabel: string) => `
<div style="font-family:Georgia,'Times New Roman',serif;background:#f4f6f2;padding:32px 16px">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e6de">
    <div style="background:#0b120c;padding:28px 36px">
      <span style="font-family:Arial,Helvetica,sans-serif;font-size:20px;letter-spacing:0.32em;color:#ffffff;font-weight:bold">TENNIS<span style="color:#d6f65a">HALLE</span></span>
    </div>
    <div style="padding:36px">
      <h1 style="font-size:26px;color:#0b120c;margin:0 0 4px;font-weight:normal">${title}</h1>
      ${bodyHtml}
      <p style="margin:28px 0 0">
        <a href="${SITE_URL}/account" style="display:inline-block;background:#d6f65a;color:#0b120c;padding:13px 26px;border-radius:999px;text-decoration:none;font-weight:bold;font-family:Arial,Helvetica,sans-serif;font-size:14px">${buttonLabel}</a>
      </p>
      <p style="color:#8a9188;font-size:13px;line-height:1.6;margin:26px 0 0;font-family:Arial,Helvetica,sans-serif">
        Diese E-Mail wurde automatisch nach deiner Online-Buchung erstellt. Falls du sie nicht erwartet hast, ignoriere sie einfach — oder prüfe deine Buchungen unter <a href="${SITE_URL}/account" style="color:#5a7d1f">tennishalle.vercel.app/account</a>.
      </p>
    </div>
    <div style="background:#f4f6f2;padding:18px 36px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#8a9188">
      TENNISHALLE · Dein Verein für Indoor- &amp; Outdoor-Tennis
    </div>
  </div>
</div>`;

const MAIL_ROW = (label: string, value: string) => `
<tr>
  <td style="padding:8px 0;color:#8a9188;font-family:Arial,Helvetica,sans-serif;font-size:13px;white-space:nowrap;padding-right:18px">${label}</td>
  <td style="padding:8px 0;color:#0b120c;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold">${value}</td>
</tr>`;

/** Подтверждение бронирования — премиально, вежливо, в стиле сайта. */
export async function sendBookingConfirmationEmail(opts: {
  to: string; name: string; reference: string; courtName: string; venueName: string;
  startAt: string; endAt: string; durationMinutes: number; feeCents: number;
}): Promise<boolean> {
  const dt = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "long", year: "numeric", timeZone: TZ }).format(new Date(opts.startAt));
  const tm = (iso: string) => new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(new Date(iso));
  const price = (opts.feeCents / 100).toFixed(2).replace(".", ",");
  const greeting = opts.name ? `Guten Tag ${opts.name},` : "Guten Tag,";
  const html = MAIL_WRAP(
    "Deine Buchung ist bestätigt.",
    `<p style="color:#4a524a;font-size:15px;line-height:1.7;margin:14px 0 22px">${greeting} wir freuen uns, dass du bei uns spielst. Deine Reservierung haben wir wie folgt eingetragen:</p>
     <table style="margin:0 0 8px;border-top:1px solid #e2e6de;width:100%">${MAIL_ROW("Platz", opts.courtName)}${MAIL_ROW("Anlage", opts.venueName)}${MAIL_ROW("Datum", dt)}${MAIL_ROW("Zeit", `${tm(opts.startAt)} – ${tm(opts.endAt)} Uhr`)}${MAIL_ROW("Dauer", `${opts.durationMinutes} Minuten`)}${MAIL_ROW("Platzgebühr", `${price} € — Zahlung direkt im Verein`)}</table>
     <p style="margin:18px 0 0"><span style="display:inline-block;background:#f0f4e8;border:1px dashed #b9cc7a;border-radius:8px;padding:10px 16px;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#0b120c">Buchungsreferenz: <b>${opts.reference}</b></span></p>
     <p style="color:#4a524a;font-size:14px;line-height:1.7;margin:22px 0 0">Wir freuen uns auf dich! Bitte komm einige Minuten vor Spielbeginn — Umkleiden und Duschen findest du im Nebenflügel der Halle.</p>`,
    "Buchung ansehen",
  );
  return sendBrevoEmail(opts.to, `Deine Buchung ist bestätigt — TENNISHALLE`, html);
}

/** Подтверждение регистрации на турнир участнику. */
export async function sendTournamentRegistrationEmail(opts: {
  to: string; name: string; title: string; startsAt: string; feeCents: number;
  partnerName: string | null; deadline: string | null;
}): Promise<boolean> {
  const dt = new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: TZ }).format(new Date(opts.startsAt));
  const tm = (iso: string) => new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(new Date(iso));
  const fee = opts.feeCents > 0 ? `${(opts.feeCents / 100).toFixed(2).replace(".", ",")} € — Zahlung vor Ort im Verein` : "keine Startgebühr";
  const greeting = opts.name ? `Hallo ${opts.name},` : "Hallo,";
  const html = MAIL_WRAP(
    "Turnier-Anmeldung bestätigt.",
    `<p style="color:#4a524a;font-size:15px;line-height:1.7;margin:14px 0 22px">${greeting} wir haben deine Meldung eingetragen:</p>
     <table style="margin:0 0 8px;border-top:1px solid #e2e6de;width:100%">${MAIL_ROW("Turnier", opts.title)}${MAIL_ROW("Termin", `${dt}, ${tm(opts.startsAt)} Uhr`)}${MAIL_ROW("Startgebühr", fee)}${opts.partnerName ? MAIL_ROW("Partner", opts.partnerName) : ""}${opts.deadline ? MAIL_ROW("Abmeldung möglich bis", new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "long", timeZone: TZ }).format(new Date(opts.deadline))) : ""}</table>
     <p style="color:#4a524a;font-size:14px;line-height:1.7;margin:22px 0 0">Wir freuen uns auf dich! Abmelden kannst du dich bis zur Anmeldefrist direkt unter „Mein Konto → Meine Turniere“.</p>`,
    "Meine Turniere",
  );
  return sendBrevoEmail(opts.to, `Turnier-Anmeldung bestätigt — TENNISHALLE`, html);
}

/** Подтверждение отмены регистрации участнику. */
export async function sendTournamentCancelEmail(opts: {
  to: string; name: string; title: string; startsAt: string;
}): Promise<boolean> {
  const dt = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "long", year: "numeric", timeZone: TZ }).format(new Date(opts.startsAt));
  const greeting = opts.name ? `Hallo ${opts.name},` : "Hallo,";
  const html = MAIL_WRAP(
    "Abmeldung bestätigt.",
    `<p style="color:#4a524a;font-size:15px;line-height:1.7;margin:14px 0 22px">${greeting} deine Abmeldung vom <b>${opts.title}</b> (${dt}) haben wir zurückgenommen. Falls du doch teilnehmen möchtest, melde dich einfach wieder an — sofern Plätze frei sind.</p>`,
    "Turniere ansehen",
  );
  return sendBrevoEmail(opts.to, `Turnier-Abmeldung bestätigt — TENNISHALLE`, html);
}

/** Erinnerung ~за день до игры (cron раз в день на Hobby: окно 20-44ч). */
export async function sendBookingReminderEmail(opts: {
  to: string; name: string; reference: string; courtName: string; venueName: string; startAt: string; endAt: string;
}): Promise<boolean> {
  const dt = new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "numeric", month: "long", timeZone: TZ }).format(new Date(opts.startAt));
  const tm = (iso: string) => new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(new Date(iso));
  const greeting = opts.name ? `Guten Tag ${opts.name},` : "Guten Tag,";
  const html = MAIL_WRAP(
    "Dein Tennis-Termin steht an.",
    `<p style="color:#4a524a;font-size:15px;line-height:1.7;margin:14px 0 22px">${greeting} wir halten den Platz für dich bereit:</p>
     <table style="margin:0 0 8px;border-top:1px solid #e2e6de;width:100%">${MAIL_ROW("Platz", opts.courtName)}${MAIL_ROW("Anlage", opts.venueName)}${MAIL_ROW("Wann", `${dt}, ${tm(opts.startAt)} Uhr`)}${MAIL_ROW("Referenz", opts.reference)}</table>
     <p style="color:#4a524a;font-size:14px;line-height:1.7;margin:22px 0 0">Wir freuen uns auf dich! Bis bald — dein TENNISHALLE Team.</p>`,
    "Buchung ansehen",
  );
  return sendBrevoEmail(opts.to, `Bald: Dein Tennis-Termin — TENNISHALLE`, html);
}
