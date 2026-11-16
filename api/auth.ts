// auth-api — регистрация / вход / выход / текущий пользователь (cookie-сессии)
import { db, json, getUser, createSession, destroySession, hashPassword, verifyPassword } from "./_lib";

export const config = { runtime: "nodejs" };

export default async function handler(req: Request): Promise<Response> {
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
    return json({ ok: false, code: "bad_action", message: "Unknown action" }, 400);
  } catch (e) {
    return json({ ok: false, code: "network", message: String((e as Error)?.message ?? e) }, 500);
  }
}

async function signup(body: any): Promise<Response> {
  const { email, password, full_name } = body;
  if (!email || !password || typeof password !== "string" || password.length < 6)
    return json({ ok: false, code: "bad_request", message: "E-Mail und Passwort (min. 6 Zeichen) erforderlich." }, 400);

  const p = db();
  const exists = await p.query(`select id from app_users where lower(email) = lower($1)`, [email]);
  if (exists.rows.length > 0)
    return json({ ok: false, code: "exists", message: "Ein Konto mit dieser E-Mail existiert bereits." }, 409);

  const password_hash = await hashPassword(password);
  const inserted = await p.query<{ id: string; email: string; full_name: string | null; role: "member" | "owner" | "admin" }>(
    `insert into app_users (email, password_hash, full_name, role) values ($1, $2, $3, 'member')
     returning id, email, full_name, role`,
    [email.trim(), password_hash, full_name?.trim() || null],
  );
  const user = inserted.rows[0];
  const { setCookie } = await createSession(user.id);
  return json({ ok: true, user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role } }, 200, { "Set-Cookie": setCookie });
}

async function signin(body: any): Promise<Response> {
  const { email, password } = body;
  if (!email || !password)
    return json({ ok: false, code: "bad_request", message: "E-Mail und Passwort erforderlich." }, 400);

  const p = db();
  const res = await p.query<{ id: string; email: string; full_name: string | null; role: "member" | "owner" | "admin"; password_hash: string }>(
    `select id, email, full_name, role, password_hash from app_users where lower(email) = lower($1)`,
    [email.trim()],
  );
  const user = res.rows[0];
  if (!user || !(await verifyPassword(password, user.password_hash)))
    return json({ ok: false, code: "invalid", message: "E-Mail oder Passwort falsch." }, 401);

  const { setCookie } = await createSession(user.id);
  return json({ ok: true, user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role } }, 200, { "Set-Cookie": setCookie });
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
