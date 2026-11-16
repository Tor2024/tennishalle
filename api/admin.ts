import { db, json, getUser, TZ } from './_lib.js'
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
  const kpi = await db.query<{
    b_today: string; r_today: string; b_week: string; r_week: string;
    b_month: string; r_month: string; b_year: string; r_year: string;
    b_total: string; r_total: string; c_total: string; c_cancelled: string; customers: string;
  }>(
    `select
      count(*) filter (where start_at >= date_trunc('day', now() at time zone $1)) as b_today,
      coalesce(sum(fee_cents) filter (where start_at >= date_trunc('day', now() at time zone $1) and status <> 'cancelled'), 0) as r_today,
      count(*) filter (where start_at >= date_trunc('day', now() at time zone $1) - interval '6 days') as b_week,
      coalesce(sum(fee_cents) filter (where start_at >= date_trunc('day', now() at time zone $1) - interval '6 days' and status <> 'cancelled'), 0) as r_week,
      count(*) filter (where start_at >= date_trunc('month', now() at time zone $1)) as b_month,
      coalesce(sum(fee_cents) filter (where start_at >= date_trunc('month', now() at time zone $1) and status <> 'cancelled'), 0) as r_month,
      count(*) filter (where start_at >= date_trunc('year', now() at time zone $1)) as b_year,
      coalesce(sum(fee_cents) filter (where start_at >= date_trunc('year', now() at time zone $1) and status <> 'cancelled'), 0) as r_year,
      count(*) as b_total,
      coalesce(sum(fee_cents) filter (where status <> 'cancelled'), 0) as r_total,
      count(*) filter (where status = 'cancelled') as c_cancelled,
      count(distinct customer_email) as customers,
      count(*) filter (where status = 'cancelled') as c_cancelled
    from reservations where start_at >= now() - interval '1 year'`,
    [TZ],
  )
  // per-day last 30 days (bookings + revenue + views)
  const perDay = await db.query<{ day: string; bookings: string; revenue: string; views: string }>(
    `with days as (
       select generate_series(date_trunc('day', now() at time zone $1) - interval '29 days', date_trunc('day', now() at time zone $1), interval '1 day') as d
     )
     select to_char(d, 'YYYY-MM-DD') as day,
       (select count(*) from reservations r where r.start_at >= d and r.start_at < d + interval '1 day') as bookings,
       (select coalesce(sum(r.fee_cents), 0) from reservations r where r.start_at >= d and r.start_at < d + interval '1 day' and r.status <> 'cancelled') as revenue,
       (select coalesce(sum(v.cnt), 0) from page_views v where v.day = d::date) as views
     from days order by d`,
    [TZ],
  )
  // per-month last 12 months
  const perMonth = await db.query<{ month: string; bookings: string; revenue: string }>(
    `with months as (
       select generate_series(date_trunc('month', now() at time zone $1) - interval '11 months', date_trunc('month', now() at time zone $1), interval '1 month') as m
     )
     select to_char(m, 'YYYY-MM') as month,
       (select count(*) from reservations r where r.start_at >= m and r.start_at < m + interval '1 month') as bookings,
       (select coalesce(sum(r.fee_cents), 0) from reservations r where r.start_at >= m and r.start_at < m + interval '1 month' and r.status <> 'cancelled') as revenue
     from months order by m`,
    [TZ],
  )
  // weekday distribution (0=Sunday)
  const perWeekday = await db.query<{ weekday: number; bookings: string }>(
    `select extract(dow from start_at at time zone $1)::int as weekday, count(*) as bookings
     from reservations where status <> 'cancelled' and start_at >= now() - interval '1 year'
     group by 1 order by 1`,
    [TZ],
  )
  // popular hours (start hour)
  const perHour = await db.query<{ hour: number; bookings: string }>(
    `select extract(hour from start_at at time zone $1)::int as hour, count(*) as bookings
     from reservations where status <> 'cancelled' and start_at >= now() - interval '1 year'
     group by 1 order by 1`,
    [TZ],
  )
  // court share
  const perCourt = await db.query<{ court_id: string; name: string; bookings: string; revenue: string }>(
    `select c.id as court_id, c.name, count(r.id) as bookings,
       coalesce(sum(r.fee_cents) filter (where r.status <> 'cancelled'), 0) as revenue
     from courts c left join reservations r on r.court_id = c.id and r.start_at >= now() - interval '1 year'
     where c.is_active group by c.id, c.name order by c.sort_order`,
  )
  // status counts
  const statuses = await db.query<{ status: string; cnt: string }>(
    `select status, count(*) as cnt from reservations group by 1`,
  )
  // booking lead time (created_at -> start_at) buckets
  const lead = await db.query<{ lead_bucket: string; cnt: string }>(
    `select case
       when lead < 1 then '<1 Tag' when lead < 3 then '1-2 Tage' when lead < 7 then '3-6 Tage'
       when lead < 14 then '1 Woche' when lead < 30 then '2-4 Wochen' else '>1 Monat' end as lead_bucket,
       count(*) as cnt
     from (select extract(epoch from (start_at - created_at)) / 86400.0 as lead from reservations) t
     group by 1`,
  )
  // top customers
  const topCustomers = await db.query<{ customer_name: string; customer_email: string; bookings: string; revenue: string }>(
    `select customer_name, customer_email, count(*) as bookings,
       coalesce(sum(fee_cents) filter (where status <> 'cancelled'), 0) as revenue
     from reservations group by customer_name, customer_email order by bookings desc, revenue desc limit 8`,
  )
  // utilization: booked confirmed slot-halfhours in next 30d vs open slots from operating_hours
  const util = await db.query<{ open_slots: string; booked_slots: string }>(
    `with open as (
       select count(*) as n from operating_hours oh, generate_series(0, 29) g
       where oh.weekday = extract(dow from (current_date + g) at time zone $1)::int
     ), booked as (
       select coalesce(sum(duration_minutes / 30), 0) as n from reservations
       where status = 'confirmed' and start_at >= now() and start_at < now() + interval '30 days'
     )
     select open.n as open_slots, booked.n as booked_slots from open, booked`,
    [TZ],
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
    perDay, perMonth, perWeekday, perHour, perCourt, statuses, lead, topCustomers,
  })
}

