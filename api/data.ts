// data-api — публичное чтение: корты, площадки, настройки, блокировки, новости, партнёры, события
// Заменяет прямые SELECT-ы из Supabase (getCourts/getClubSettings/getCourtBlocks) на своём бэкенде.
import { db, json } from "./_lib.js";

export const config = { runtime: "nodejs" };

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

    if (body.action === "bootstrap") return await bootstrap();
    if (body.action === "court_blocks") return await courtBlocks(body);
    return json({ ok: false, code: "bad_action", message: "Unknown action" }, 400);
  } catch (e) {
    return json({ ok: false, code: "network", message: String((e as Error)?.message ?? e) }, 500);
  }
}

/** Разом: venues + courts + club_settings (то, что раньше давали getCourts + getClubSettings). */
async function bootstrap(): Promise<Response> {
  const p = db();
  const [venuesRes, courtsRes, settingsRes] = await Promise.all([
    p.query(`select * from venues where is_active = true order by sort_order`),
    p.query(`select * from courts where is_active = true order by sort_order`),
    p.query(`select * from club_settings where id = 1`),
  ]);
  return json({
    ok: true,
    venues: venuesRes.rows,
    courts: courtsRes.rows,
    settings: settingsRes.rows[0] ?? null,
  });
}

/** Блокировки кортов на дату (YYYY-MM-DD, Berlin). */
async function courtBlocks(body: any): Promise<Response> {
  const { date } = body;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    return json({ ok: false, code: "bad_request", message: "date required" }, 400);
  const p = db();
  const res = await p.query(
    `select court_id, starts_at, ends_at, reason from court_blocks
      where starts_at <= $1 and ends_at >= $2`,
    [`${date}T23:59:59Z`, `${date}T00:00:00Z`],
  );
  return json({ ok: true, blocks: res.rows });
}
