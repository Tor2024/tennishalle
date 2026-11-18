import { db, json, getUser, toMin } from './_lib.js'
import type { SessionUser } from './_lib.js'

interface PoolClient { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> }

async function requireAdmin(req: Request): Promise<{ user: SessionUser } | { resp: Response }> {
  const user = await getUser(req)
  if (!user) return { resp: json({ ok: false, code: 'unauthorized', message: 'Nicht angemeldet.' }, 401) }
  if (user.role !== 'admin' && user.role !== 'owner') {
    return { resp: json({ ok: false, code: 'forbidden', message: 'Kein Besitzer-Zugriff.' }, 403) }
  }
  return { user }
}

function isTs(v: unknown): v is string {
  return typeof v === 'string' && !Number.isNaN(new Date(v).getTime())
}

/* ---------- stats ---------- */

async function stats(_body: Record<string, unknown>) {
  // KPI: bookings + revenue per period, unique customers, cancellations
  const kpi = await db().query<{
    b_today: string; r_today: string; b_week: string; r_week: string;
    b_month: string; r_month: string; b_year: string; r_year: string;
    b_total: string; r_total: string; c_total: string; c_cancelled: string; customers: string;
  }>(
    `select
      count(*) filter (where start_at >= date_trunc('day', now() at time zone 'Europe/Berlin')) as b_today,
      coalesce(sum(fee_cents) filter (where start_at >= date_trunc('day', now() at time zone 'Europe/Berlin') and status <> 'cancelled'), 0) as r_today,
      count(*) filter (where start_at >= date_trunc('day', now() at time zone 'Europe/Berlin') - interval '6 days') as b_week,
      coalesce(sum(fee_cents) filter (where start_at >= date_trunc('day', now() at time zone 'Europe/Berlin') - interval '6 days' and status <> 'cancelled'), 0) as r_week,
      count(*) filter (where start_at >= date_trunc('month', now() at time zone 'Europe/Berlin')) as b_month,
      coalesce(sum(fee_cents) filter (where start_at >= date_trunc('month', now() at time zone 'Europe/Berlin') and status <> 'cancelled'), 0) as r_month,
      count(*) filter (where start_at >= date_trunc('year', now() at time zone 'Europe/Berlin')) as b_year,
      coalesce(sum(fee_cents) filter (where start_at >= date_trunc('year', now() at time zone 'Europe/Berlin') and status <> 'cancelled'), 0) as r_year,
      count(*) as b_total,
      coalesce(sum(fee_cents) filter (where status <> 'cancelled'), 0) as r_total,
      count(*) filter (where status = 'cancelled') as c_cancelled,
      count(distinct customer_email) as customers
    from reservations where start_at >= now() - interval '1 year'`,
  )
  // per-day last 30 days (bookings + revenue + views)
  const perDay = await db().query<{ day: string; bookings: string; revenue: string; views: string }>(
    `with days as (
       select generate_series(date_trunc('day', now() at time zone 'Europe/Berlin') - interval '29 days', date_trunc('day', now() at time zone 'Europe/Berlin'), interval '1 day') as d
     )
     select to_char(d, 'YYYY-MM-DD') as day,
       (select count(*) from reservations r where r.start_at >= d and r.start_at < d + interval '1 day') as bookings,
       (select coalesce(sum(r.fee_cents), 0) from reservations r where r.start_at >= d and r.start_at < d + interval '1 day' and r.status <> 'cancelled') as revenue,
       (select coalesce(sum(v.cnt), 0) from page_views v where v.day = d::date) as views
     from days order by d`,
  )
  // per-month last 12 months
  const perMonth = await db().query<{ month: string; bookings: string; revenue: string }>(
    `with months as (
       select generate_series(date_trunc('month', now() at time zone 'Europe/Berlin') - interval '11 months', date_trunc('month', now() at time zone 'Europe/Berlin'), interval '1 month') as m
     )
     select to_char(m, 'YYYY-MM') as month,
       (select count(*) from reservations r where r.start_at >= m and r.start_at < m + interval '1 month') as bookings,
       (select coalesce(sum(r.fee_cents), 0) from reservations r where r.start_at >= m and r.start_at < m + interval '1 month' and r.status <> 'cancelled') as revenue
     from months order by m`,
  )
  // weekday distribution (0=Sunday)
  const perWeekday = await db().query<{ weekday: number; bookings: string }>(
    `select extract(dow from start_at at time zone 'Europe/Berlin')::int as weekday, count(*) as bookings
     from reservations where status <> 'cancelled' and start_at >= now() - interval '1 year'
     group by 1 order by 1`,
  )
  // popular hours (start hour)
  const perHour = await db().query<{ hour: number; bookings: string }>(
    `select extract(hour from start_at at time zone 'Europe/Berlin')::int as hour, count(*) as bookings
     from reservations where status <> 'cancelled' and start_at >= now() - interval '1 year'
     group by 1 order by 1`,
  )
  // court share
  const perCourt = await db().query<{ court_id: string; name: string; bookings: string; revenue: string }>(
    `select c.id as court_id, c.name, count(r.id) as bookings,
       coalesce(sum(r.fee_cents) filter (where r.status <> 'cancelled'), 0) as revenue
     from courts c left join reservations r on r.court_id = c.id and r.start_at >= now() - interval '1 year'
     where c.is_active group by c.id, c.name order by c.sort_order`,
  )
  // status counts
  const statuses = await db().query<{ status: string; cnt: string }>(
    `select status, count(*) as cnt from reservations group by 1`,
  )
  // booking lead time (created_at -> start_at) buckets
  const lead = await db().query<{ lead_bucket: string; cnt: string }>(
    `select case
       when lead < 1 then '<1 Tag' when lead < 3 then '1-2 Tage' when lead < 7 then '3-6 Tage'
       when lead < 14 then '1 Woche' when lead < 30 then '2-4 Wochen' else '>1 Monat' end as lead_bucket,
       count(*) as cnt
     from (select extract(epoch from (start_at - created_at)) / 86400.0 as lead from reservations) t
     group by 1`,
  )
  // top customers
  const topCustomers = await db().query<{ customer_name: string; customer_email: string; bookings: string; revenue: string }>(
    `select customer_name, customer_email, count(*) as bookings,
       coalesce(sum(fee_cents) filter (where status <> 'cancelled'), 0) as revenue
     from reservations group by customer_name, customer_email order by bookings desc, revenue desc limit 8`,
  )
  // utilization: booked confirmed slot-halfhours in next 30d vs open slots from operating_hours
  const util = await db().query<{ open_slots: string; booked_slots: string }>(
    `with open as (
       select count(*) as n from operating_hours oh, generate_series(0, 29) g
       where oh.weekday = extract(dow from (current_date + g) at time zone 'Europe/Berlin')::int
     ), booked as (
       select coalesce(sum(duration_minutes / 30), 0) as n from reservations
       where status = 'confirmed' and start_at >= now() and start_at < now() + interval '30 days'
     )
     select open.n as open_slots, booked.n as booked_slots from open, booked`,
  )
  // attention: pending bookings, unread messages, upcoming games (today+tomorrow)
  const [pending, unread, upcoming] = await Promise.all([
    db().query<{ cnt: string }>(`select count(*) as cnt from reservations where status = 'pending'`),
    db().query<{ cnt: string }>(`select count(*) as cnt from contact_messages where handled = false`),
    db().query<{ id: string; reference: string; court_name: string; start_at: string; end_at: string; customer_name: string; status: string }>(
      `select r.id, r.reference, c.name as court_name, r.start_at, r.end_at, r.customer_name, r.status
       from reservations r join courts c on c.id = r.court_id
       where r.status <> 'cancelled'
         and r.end_at >= date_trunc('day', now() at time zone 'Europe/Berlin')
         and r.start_at < date_trunc('day', now() at time zone 'Europe/Berlin') + interval '2 days'
       order by r.start_at limit 40`,
    ),
  ])
  // traffic: page_views totals + top paths
  const traffic = await db().query<{ views_total: string; days_unique: string; views_today: string; views_yesterday: string }>(
    `select
       (select coalesce(sum(cnt), 0) from page_views) as views_total,
       (select count(distinct day) from page_views) as days_unique,
       (select coalesce(sum(cnt), 0) from page_views where day = (now() at time zone 'Europe/Berlin')::date) as views_today,
       (select coalesce(sum(cnt), 0) from page_views where day = (now() at time zone 'Europe/Berlin')::date - 1) as views_yesterday`,
  )
  const topPaths = await db().query<{ path: string; cnt: string }>(
    `select path, sum(cnt) as cnt from page_views group by path order by cnt desc limit 10`,
  )
  return json({
    ok: true,
    kpi: {
      bookings: {
        today: Number(kpi.rows[0].b_today), week: Number(kpi.rows[0].b_week),
        month: Number(kpi.rows[0].b_month), year: Number(kpi.rows[0].b_year),
        total: Number(kpi.rows[0].b_total),
      },
      revenue_cents: {
        today: Number(kpi.rows[0].r_today), week: Number(kpi.rows[0].r_week),
        month: Number(kpi.rows[0].r_month), year: Number(kpi.rows[0].r_year),
        total: Number(kpi.rows[0].r_total),
      },
      customers: Number(kpi.rows[0].customers),
      cancelled: Number(kpi.rows[0].c_cancelled),
      utilization: util.rows[0] ? Number(util.rows[0].booked_slots) / Math.max(1, Number(util.rows[0].open_slots)) : 0,
    },
    perDay: perDay.rows, perMonth: perMonth.rows, perWeekday: perWeekday.rows,
    perHour: perHour.rows, perCourt: perCourt.rows, statuses: statuses.rows,
    lead: lead.rows, topCustomers: topCustomers.rows,
    attention: {
      pending: Number(pending.rows[0].cnt),
      messages_unread: Number(unread.rows[0].cnt),
      upcoming: upcoming.rows,
    },
    traffic: {
      views_total: Number(traffic.rows[0].views_total),
      days_unique: Number(traffic.rows[0].days_unique),
      views_today: Number(traffic.rows[0].views_today),
      views_yesterday: Number(traffic.rows[0].views_yesterday),
      top_paths: topPaths.rows,
    },
  })
}

