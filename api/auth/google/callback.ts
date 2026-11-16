// Google OAuth callback: /api/auth/google/callback (file-based routing, отдельная функция)
import { db, createSession } from "../../_lib.js";

export const config = { runtime: "nodejs" };

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const REDIRECT_URI = "https://tennishalle.vercel.app/api/auth/google/callback";

function Redirect(location: string): Response {
  return new Response(null, { status: 302, headers: { Location: location } });
}

function b64urlDecodeJson<T>(s: string): T {
  return JSON.parse(Buffer.from(s, "base64url").toString("utf8")) as T;
}

function genPending(): string {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function GET(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const stateRaw = url.searchParams.get("state") ?? "";
    const error = url.searchParams.get("error");

    let redirectTo = "/account";
    try {
      const st = b64urlDecodeJson<{ r?: string }>(stateRaw);
      if (st.r && st.r.startsWith("/")) redirectTo = st.r;
    } catch {
      /* state битый — используем дефолт */
    }

    if (error || !code) return Redirect(`/sign-in?google_error=${encodeURIComponent(error ?? "missing_code")}`);

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) return Redirect(`/sign-in?google_error=not_configured`);

    // 1) обмен code → токены
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) return Redirect(`/sign-in?google_error=token_exchange`);
    const tokens = (await tokenRes.json()) as { id_token?: string };
    if (!tokens.id_token) return Redirect(`/sign-in?google_error=no_id_token`);

    // 2) payload id_token (токен получен напрямую от Google по TLS — подпись не проверяем)
    const payload = b64urlDecodeJson<{ email?: string; email_verified?: boolean; name?: string }>(tokens.id_token.split(".")[1] ?? "");
    if (!payload.email || !payload.email_verified) return Redirect(`/sign-in?google_error=email_unverified`);

    const email = payload.email.toLowerCase().trim();
    const fullName = payload.name?.trim() || null;

    // 3) найти или создать пользователя
    const p = db();
    const found = await p.query<{ id: string; phone: string | null }>(
      `select id, phone from app_users where lower(email) = $1`,
      [email],
    );
    let userId: string;
    let phone: string | null = null;
    if (found.rows.length > 0) {
      userId = found.rows[0].id;
      phone = found.rows[0].phone;
    } else {
      const inserted = await p.query<{ id: string; phone: string | null }>(
        `insert into app_users (email, full_name, role) values ($1, $2, 'member') returning id, phone`,
        [email, fullName],
      );
      userId = inserted.rows[0].id;
    }

    // 4) телефона нет → промежуточный шаг: pending-токен, phone введут на /sign-in
    if (!phone) {
      const pendingToken = `${genPending()}${genPending()}`;
      const pendingHash = await sha256Hex(pendingToken);
      await p.query(
        `insert into google_pending_users (token_hash, user_id, expires_at) values ($1, $2, now() + interval '15 minutes')`,
        [pendingHash, userId],
      );
      return Redirect(`/sign-in?google_pending=${pendingToken}`);
    }

    // 5) телефон есть → сразу сессия
    const { setCookie } = await createSession(userId);
    return new Response(null, {
      status: 302,
      headers: { Location: redirectTo, "Set-Cookie": setCookie },
    });
  } catch {
    return Redirect(`/sign-in?google_error=server`);
  }
}
