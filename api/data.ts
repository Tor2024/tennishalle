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
    if (body.action === "partners") return await partners();
    if (body.action === "news") return await news();
    if (body.action === "events") return await news();
    if (body.action === "legal") return await legal();
    if (body.action === "court_blocks") return await courtBlocks(body);
    if (body.action === "track") return await track(body);
    if (body.action === "contact") return await contact(body);
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
  // pg возвращает numeric как строку — фронт ждёт число (Supabase возвращал число)
  const courts = courtsRes.rows.map((c: Record<string, unknown>) => ({
    ...c,
    hourly_price: c.hourly_price == null ? null : Number(c.hourly_price),
  }));
  return json({
    ok: true,
    venues: venuesRes.rows,
    courts,
    settings: settingsRes.rows[0] ?? null,
  });
}

async function partners(): Promise<Response> {
  const r = await db().query(`select id, name, link, logo_path, is_active from partners where is_active = true order by sort_order`);
  return json({ ok: true, partners: r.rows });
}

/** Публикации: новости + активные промо (для #aktuelles). */
async function news(): Promise<Response> {
  const p = db();
  const [postsRes, promoRes, eventsRes] = await Promise.all([
    p.query(`select n.id, n.title, n.slug, n.body, n.image_path, n.published_at, u.full_name as author_name from news_posts n left join app_users u on u.id = n.created_by where n.published = true and n.type = 'news' order by n.published_at desc nulls last, n.created_at desc limit 6`),
    p.query(`select n.id, n.title, n.body, n.image_path, n.promo_expires_at, n.published_at, u.full_name as author_name from news_posts n left join app_users u on u.id = n.created_by where n.published = true and n.type = 'promo' and (n.promo_expires_at is null or n.promo_expires_at > now()) order by n.published_at desc limit 1`),
    p.query(`select id, kind, title, participants, starts_at, ends_at, description from events where is_published = true and starts_at >= now() - interval '2 hours' order by starts_at limit 8`),
  ]);
  return json({ ok: true, news: postsRes.rows, promo: promoRes.rows[0] ?? null, events: eventsRes.rows });
}

/** Правовые страницы (agb/impressum/datenschutz/cookies). */
async function legal(): Promise<Response> {
  const r = await db().query(`select id, title, body, updated_at from legal_pages order by id`);
  return json({ ok: true, pages: r.rows });
}

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

/** Счётчик посещений: upsert (day, path) — вызывается с фронта при смене маршрута. */
async function track(body: any): Promise<Response> {
  const path = typeof body.path === "string" ? body.path.slice(0, 120) : "/";
  const p = db();
  await p.query(
    `insert into page_views (day, path, cnt) values ((now() at time zone 'Europe/Berlin')::date, $1, 1)
     on conflict (day, path) do update set cnt = page_views.cnt + 1`,
    [path],
  );
  return json({ ok: true });
}

/** Форма обратной связи: запись в contact_messages (honeypot против спама). */
async function contact(body: any): Promise<Response> {
  if (typeof body.website_alt === "string" && body.website_alt.trim() !== "")
    return json({ ok: true, message: "Nachricht gesendet." });
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 160) : "";
  const email = typeof body.email === "string" ? body.email.trim().slice(0, 200) : "";
  const phone = typeof body.phone === "string" && body.phone.trim() !== "" ? body.phone.trim().slice(0, 40) : null;
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 4000) : "";
  if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || message.length < 10)
    return json({ ok: false, code: "bad_request", message: "Bitte alle Pflichtfelder korrekt ausfuellen." }, 400);
  await db().query(
    `insert into contact_messages (name, email, phone, message) values ($1, $2, $3, $4)`,
    [name, email, phone, message],
  );
  return json({ ok: true, message: "Nachricht gesendet." });
}