/* ---------- bookings list (admin) ---------- */

async function bookings(body: Record<string, unknown>) {
  const from = typeof body.from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.from) ? body.from : null
  const to = typeof body.to === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.to) ? body.to : null
  const status = typeof body.status === 'string' && body.status ? body.status : null
  const courtId = typeof body.court_id === 'string' && body.court_id ? body.court_id : null
  const rows = await db().query(
    `select r.*, c.name as court_name, v.name as venue_name, c.court_number,
      (select to_char(min(l.changed_at) at time zone 'Europe/Berlin', 'DD.MM.YYYY HH24:MI')
         from price_change_log l
        where l.court_id = r.court_id and l.changed_at > r.created_at and l.changed_at < r.start_at) as price_changed_after,
      (select l.old_price_cents from price_change_log l
        where l.court_id = r.court_id and l.changed_at > r.created_at and l.changed_at < r.start_at
        order by l.changed_at limit 1) as price_before_change
     from reservations r join courts c on c.id = r.court_id join venues v on v.id = c.venue_id
     where ($1::timestamptz is null or r.start_at >= $1) and ($2::timestamptz is null or r.start_at < $2)
       and ($3::text is null or r.status = $3) and ($4::uuid is null or r.court_id = $4)
     order by r.start_at desc limit 500`,
    [from ? `${from}T00:00:00Z` : null, to ? `${to}T23:59:59Z` : null, status, courtId],
  )
  return json({ ok: true, reservations: rows.rows })
}

