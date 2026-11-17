// data-api — публичное чтение: корты, площадки, настройки, блокировки, новости, партнёры, события
// Заменяет прямые SELECT-ы из Supabase (getCourts/getClubSettings/getCourtBlocks) на своём бэкенде.
import { db, json, getUser } from "./_lib.js";

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
    if (body.action === "tournaments") return await tournaments();
    if (body.action === "tournament_register") return await tournamentRegister(body, req);
    if (body.action === "legal") return await legal();
    if (body.action === "price_overview") return await priceOverview();
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
    p.query(`select n.id, n.title, n.slug, n.lead, n.body, n.image_path, n.published_at, u.full_name as author_name from news_posts n left join app_users u on u.id = n.created_by where n.published = true and n.type = 'news' order by n.published_at desc nulls last, n.created_at desc limit 12`),
    p.query(`select n.id, n.title, n.lead, n.body, n.image_path, n.promo_expires_at, n.icon, n.cta_label, n.cta_link, n.published_at, u.full_name as author_name from news_posts n left join app_users u on u.id = n.created_by where n.published = true and n.type = 'promo' and (n.promo_expires_at is null or n.promo_expires_at > now()) order by n.published_at desc limit 3`),
    p.query(`select id, kind, title, participants, starts_at, ends_at, description from events where is_published = true and starts_at >= now() - interval '2 hours' order by starts_at limit 8`),
  ]);
  return json({ ok: true, news: postsRes.rows, promo: promoRes.rows, events: eventsRes.rows });
}

/** Публичный список турниров + количество заявок. */
async function tournaments(): Promise<Response> {
  const r = await db().query(
    `select t.id, t.title, t.description, t.format, t.fee_cents, t.starts_at, t.registration_deadline, t.max_entries, t.status, t.image_path,
            (select count(*) from tournament_entries e where e.tournament_id = t.id) as entry_count
       from tournaments t
      where t.is_published = true
      order by t.starts_at`,
  )
  return json({ ok: true, tournaments: r.rows })
}

/** Регистрация на турнир (только авторизованные; уникальная заявка на пользователя и турнир). */
async function tournamentRegister(body: Record<string, unknown>, req: Request): Promise<Response> {
  const user = await getUser(req)
  if (!user) return json({ ok: false, code: "unauthorized", message: "Bitte melde dich an, um dich zu melden." }, 401)
  const tournamentId = typeof body.tournament_id === "string" ? body.tournament_id : ""
  if (!tournamentId) return json({ ok: false, code: "bad_request", message: "Fehlende Turnier-ID." }, 400)
  const t = await db().query(`select id, status, max_entries, registration_deadline from tournaments where id = $1 and is_published = true`, [tournamentId])
  if (!t.rows.length) return json({ ok: false, code: "not_found", message: "Turnier nicht gefunden." }, 404)
  const tour = t.rows[0] as Record<string, unknown>
  if (tour.status === "finished" || tour.status === "running")
    return json({ ok: false, code: "closed", message: "Die Anmeldung für dieses Turnier ist nicht mehr möglich." }, 400)
  if (tour.registration_deadline && new Date(String(tour.registration_deadline)) < new Date())
    return json({ ok: false, code: "deadline_passed", message: "Die Anmeldefrist ist abgelaufen." }, 400)
  const count = await db().query(`select count(*) as c from tournament_entries where tournament_id = $1`, [tournamentId])
  if (tour.max_entries != null && Number(count.rows[0].c) >= Number(tour.max_entries))
    return json({ ok: false, code: "full", message: "Das Turnier ist bereits ausgebucht." }, 400)
  const partnerName = typeof body.partner_name === "string" ? body.partner_name.trim().slice(0, 120) || null : null
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) || null : null
  try {
    await db().query(
      `insert into tournament_entries (tournament_id, user_id, partner_name, note) values ($1, $2, $3, $4)`,
      [tournamentId, user.id, partnerName, note],
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes("unique") || msg.includes("23P01") || msg.includes("duplicate")) {
      return json({ ok: false, code: "already", message: "Du bist bereits für dieses Turnier gemeldet." }, 400)
    }
    throw e
  }
  const total = await db().query(`select count(*) as c from tournament_entries where tournament_id = $1`, [tournamentId])
  return json({ ok: true, message: "Anmeldung erfolgreich.", entry_count: Number(total.rows[0].c) })
}

/** Обзор цен по кортам: hourly_price + min/max из price_zones (для карточек и планировщика). */async function priceOverview(): Promise<Response> {
  const r = await db().query(
    `select c.id, c.hourly_price, min(z.price_cents) as min_price_cents, max(z.price_cents) as max_price_cents, count(z.id) as zone_count
       from courts c left join price_zones z on z.court_id = c.id
      where c.is_active = true group by c.id, c.hourly_price`,
  );
  const prices: Record<string, unknown> = {};
  for (const row of r.rows as Record<string, unknown>[]) {
    const minC = row.min_price_cents == null ? null : Number(row.min_price_cents);
    const maxC = row.max_price_cents == null ? null : Number(row.max_price_cents);
    prices[String(row.id)] = {
      hourly_price: row.hourly_price == null ? null : Number(row.hourly_price),
      min_hourly: minC == null ? null : minC / 100,
      max_hourly: maxC == null ? null : maxC / 100,
      zone_count: Number(row.zone_count ?? 0),
    };
  }
  return json({ ok: true, prices });
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
