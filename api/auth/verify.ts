// GET /api/auth/verify?token=... — подтверждение email по ссылке из письма (file-based routing)
import { db } from "../_lib.js";

export const config = { runtime: "nodejs" };

function Redirect(location: string): Response {
  return new Response(null, { status: 302, headers: { Location: location } });
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function GET(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token") ?? "";
    if (!token) return Redirect("/sign-in?verify_error=missing_token");

    const tokenHash = await sha256Hex(token);
    const p = db();
    const res = await p.query<{ id: string; user_id: string }>(
      `select id, user_id from email_verification_tokens where token_hash = $1 and expires_at > now()`,
      [tokenHash],
    );
    if (res.rows.length === 0) return Redirect("/sign-in?verify_error=invalid_token");

    const userId = res.rows[0].user_id;
    await p.query(`update app_users set email_verified = true where id = $1`, [userId]);
    await p.query(`delete from email_verification_tokens where token_hash = $1`, [tokenHash]);

    return Redirect("/sign-in?verified=1");
  } catch {
    return Redirect("/sign-in?verify_error=server");
  }
}