/* ---------- blocks (create/delete) ---------- */

async function createBlock(body: Record<string, unknown>, user: SessionUser) {
  const courtId = typeof body.court_id === 'string' ? body.court_id : ''
  const date = typeof body.date === 'string' ? body.date : ''
  const startTime = typeof body.start_time === 'string' ? body.start_time : '06:00'
  const endTime = typeof body.end_time === 'string' ? body.end_time : '23:00'
  const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : 'Gesperrt'
  if (!courtId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return json({ ok: false, code: 'bad_request', message: 'Bitte alle Pflichtfelder ausfuellen.' }, 400)
  }
  await db().query(
    `insert into court_blocks (court_id, starts_at, ends_at, reason, created_by)
     values ($1, $2::timestamptz, $3::timestamptz, $4, $5)`,
    [courtId, `${date}T${startTime}:00`, `${date}T${endTime}:00`, reason, user.id],
  )
  return json({ ok: true, message: 'Zeit gesperrt.' })
}

async function deleteBlock(body: Record<string, unknown>) {
  const id = typeof body.id === 'string' ? body.id : ''
  if (!id) return json({ ok: false, code: 'bad_request', message: 'Fehlende ID.' }, 400)
  await db().query(`delete from court_blocks where id = $1`, [id])
  return json({ ok: true })
}

/* ---------- day data for calendar ---------- */

async function dayData(body: Record<string, unknown>) {
  const from = typeof body.from === 'string' ? body.from : ''
  const to = typeof body.to === 'string' ? body.to : ''
  if (!isTs(from) || !isTs(to)) return json({ ok: false, code: 'bad_request', message: 'Ungueltiger Zeitraum.' }, 400)
  const [reservations, blocks] = await Promise.all([
    db().query(
      `select r.*, c.name as court_name, c.court_number from reservations r join courts c on c.id = r.court_id
       where r.status <> 'cancelled' and r.end_at > $1 and r.start_at < $2 order by r.start_at`,
      [from, to],
    ),
    db().query(
      `select b.*, c.name as court_name from court_blocks b join courts c on c.id = b.court_id
       where b.ends_at > $1 and b.starts_at < $2 order by b.starts_at`,
      [from, to],
    ),
  ])
  return json({ ok: true, reservations: reservations.rows, blocks: blocks.rows })
}

/* ---------- courts CRUD (admin) ---------- */

async function courtsList() {
  const courts = await db().query(
    `select c.*, v.name as venue_name,
      (select count(*) from operating_hours oh where oh.court_id = c.id) as hours_count,
      (select count(*) from price_zones pz where pz.court_id = c.id) as zone_count
     from courts c join venues v on v.id = c.venue_id
     order by c.sort_order`,
  )
  const venues = await db().query(`select * from venues order by sort_order`)
  return json({ ok: true, courts: courts.rows, venues: venues.rows })
}

