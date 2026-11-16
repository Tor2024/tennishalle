// Общие хелперы для Vercel Functions: pg-пул, Berlin-время, cookie-сессии.
import { Pool } from "pg";

let pool: Pool | null = null;
export function db(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false, uselibpqcompat: true },
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
    `select u.id, u.email, u.full_name, u.role
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