/* ---------- bookings list (admin) ---------- */

async function bookings(body: Record<string, unknown>) {
  const from = typeof body.from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.from) ? body.from : null
  const to = typeof body.to === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.to) ? body.to : null
  const status = typeof body.status === 'string' && body.status ? body.status : null
  const courtId = typeof body.court_id === 'string' && body.court_id ? body.court_id : null
  const rows = await db.query(
    `select r.*, c.name as court_name, v.name as venue_name, c.court_number
     from reservations r join courts c on c.id = r.court_id join venues v on v.id = c.venue_id
     where ($1::timestamptz is null or r.start_at >= $1) and ($2::timestamptz is null or r.start_at < $2)
       and ($3::text is null or r.status = $3) and ($4::uuid is null or r.court_id = $4)
     order by r.start_at desc limit 500`,
    [from ? `${from}T00:00:00Z` : null, to ? `${to}T23:59:59Z` : null, status, courtId],
  )
  return json({ ok: true, reservations: rows })
}

/* ---------- blocks (create/delete) ---------- */

async function createBlock(body: Record<string, unknown>) {
  const courtId = typeof body.court_id === 'string' ? body.court_id : ''
  const date = typeof body.date === 'string' ? body.date : ''
  const startTime = typeof body.start_time === 'string' ? body.start_time : '06:00'
  const endTime = typeof body.end_time === 'string' ? body.end_time : '23:00'
  const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : 'Gesperrt'
  if (!courtId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return json({ ok: false, code: 'bad_request', message: 'Bitte alle Pflichtfelder ausfuellen.' }, 400)
  }
  const user = arguments[2] as SessionUser
  await db.query(
    `insert into court_blocks (court_id, starts_at, ends_at, reason, created_by)
     values ($1, $2::timestamptz, $3::timestamptz, $4, $5)`,
    [courtId, `${date}T${startTime}:00`, `${date}T${endTime}:00`, reason, user.id],
  )
  return json({ ok: true, message: 'Zeit gesperrt.' })
}

async function deleteBlock(body: Record<string, unknown>) {
  const id = typeof body.id === 'string' ? body.id : ''
  if (!id) return json({ ok: false, code: 'bad_request', message: 'Fehlende ID.' }, 400)
  await db.query(`delete from court_blocks where id = $1`, [id])
  return json({ ok: true })
}

/* ---------- day data for calendar ---------- */

async function dayData(body: Record<string, unknown>) {
  const from = typeof body.from === 'string' ? body.from : ''
  const to = typeof body.to === 'string' ? body.to : ''
  if (!isTs(from) || !isTs(to)) return json({ ok: false, code: 'bad_request', message: 'Ungueltiger Zeitraum.' }, 400)
  const [reservations, blocks] = await Promise.all([
    db.query(
      `select r.*, c.name as court_name, c.court_number from reservations r join courts c on c.id = r.court_id
       where r.status <> 'cancelled' and r.end_at > $1 and r.start_at < $2 order by r.start_at`,
      [from, to],
    ),
    db.query(
      `select b.*, c.name as court_name from court_blocks b join courts c on c.id = b.court_id
       where b.ends_at > $1 and b.starts_at < $2 order by b.starts_at`,
      [from, to],
    ),
  ])
  return json({ ok: true, reservations, blocks })
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
      default: return json({ ok: false, code: 'bad_action', message: 'Unbekannte Aktion.' }, 400)
    }
  } catch (e) {
    console.error('admin-api error', e)
    return json({ ok: false, code: 'network', message: 'Netzwerkfehler. Bitte erneut versuchen.' }, 500)
  }
}