async function saveCourt(body: Record<string, unknown>) {
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const venueId = typeof body.venue_id === 'string' ? body.venue_id : ''
  if (!name || !venueId) return json({ ok: false, code: 'bad_request', message: 'Name und Anlage sind Pflichtfelder.' }, 400)
  const surface = typeof body.surface === 'string' && body.surface.trim() ? body.surface.trim() : null
  const environment = typeof body.environment === 'string' && body.environment.trim() ? body.environment.trim() : 'Halle'
  const courtNumber = Number.isFinite(Number(body.court_number)) && body.court_number !== '' ? Number(body.court_number) : null
  const hourlyPrice = Number.isFinite(Number(body.hourly_price)) && body.hourly_price !== '' ? Number(body.hourly_price) : null
  const imageUrl = typeof body.image_url === 'string' && body.image_url.trim() ? body.image_url.trim() : null
  const isActive = body.is_active !== false
  const sortOrder = Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 99
  const id = typeof body.id === 'string' && body.id ? body.id : null

  if (id) {
    const r = await db().query(
      `update courts set name=$1, venue_id=$2, surface=$3, environment=$4, court_number=$5,
        hourly_price=$6, image_url=$7, is_active=$8, sort_order=$9 where id=$10 returning id`,
      [name, venueId, surface, environment, courtNumber, hourlyPrice, imageUrl, isActive, sortOrder, id],
    )
    if (!r.rows.length) return json({ ok: false, code: 'not_found', message: 'Platz nicht gefunden.' }, 404)
    return json({ ok: true, id: r.rows[0].id, message: 'Platz gespeichert.' })
  }
  const p = db()
  await p.query('begin')
  try {
    const r = await p.query(
      `insert into courts (id, venue_id, name, surface, environment, court_number, hourly_price, image_url, is_active, sort_order)
       values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
      [venueId, name, surface, environment, courtNumber, hourlyPrice, imageUrl, isActive, sortOrder],
    )
    const newId = r.rows[0].id as string
    // Neue Plätze starten mit der Einrichtung des vollständigsten Platzes (Preiszonen + Öffnungszeiten) — Admin passt danach an.
    const ref = await p.query(
      `select c.id,
          (select count(*) from price_zones pz where pz.court_id = c.id) as zone_count
        from courts c where c.id <> $1
        order by zone_count desc, c.sort_order limit 1`,
      [newId],
    )
    const refId = typeof ref.rows[0]?.id === 'string' ? (ref.rows[0].id as string) : null
    let copied = false
    if (refId) {
      await p.query(
        `insert into price_zones (court_id, label, weekdays, start_time, end_time, price_cents, sort_order)
         select $1, label, weekdays, start_time, end_time, price_cents, sort_order from price_zones where court_id = $2`,
        [newId, refId],
      )
      await p.query(
        `insert into operating_hours (court_id, weekday, opens, closes)
         select $1, weekday, opens, closes from operating_hours where court_id = $2`,
        [newId, refId],
      )
      copied = true
    }
    await p.query('commit')
    return json({ ok: true, id: newId, message: copied ? 'Platz angelegt. Preiszonen und Öffnungszeiten wurden übernommen — jetzt anpassbar.' : 'Platz angelegt.' })
  } catch (err) {
    await p.query('rollback')
    throw err
  }
}

async function deleteCourt(body: Record<string, unknown>) {
  const id = typeof body.id === 'string' ? body.id : ''
  if (!id) return json({ ok: false, code: 'bad_request', message: 'Fehlende ID.' }, 400)
  // courts FK: operating_hours/price_zones ON DELETE CASCADE; reservations ON DELETE RESTRICT
  try {
    await db().query(`delete from courts where id = $1`, [id])
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (msg.includes('violates foreign key')) {
      return json({ ok: false, code: 'in_use', message: 'Platz hat Buchungen und kann nicht geloescht werden. Deaktiviere ihn stattdessen.' }, 409)
    }
    throw e
  }
  return json({ ok: true, message: 'Platz geloescht.' })
}

/* ---------- price zones CRUD (admin) ---------- */

async function zonesList(body: Record<string, unknown>) {
  const courtId = typeof body.court_id === 'string' && body.court_id ? body.court_id : null
  const rows = courtId
    ? await db().query(`select * from price_zones where court_id = $1 order by sort_order, start_time`, [courtId])
    : await db().query(`select pz.*, c.name as court_name from price_zones pz join courts c on c.id = pz.court_id order by c.sort_order, pz.sort_order`)
  return json({ ok: true, zones: rows.rows })
}

async function saveZone(body: Record<string, unknown>) {
  const courtId = typeof body.court_id === 'string' ? body.court_id : ''
  const startTime = typeof body.start_time === 'string' ? body.start_time : ''
  const endTime = typeof body.end_time === 'string' ? body.end_time : ''
  const priceCents = Number(body.price_cents)
  const weekdays = Array.isArray(body.weekdays) ? body.weekdays.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6) : []
  if (!courtId || !/^\d{2}:\d{2}/.test(startTime) || !/^\d{2}:\d{2}/.test(endTime) || !Number.isFinite(priceCents) || priceCents <= 0 || !weekdays.length) {
    return json({ ok: false, code: 'bad_request', message: 'Bitte alle Pflichtfelder ausfuellen (Platz, Zeitraum, Preis, Wochentage).' }, 400)
  }
  const label = typeof body.label === 'string' && body.label.trim() ? body.label.trim() : 'Zone'
  const sortOrder = Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0
  const id = typeof body.id === 'string' && body.id ? body.id : null
  const st = `${startTime.slice(0, 5)}:00`
  const et = `${endTime.slice(0, 5)}:00`

  if (id) {
    const prev = await db().query(`select label, price_cents from price_zones where id = $1`, [id])
    const r = await db().query(
      `update price_zones set court_id=$1, label=$2, weekdays=$3, start_time=$4, end_time=$5, price_cents=$6, sort_order=$7 where id=$8 returning id`,
      [courtId, label, weekdays, st, et, Math.round(priceCents), sortOrder, id],
    )
    if (!r.rows.length) return json({ ok: false, code: 'not_found', message: 'Zone nicht gefunden.' }, 404)
    if (prev.rows.length && Number(prev.rows[0].price_cents) !== Math.round(priceCents)) {
      await db().query(
        `insert into price_change_log (court_id, zone_id, zone_label, old_price_cents, new_price_cents, changed_by) values ($1, $2, $3, $4, $5, $6)`,
        [courtId, id, prev.rows[0].label, Number(prev.rows[0].price_cents), Math.round(priceCents), body._user_id ?? null],
      )
    }
    return json({ ok: true, id: r.rows[0].id, message: 'Zone gespeichert.' })
  }
  const r = await db().query(
    `insert into price_zones (court_id, label, weekdays, start_time, end_time, price_cents, sort_order)
     values ($1, $2, $3, $4, $5, $6, $7) returning id`,
    [courtId, label, weekdays, st, et, Math.round(priceCents), sortOrder],
  )
  return json({ ok: true, id: r.rows[0].id, message: 'Zone angelegt.' })
}

async function deleteZone(body: Record<string, unknown>) {
  const id = typeof body.id === 'string' ? body.id : ''
  if (!id) return json({ ok: false, code: 'bad_request', message: 'Fehlende ID.' }, 400)
  const prev = await db().query(`select court_id, label, price_cents from price_zones where id = $1`, [id])
  await db().query(`delete from price_zones where id = $1`, [id])
  if (prev.rows.length) {
    await db().query(
      `insert into price_change_log (court_id, zone_id, zone_label, old_price_cents, new_price_cents, changed_by) values ($1, $2, $3, $4, null, $5)`,
      [prev.rows[0].court_id, id, `${prev.rows[0].label} (geloescht)`, Number(prev.rows[0].price_cents), body._user_id ?? null],
    )
  }
  return json({ ok: true, message: 'Zone geloescht.' })
}

/** Preisänderungs-Historie eines Platzes (Archiv für Kontrolle). */
async function priceHistory(body: Record<string, unknown>) {
  const courtId = typeof body.court_id === 'string' && body.court_id ? body.court_id : null
  const rows = courtId
    ? await db().query(
        `select l.*, c.name as court_name from price_change_log l join courts c on c.id = l.court_id where l.court_id = $1 order by l.changed_at desc limit 200`,
        [courtId],
      )
    : await db().query(
        `select l.*, c.name as court_name from price_change_log l join courts c on c.id = l.court_id order by l.changed_at desc limit 200`,
      )
  return json({ ok: true, history: rows.rows })
}

/** Öffnungszeiten eines Platzes (7 Wochentage). */
async function hoursList(body: Record<string, unknown>) {
  const courtId = typeof body.court_id === 'string' && body.court_id ? body.court_id : null
  const rows = courtId
    ? await db().query(`select weekday, opens, closes from operating_hours where court_id = $1 order by weekday`, [courtId])
    : await db().query(`select oh.*, c.name as court_name from operating_hours oh join courts c on c.id = oh.court_id order by c.sort_order, oh.weekday`)
  return json({ ok: true, hours: rows.rows })
}

/** Öffnungszeiten eines Platzes ERSETZEN (alle 7 Tage in einem Rutsch). */
async function saveHours(body: Record<string, unknown>) {
  const courtId = typeof body.court_id === 'string' ? body.court_id : ''
  const rows = Array.isArray(body.rows) ? body.rows : []
  if (!courtId) return json({ ok: false, code: 'bad_request', message: 'Fehlender Platz.' }, 400)
  const court = await db().query(`select id from courts where id = $1`, [courtId])
  if (!court.rows.length) return json({ ok: false, code: 'not_found', message: 'Platz nicht gefunden.' }, 404)

  const norm = (v: unknown): string | null => {
    const s = typeof v === 'string' ? v : ''
    return /^\d{2}:\d{2}$/.test(s) ? `${s}:00` : /^\d{2}:\d{2}:\d{2}$/.test(s) ? s : null
  }
  const out: Array<[number, string, string]> = []
  for (const r of rows) {
    const wd = Number((r as Record<string, unknown>).weekday)
    const o = norm((r as Record<string, unknown>).opens)
    const c = norm((r as Record<string, unknown>).closes)
    if (!Number.isInteger(wd) || wd < 0 || wd > 6 || !o || !c) {
      return json({ ok: false, code: 'bad_request', message: 'Ungueltige Zeiten (erwartet HH:MM).' }, 400)
    }
    if (toMin(o) >= toMin(c)) {
      return json({ ok: false, code: 'bad_request', message: 'Schliesszeit muss nach Öffnungszeit liegen.' }, 400)
    }
    out.push([wd, o, c])
  }

  const p = db()
  await p.query('begin')
  try {
    await p.query(`delete from operating_hours where court_id = $1`, [courtId])
    for (const [wd, o, c] of out) {
      await p.query(`insert into operating_hours (court_id, weekday, opens, closes) values ($1, $2, $3, $4)`, [courtId, wd, o, c])
    }
    await p.query('commit')
  } catch (err) {
    await p.query('rollback')
    throw err
  }
  return json({ ok: true, message: 'Öffnungszeiten gespeichert.' })
}

// ---------- partners ----------
async function partnersList() {
  const r = await db().query(`select id, name, link, logo_path, sort_order, is_active from partners order by sort_order`)
  return json({ ok: true, partners: r.rows })
}

async function savePartner(body: Record<string, unknown>) {
  const name = String(body.name ?? '').trim()
  if (!name) return json({ ok: false, code: 'bad_request', message: 'Name fehlt.' }, 400)
  const link = String(body.link ?? '').trim() || null
  const logoPath = String(body.logo_path ?? '').trim() || null
  const isActive = body.is_active !== false
  const sortOrder = Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 99
  if (typeof body.id === 'string' && body.id) {
    await db().query(`update partners set name=$1, link=$2, logo_path=$3, is_active=$4, sort_order=$5 where id=$6`, [name, link, logoPath, isActive, sortOrder, body.id])
    return json({ ok: true, message: 'Partner gespeichert.' })
  }
  await db().query(`insert into partners (id, name, link, logo_path, sort_order, is_active) values (gen_random_uuid(), $1, $2, $3, $4, $5)`, [name, link, logoPath, sortOrder, isActive])
  return json({ ok: true, message: 'Partner angelegt.' })
}

async function deletePartner(body: Record<string, unknown>) {
  const id = typeof body.id === 'string' ? body.id : ''
  if (!id) return json({ ok: false, code: 'bad_request', message: 'Fehlende ID.' }, 400)
  await db().query(`delete from partners where id = $1`, [id])
  return json({ ok: true, message: 'Partner geloescht.' })
}

// ---------- news / promo posts ----------
async function postsList() {
  const r = await db().query(
    `select p.*, u.full_name as author_name from news_posts p left join app_users u on u.id = p.created_by
      order by p.published_at desc nulls last, p.created_at desc`,
  )
  return json({ ok: true, posts: r.rows })
}

async function savePost(body: Record<string, unknown>, user: SessionUser) {
  const title = String(body.title ?? '').trim()
  if (!title) return json({ ok: false, code: 'bad_request', message: 'Titel fehlt.' }, 400)
  const type = body.type === 'promo' ? 'promo' : 'news'
  const slugBase = String(body.slug ?? '').trim() || title
  const slug = slugBase.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || `post-${Date.now()}`
  const text = String(body.body ?? '').trim() || null
  const lead = String(body.lead ?? '').trim() || null
  const icon = String(body.icon ?? '').trim() || null
  const ctaLabel = String(body.cta_label ?? '').trim() || null
  const ctaLink = String(body.cta_link ?? '').trim() || null
  const imagePath = String(body.image_path ?? '').trim() || null
  const published = body.published !== false
  const promoExpires = typeof body.promo_expires_at === 'string' && body.promo_expires_at ? body.promo_expires_at : null
  const id = typeof body.id === 'string' && body.id ? body.id : null

  if (id) {
    const r = await db().query(
      `update news_posts set title=$1, slug=$2, body=$3, lead=$4, image_path=$5, published=$6, type=$7,
        promo_expires_at=$8, icon=$9, cta_label=$10, cta_link=$11, updated_at=now() where id=$12 returning id`,
      [title, slug, text, lead, imagePath, published, type, promoExpires, icon, ctaLabel, ctaLink, id],
    )
    if (!r.rows.length) return json({ ok: false, code: 'not_found', message: 'Beitrag nicht gefunden.' }, 404)
    return json({ ok: true, id: r.rows[0].id, message: 'Beitrag gespeichert.' })
  }
  const r = await db().query(
    `insert into news_posts (id, title, slug, body, lead, image_path, published, type, promo_expires_at, icon, cta_label, cta_link, published_at, created_by)
     values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, case when $6 then now() else null end, $12) returning id`,
    [title, slug, text, lead, imagePath, published, type, promoExpires, icon, ctaLabel, ctaLink, user.id],
  )
  void user
  return json({ ok: true, id: r.rows[0].id, message: 'Beitrag angelegt.' })
}

async function deletePost(body: Record<string, unknown>) {
  const id = typeof body.id === 'string' ? body.id : ''
  if (!id) return json({ ok: false, code: 'bad_request', message: 'Fehlende ID.' }, 400)
  await db().query(`delete from news_posts where id = $1`, [id])
  return json({ ok: true, message: 'Beitrag geloescht.' })
}

// ---------- events ----------
async function eventsList() {
  const r = await db().query(`select * from events order by starts_at`)
  return json({ ok: true, events: r.rows })
}

async function saveEvent(body: Record<string, unknown>, user: SessionUser) {
  const title = String(body.title ?? '').trim()
  const startsAt = String(body.starts_at ?? '').trim()
  if (!title || !startsAt) return json({ ok: false, code: 'bad_request', message: 'Titel und Beginn sind Pflichtfelder.' }, 400)
  const kind = ['match', 'tournament', 'training', 'other'].includes(String(body.kind)) ? String(body.kind) : 'other'
  const participants = String(body.participants ?? '').trim() || null
  const endsAt = String(body.ends_at ?? '').trim() || null
  const description = String(body.description ?? '').trim() || null
  const isPublished = body.is_published !== false
  const id = typeof body.id === 'string' && body.id ? body.id : null

  if (id) {
    const r = await db().query(
      `update events set kind=$1, title=$2, participants=$3, starts_at=$4::timestamptz, ends_at=$5::timestamptz,
        description=$6, is_published=$7, updated_at=now() where id=$8 returning id`,
      [kind, title, participants, startsAt, endsAt, description, isPublished, id],
    )
    if (!r.rows.length) return json({ ok: false, code: 'not_found', message: 'Termin nicht gefunden.' }, 404)
    return json({ ok: true, id: r.rows[0].id, message: 'Termin gespeichert.' })
  }
  const r = await db().query(
    `insert into events (id, kind, title, participants, starts_at, ends_at, description, is_published, created_by)
     values (gen_random_uuid(), $1, $2, $3, $4::timestamptz, $5::timestamptz, $6, $7, $8) returning id`,
    [kind, title, participants, startsAt, endsAt, description, isPublished, user.id],
  )
  return json({ ok: true, id: r.rows[0].id, message: 'Termin angelegt.' })
}

async function deleteEvent(body: Record<string, unknown>) {
  const id = typeof body.id === 'string' ? body.id : ''
  if (!id) return json({ ok: false, code: 'bad_request', message: 'Fehlende ID.' }, 400)
  await db().query(`delete from events where id = $1`, [id])
  return json({ ok: true, message: 'Termin geloescht.' })
}

// --- Turniere (Phase 3) ---
const TOURNAMENT_STATUSES = ['announcement', 'registration', 'running', 'finished']

async function tournamentsList() {
  const r = await db().query(
    `select t.*, (select count(*) from tournament_entries e where e.tournament_id = t.id) as entry_count
       from tournaments t order by t.starts_at desc`,
  )
  return json({ ok: true, tournaments: r.rows })
}

async function saveTournament(body: Record<string, unknown>, user: SessionUser) {
  const title = String(body.title ?? '').trim()
  const startsAt = String(body.starts_at ?? '').trim()
  if (!title || !startsAt) return json({ ok: false, code: 'bad_request', message: 'Titel und Beginn sind Pflichtfelder.' }, 400)
  const status = TOURNAMENT_STATUSES.includes(String(body.status)) ? String(body.status) : 'announcement'
  const format = String(body.format) === 'double' ? 'double' : 'single'
  const description = String(body.description ?? '').trim() || null
  const feeCents = Math.max(0, Math.round(Number(body.fee_eur ?? 0) * 100))
  const deadline = String(body.registration_deadline ?? '').trim() || null
  const maxEntriesRaw = Number(body.max_entries)
  const maxEntries = Number.isFinite(maxEntriesRaw) && maxEntriesRaw > 0 ? Math.round(maxEntriesRaw) : null
  const imagePath = String(body.image_path ?? '').trim() || null
  const isPublished = body.is_published !== false
  const id = typeof body.id === 'string' && body.id ? body.id : null

  if (id) {
    const r = await db().query(
      `update tournaments set title=$1, description=$2, format=$3, fee_cents=$4, starts_at=$5::timestamptz,
        registration_deadline=$6::timestamptz, max_entries=$7, status=$8, image_path=$9, is_published=$10, updated_at=now()
       where id=$11 returning id`,
      [title, description, format, feeCents, startsAt, deadline, maxEntries, status, imagePath, isPublished, id],
    )
    if (!r.rows.length) return json({ ok: false, code: 'not_found', message: 'Turnier nicht gefunden.' }, 404)
    return json({ ok: true, id: r.rows[0].id, message: 'Turnier gespeichert.' })
  }
  const r = await db().query(
    `insert into tournaments (id, title, description, format, fee_cents, starts_at, registration_deadline, max_entries, status, image_path, is_published, created_by)
     values (gen_random_uuid(), $1, $2, $3, $4, $5::timestamptz, $6::timestamptz, $7, $8, $9, $10, $11) returning id`,
    [title, description, format, feeCents, startsAt, deadline, maxEntries, status, imagePath, isPublished, user.id],
  )
  return json({ ok: true, id: r.rows[0].id, message: 'Turnier angelegt.' })
}

async function deleteTournament(body: Record<string, unknown>) {
  const id = typeof body.id === 'string' ? body.id : ''
  if (!id) return json({ ok: false, code: 'bad_request', message: 'Fehlende ID.' }, 400)
  await db().query(`delete from tournaments where id = $1`, [id])
  return json({ ok: true, message: 'Turnier geloescht.' })
}

async function tournamentEntries(body: Record<string, unknown>) {
  const id = typeof (body.tournament_id ?? body.id) === 'string' ? String(body.tournament_id ?? body.id) : ''
  if (!id) return json({ ok: false, code: 'bad_request', message: 'Fehlende ID.' }, 400)
  const r = await db().query(
    `select e.id, e.partner_name, e.note, e.created_at, e.paid, e.paid_at, u.full_name, u.email, u.phone
       from tournament_entries e join app_users u on u.id = e.user_id
      where e.tournament_id = $1 order by e.created_at`,
    [id],
  )
  return json({ ok: true, entries: r.rows })
}

async function markEntryPaid(body: Record<string, unknown>) {
  const id = typeof body.id === 'string' ? body.id : ''
  if (!id) return json({ ok: false, code: 'bad_request', message: 'Fehlende ID.' }, 400)
  const paid = body.paid !== false
  const r = await db().query(
    `update tournament_entries set paid = $1, paid_at = case when $1 then now() else null end where id = $2`,
    [paid, id],
  )
  if (!r.rowCount) return json({ ok: false, code: 'not_found', message: 'Meldung nicht gefunden.' }, 404)
  return json({ ok: true, message: paid ? 'Als bezahlt markiert.' : 'Bezahlt-Status entfernt.' })
}

async function removeEntry(body: Record<string, unknown>) {
  const id = typeof body.id === 'string' ? body.id : ''
  if (!id) return json({ ok: false, code: 'bad_request', message: 'Fehlende ID.' }, 400)
  await db().query(`delete from tournament_entries where id = $1`, [id])
  return json({ ok: true, message: 'Meldung entfernt.' })
}

// legal pages (agb/impressum/datenschutz/cookies) — read + edit (id fixed, no create/delete)
async function legalList() {
  const r = await db().query(`select id, title, body, pdf_path, updated_at from legal_pages order by id`)
  return json({ ok: true, pages: r.rows })
}

async function saveLegal(body: Record<string, unknown>) {
  const id = typeof body.id === 'string' ? body.id : ''
  if (!['agb', 'impressum', 'datenschutz', 'cookies'].includes(id))
    return json({ ok: false, code: 'bad_request', message: 'Unbekannte Seite.' }, 400)
  const title = String(body.title ?? '').trim()
  const text = String(body.body ?? '').trim()
  const pdfPath = String(body.pdf_path ?? '').trim() || null
  if (!title) return json({ ok: false, code: 'bad_request', message: 'Titel fehlt.' }, 400)
  if (!text && !pdfPath) return json({ ok: false, code: 'bad_request', message: 'Text oder PDF fehlt — mindestens eins ist nötig.' }, 400)
  await db().query(`update legal_pages set title=$1, body=$2, pdf_path=$3, updated_at=now() where id=$4`, [title, text || null, pdfPath, id])
  return json({ ok: true, message: 'Seite gespeichert.' })
  return json({ ok: true, message: 'Seite gespeichert.' })
}

// image upload: commits file to GitHub repo (Tor2024/tennishalle) -> auto redeploy -> served as /img/<name>
const GH_REPO = 'Tor2024/tennishalle'
const GH_BRANCH = 'main'
const IMG_DIR = 'public/img'

function b64ToBuf(b64: string): Buffer {
  return Buffer.from(b64.replace(/^data:[^,]+,/, ''), 'base64')
}

const EXT_MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml', gif: 'image/gif', pdf: 'application/pdf',
}
const PDF_MAX_BYTES = 8 * 1024 * 1024

async function ghApi(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init?.headers ?? {}),
    },
  })
}

async function uploadImage(body: Record<string, unknown>) {
  const filename = String(body.filename ?? '')
  const dataB64 = String(body.data ?? '')
  const safe = filename.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  const ext = safe.includes('.') ? safe.split('.').pop() ?? '' : ''
  if (!safe || !EXT_MIME[ext]) return json({ ok: false, code: 'bad_request', message: 'Nur PNG, JPG, WEBP, SVG, GIF oder PDF erlaubt.' }, 400)
  const buf = b64ToBuf(dataB64)
  const maxBytes = ext === 'pdf' ? PDF_MAX_BYTES : 2 * 1024 * 1024
  if (!buf.length || buf.length > maxBytes) return json({ ok: false, code: 'bad_request', message: ext === 'pdf' ? 'Datei fehlt oder groesser als 8 MB.' : 'Datei fehlt oder groesser als 2 MB.' }, 400)

  const path = `${IMG_DIR}/${Date.now()}-${safe}`
  const content = buf.toString('base64')
  const put = await ghApi(`/repos/${GH_REPO}/contents/${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: `upload: ${safe}`, content, branch: GH_BRANCH }),
  })
  if (!put.ok) {
    const errText = await put.text().catch(() => '')
    console.error('upload_image github error', put.status, errText.slice(0, 400))
    return json({ ok: false, code: 'github', message: `GitHub-Fehler (${put.status}).` }, 502)
  }
  return json({ ok: true, path: `/img/${path.split('/').pop()}` })
}

async function deleteImage(body: Record<string, unknown>) {
  const path = String(body.path ?? '')
  if (!path.startsWith('/img/') || path.includes('..')) return json({ ok: false, code: 'bad_request', message: 'Ungueltiger Pfad.' }, 400)
  const repoPath = `public${path}`
  const meta = await ghApi(`/repos/${GH_REPO}/contents/${repoPath}?ref=${GH_BRANCH}`)
  if (meta.status === 404) return json({ ok: true }) // already gone
  if (!meta.ok) return json({ ok: false, code: 'github', message: `GitHub-Fehler (${meta.status}).` }, 502)
  const sha = ((await meta.json()) as { sha?: string }).sha
  const del = await ghApi(`/repos/${GH_REPO}/contents/${repoPath}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: `delete: ${path}`, sha, branch: GH_BRANCH }),
  })
  if (!del.ok) return json({ ok: false, code: 'github', message: `GitHub-Fehler (${del.status}).` }, 502)
  return json({ ok: true })
}

export async function POST(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return json({}, 200)
  try {
    const body = req.body ? (await req.json()) as Record<string, unknown> : {}
    // 'me' handled without admin requirement (used by /admin loader to detect role)
    if (body.action === 'me') {
      const user = await getUser(req)
      return json({ ok: true, user: user ?? null, role: user?.role ?? null })
    }
    const auth = await requireAdmin(req)
    if ('resp' in auth) {
      return auth.resp
    }
    switch (body.action) {
      case 'stats': return await stats(body)
      case 'bookings': return await bookings(body)
      case 'create_block': return await createBlock(body, auth.user)
      case 'delete_block': return await deleteBlock(body)
      case 'day_data': return await dayData(body)
      case 'courts': return await courtsList()
      case 'save_court': return await saveCourt(body)
      case 'delete_court': return await deleteCourt(body)
      case 'zones': return await zonesList(body)
      case 'save_zone': return await saveZone({ ...body, _user_id: auth.user.id })
      case 'delete_zone': return await deleteZone({ ...body, _user_id: auth.user.id })
      case 'price_history': return await priceHistory(body)
      case 'upload_image': return await uploadImage(body)
      case 'delete_image': return await deleteImage(body)
      case 'partners': return await partnersList()
      case 'save_partner': return await savePartner(body)
      case 'delete_partner': return await deletePartner(body)
      case 'posts': return await postsList()
      case 'save_post': return await savePost(body, auth.user)
      case 'delete_post': return await deletePost(body)
      case 'events': return await eventsList()
      case 'save_event': return await saveEvent(body, auth.user)
      case 'delete_event': return await deleteEvent(body)
      case 'tournaments': return await tournamentsList()
      case 'save_tournament': return await saveTournament(body, auth.user)
      case 'delete_tournament': return await deleteTournament(body)
      case 'tournament_entries': return await tournamentEntries(body)
      case 'remove_entry': return await removeEntry(body)
      case 'mark_entry_paid': return await markEntryPaid(body)
      case 'legal': return await legalList()
      case 'save_legal': return await saveLegal(body)
      case 'hours': return await hoursList(body)
      case 'save_hours': return await saveHours(body)
      case 'messages': return await messagesList(body)
      case 'handle_message': return await handle_message(body)
      case 'delete_message': return await deleteMessage(body)
      default: return json({ ok: false, code: 'bad_action', message: 'Unbekannte Aktion.' }, 400)
    }
  } catch (e) {
    console.error('admin-api error', e instanceof Error ? `${e.message}\n${e.stack}` : e)
    return json({ ok: false, code: 'network', message: `Netzwerkfehler: ${e instanceof Error ? e.message : 'unbekannt'}` }, 500)
  }
}

// --- Kontakt-Nachrichten (обратная связь с главной) ---
async function messagesList(body: any): Promise<Response> {
  const limit = Math.min(Number(body.limit) || 100, 200)
  const r = await db().query(
    `select id, name, email, phone, message, handled, created_at from contact_messages order by created_at desc limit $1`,
    [limit],
  )
  return json({ ok: true, messages: r.rows })
}
async function handle_message(body: any): Promise<Response> {
  if (!body.id) return json({ ok: false, code: 'bad_request', message: 'id fehlt.' }, 400)
  const r = await db().query(`update contact_messages set handled = not handled where id = $1 returning handled`, [body.id])
  if (r.rows.length === 0) return json({ ok: false, code: 'not_found', message: 'Nachricht nicht gefunden.' }, 404)
  return json({ ok: true, handled: r.rows[0].handled })
}
async function deleteMessage(body: any): Promise<Response> {
  if (!body.id) return json({ ok: false, code: 'bad_request', message: 'id fehlt.' }, 400)
  await db().query(`delete from contact_messages where id = $1`, [body.id])
  return json({ ok: true, message: 'Nachricht geloescht.' })
}
