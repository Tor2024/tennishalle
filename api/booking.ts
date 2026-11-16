// booking-api — публичное бронирование (порт Supabase Edge Function на Vercel Function + pg)
import {
  db, TZ, pad2, toMin, toHHMM,
  berlinToday, berlinWeekday, berlinToUtc, genRef,
  json, getUser,
} from "./_lib.js";

export const config = { runtime: "nodejs" }; // Fluid Compute, streaming OK

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
    const user = await getUser(req);

    if (body.action === "month_overview") return await monthOverview(body);
    if (body.action === "availability") return await availability(body);
    if (body.action === "create") return await createBooking(body, user);
    if (body.action === "member_cancel") return await memberCancel(body, user);
    if (body.action === "my_bookings") return await myBookings(body, user);
    return json({ ok: false, code: "bad_action", message: "Unknown action" }, 400);
  } catch (e) {
    return json({ ok: false, code: "network", message: String((e as Error)?.message ?? e) }, 500);
  }
}

async function availability(body: any): Promise<Response> {
  const { court_id, date, duration } = body;
  if (!court_id || !date) return json({ ok: false, code: "bad_request", message: "court_id/date required" }, 400);

  const p = db();
  const [courtRes, hoursRes, zonesRes, settingsRes] = await Promise.all([
    p.query(`select * from courts where id = $1`, [court_id]),
    p.query(`select * from operating_hours where court_id = $1 and weekday = $2`, [court_id, berlinWeekday(date)]),
    p.query(`select * from price_zones where court_id = $1 order by sort_order`, [court_id]),
    p.query(`select booking_window_days from club_settings where id = 1`),
  ]);
  const court = courtRes.rows[0];
  const hours = hoursRes.rows[0];
  const zones = zonesRes.rows;
  if (!court) return json({ ok: false, code: "bad_request", message: "Platz nicht gefunden" }, 404);
  if (!hours) return json({ ok: true, times: [], closed: false });

  const today = berlinToday();
  if (date < today) return json({ ok: true, times: [], closed: false });

  const dayStart = berlinToUtc(date, "00:00");
  const dayEnd = new Date(dayStart.getTime() + 36 * 3600000);

  const [blocksRes, reservationsRes] = await Promise.all([
    p.query(`select starts_at, ends_at from court_blocks where court_id = $1 and ends_at > $2 and starts_at < $3`, [court_id, dayStart.toISOString(), dayEnd.toISOString()]),
    p.query(`select start_at, end_at from reservations where court_id = $1 and status = 'confirmed' and end_at > $2 and start_at < $3`, [court_id, dayStart.toISOString(), dayEnd.toISOString()]),
  ]);
  const blocks = blocksRes.rows;
  const reservations = reservationsRes.rows;

  const weekday = berlinWeekday(date);
  const openMin = toMin(hours.opens);
  const closeMin = toMin(hours.closes);
  const durationMin = Number(duration) || 60;

  const slots: { time: string; available: boolean; price: number | null }[] = [];
  for (let m = openMin; m + 30 <= closeMin; m += 30) {
    const startHHMM = toHHMM(m);
    const endHHMM = toHHMM(m + durationMin);
    const startAt = berlinToUtc(date, startHHMM);
    if (m + durationMin > closeMin) continue; // слот не влезает — не показывать
    const endAt = berlinToUtc(date, endHHMM);

    const isPast = endAt.getTime() < Date.now() + 3600000;
    const blocked = blocks.some((b: any) => new Date(b.starts_at) < endAt && new Date(b.ends_at) > startAt);
    const taken = reservations.some((r: any) => new Date(r.start_at) < endAt && new Date(r.end_at) > startAt);

    const zone = zones
      .filter((z: any) => z.weekdays.includes(weekday))
      .find((z: any) => z.start_time.slice(0, 5) <= startHHMM && startHHMM < z.end_time.slice(0, 5));

    slots.push({ time: startHHMM, available: !isPast && !blocked && !taken, price: zone ? (zone.price_cents * durationMin) / 60 : null });
  }
  return json({ ok: true, times: slots, closed: false });
}

async function createBooking(body: any, user: { id: string } | null): Promise<Response> {
  const { court_id, date, start_time, duration, name, email, phone, notes, idempotency_key, website_alt } = body;

  if (website_alt) return json({ ok: false, code: "spam", message: "Rejected" }, 400);
  if (!court_id || !date || !start_time || !name || !email)
    return json({ ok: false, code: "bad_request", message: "Bitte alle Pflichtfelder ausfuellen." }, 400);
  if (!user) return json({ ok: false, code: "unauthorized", message: "Bitte anmelden, um zu buchen." }, 401);

  const p = db();
  const [settingsRes, hoursRes, zonesRes, courtRes] = await Promise.all([
    p.query(`select * from club_settings where id = 1`),
    p.query(`select * from operating_hours where court_id = $1 and weekday = $2`, [court_id, berlinWeekday(date)]),
    p.query(`select * from price_zones where court_id = $1 order by sort_order`, [court_id]),
    p.query(`select * from courts where id = $1`, [court_id]),
  ]);
  const settings = settingsRes.rows[0];
  const hours = hoursRes.rows[0];
  const zones = zonesRes.rows;
  const court = courtRes.rows[0];
  if (!court || !hours) return json({ ok: false, code: "bad_request", message: "Platz nicht gefunden" }, 404);

  const dur = Number(duration) || 30;
  const allowed = settings?.allowed_durations ?? [30, 60, 90, 120, 150, 180, 210, 240];
  if (!allowed.includes(dur) && (dur < 30 || dur % 30 !== 0)) return json({ ok: false, code: "bad_request", message: "Dauer nicht erlaubt." }, 400);

  const today = berlinToday();
  if (date < today) return json({ ok: false, code: "too_soon", message: "Datum liegt in der Vergangenheit." }, 400);

  const startMin = toMin(start_time);
  const closeMin = toMin(hours.closes);
  if (startMin < toMin(hours.opens) || startMin + dur > closeMin)
    return json({ ok: false, code: "outside_hours", message: "Zeit ausserhalb der Oeffnungszeiten." }, 400);

  const startAt = berlinToUtc(date, start_time);
  const endAt = new Date(startAt.getTime() + dur * 60000);

  if (idempotency_key) {
    const dupeRes = await p.query<{ reference: string }>(
      `select reference from reservations
        where customer_user_id = $1 and court_id = $2 and start_at = $3 and created_at >= $4
        limit 1`,
      [user.id, court_id, startAt.toISOString(), new Date(Date.now() - 120000).toISOString()],
    );
    const dupe = dupeRes.rows[0];
    if (dupe) return json({ ok: true, reservation: { reference: dupe.reference } });
  }

  const weekday = berlinWeekday(date);
  const zone = zones
    .filter((z: any) => z.weekdays.includes(weekday))
    .find((z: any) => z.start_time.slice(0, 5) <= start_time && start_time < z.end_time.slice(0, 5));
  const feeCents = zone?.price_cents ? Math.round((zone.price_cents * dur) / 60) : 0;

  for (let attempt = 0; attempt < 3; attempt++) {
    const reference = "TH-" + genRef();
    try {
      const inserted = await p.query<{ reference: string; fee_cents: number }>(
        `insert into reservations
           (reference, court_id, start_at, end_at, duration_minutes, customer_user_id, customer_name, customer_email, customer_phone, notes, fee_cents, status, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'confirmed',$12)
         returning reference, fee_cents`,
        [reference, court_id, startAt.toISOString(), endAt.toISOString(), dur, user.id, name, email, phone || null, notes || null, feeCents, user.id],
      );
      const ins = inserted.rows[0];
      const fullRes = await p.query<any>(
        `select r.reference, r.start_at, r.end_at, r.fee_cents, r.status,
                c.name as court_name, c.image_url, v.name as venue_name
           from reservations r
           join courts c on c.id = r.court_id
           join venues v on v.id = c.venue_id
          where r.reference = $1`,
        [ins.reference],
      );
      const full = fullRes.rows[0];
      return json({ ok: true, reservation: {
        reference: full?.reference ?? ins.reference,
        status: full?.status ?? "confirmed",
        court_name: full?.court_name ?? "",
        venue_name: full?.venue_name ?? "",
        start_at: full?.start_at, end_at: full?.end_at,
        price: (full?.fee_cents ?? feeCents) / 100,
        currency: "EUR",
      } });
    } catch (e: any) {
      if (e.code === "23P01") return json({ ok: false, code: "conflict", message: "Diese Zeit ist leider nicht mehr verfuegbar." }, 409);
      if (String(e.message ?? "").includes("duplicate key")) continue;
      return json({ ok: false, code: "network", message: e.message }, 500);
    }
  }
  return json({ ok: false, code: "network", message: "Bitte erneut versuchen." }, 500);
}

async function monthOverview(body: any): Promise<Response> {
  const { from, days } = body;
  const today = berlinToday();
  const start = from || today;
  const nDays = Math.min(Number(days) || 31, 400);

  const p = db();
  const [courtsRes, hoursRes] = await Promise.all([
    p.query(`select id from courts where is_active = true`),
    p.query(`select * from operating_hours`),
  ]);
  const courtIds = courtsRes.rows.map((c: any) => c.id);
  const hours = hoursRes.rows;

  const rangeStart = berlinToUtc(start, "00:00");
  const rangeEnd = new Date(rangeStart.getTime() + (nDays + 1) * 86400000);

  const [reservationsRes, blocksRes] = await Promise.all([
    p.query(`select court_id, start_at, end_at from reservations where status = 'confirmed' and end_at > $1 and start_at < $2`, [rangeStart.toISOString(), rangeEnd.toISOString()]),
    p.query(`select court_id, starts_at, ends_at from court_blocks where ends_at > $1 and starts_at < $2`, [rangeStart.toISOString(), rangeEnd.toISOString()]),
  ]);
  const reservations = reservationsRes.rows;
  const blocks = blocksRes.rows;

  const out: { date: string; total: number; free: number }[] = [];
  for (let i = 0; i < nDays; i++) {
    const date = new Date(new Date(`${start}T12:00:00Z`).getTime() + i * 86400000).toISOString().slice(0, 10);
    if (date < today) { out.push({ date, total: 0, free: 0 }); continue; }
    const weekday = berlinWeekday(date);
    let total = 0, free = 0;
    const dayStart = berlinToUtc(date, "00:00");
    const dayEnd = new Date(dayStart.getTime() + 36 * 3600000);
    for (const cid of courtIds) {
      const h = hours.find((x: any) => x.court_id === cid && x.weekday === weekday);
      if (!h) continue;
      const openMin = toMin(h.opens), closeMin = toMin(h.closes);
      // для сегодняшнего дня считать только будущие слоты (+1h запас как в availability)
      let effOpen = openMin;
      if (date === today) {
        const f = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });
        const [hh, mm] = f.format(new Date()).split(":").map(Number);
        const nowMin = hh * 60 + mm + 60; // +1h как в availability
        effOpen = Math.max(openMin, Math.ceil(nowMin / 30) * 30);
      }
      const slots = Math.max(0, Math.floor((closeMin - effOpen) / 30));
      total += slots;
      const busy: [number, number][] = [];
      for (const r of reservations) {
        if (r.court_id !== cid) continue;
        const rs = new Date(r.start_at), re = new Date(r.end_at);
        if (re <= dayStart || rs >= dayEnd) continue;
        // ФИКС бага оригинала: сегодня используем effOpen, не openMin → free не уходит в минус
        const base = date === today ? effOpen : openMin;
        const s2 = Math.max(0, Math.floor((Math.max(rs.getTime(), dayStart.getTime()) - dayStart.getTime()) / 60000) - base);
        const e2 = Math.min(closeMin - base, Math.floor((Math.min(re.getTime(), dayEnd.getTime()) - dayStart.getTime()) / 60000) - base);
        if (e2 > s2) busy.push([s2, e2]);
      }
      for (const b of blocks) {
        if (b.court_id !== cid) continue;
        const bs = new Date(b.starts_at), be = new Date(b.ends_at);
        if (be <= dayStart || bs >= dayEnd) continue;
        const base = date === today ? effOpen : openMin;
        const s2 = Math.max(0, Math.floor((Math.max(bs.getTime(), dayStart.getTime()) - dayStart.getTime()) / 60000) - base);
        const e2 = Math.min(closeMin - base, Math.floor((Math.min(be.getTime(), dayEnd.getTime()) - dayStart.getTime()) / 60000) - base);
        if (e2 > s2) busy.push([s2, e2]);
      }
      busy.sort((a, b) => a[0] - b[0]);
      let covered = 0, cur = -1;
      for (const [s2, e2] of busy) { if (cur < s2) { covered += e2 - s2; cur = e2; } else if (e2 > cur) { covered += e2 - cur; cur = e2; } }
      free += slots - covered / 30;
    }
    out.push({ date, total: Math.round(total), free: Math.round(free) });
  }
  return json({ ok: true, days: out });
}

async function memberCancel(body: any, user: { id: string } | null): Promise<Response> {
  if (!user) return json({ ok: false, code: "unauthorized", message: "Bitte anmelden." }, 401);
  const { id } = body;
  const p = db();
  const resRes = await p.query<{ start_at: string; status: string; customer_user_id: string }>(
    `select start_at, status, customer_user_id from reservations where id = $1`, [id]);
  const res = resRes.rows[0];
  if (!res || res.customer_user_id !== user.id) return json({ ok: false, code: "not_found", message: "Nicht gefunden." }, 404);
  if (res.status !== "confirmed") return json({ ok: false, code: "bad_status", message: "Bereits storniert." }, 400);

  const settingsRes = await p.query<{ member_cancel_cutoff_hours: number }>(
    `select member_cancel_cutoff_hours from club_settings where id = 1`);
  const cutoff = settingsRes.rows[0]?.member_cancel_cutoff_hours ?? 24;
  if (new Date(res.start_at).getTime() - Date.now() < cutoff * 3600000)
    return json({ ok: false, code: "cutoff", message: `Stornierung weniger als ${cutoff}h vorher nicht moeglich.` }, 400);

  try {
    await p.query(`update reservations set status = 'cancelled' where id = $1`, [id]);
    return json({ ok: true });
  } catch (e: any) {
    return json({ ok: false, code: "network", message: e.message }, 500);
  }
}

async function myBookings(body: any, user: { id: string } | null): Promise<Response> {
  if (!user) return json({ ok: false, code: "unauthorized", message: "Bitte anmelden." }, 401);
  const p = db();
  try {
    const r = await p.query(
      `select * from reservations where customer_user_id = $1 order by start_at desc`, [user.id]);
    // price-change notices: price change of this court between booking creation and play date
    const changes = await p.query(
      `select distinct on (l.court_id, to_char(res.start_at at time zone 'Europe/Berlin', 'YYYY-MM-DD')) l.court_id, to_char(res.start_at at time zone 'Europe/Berlin', 'YYYY-MM-DD') as play_day, l.changed_at, l.old_price_cents, l.new_price_cents, l.zone_label
       from price_change_log l
       join reservations res on res.court_id = l.court_id and res.customer_user_id = $1
       where l.changed_at > res.created_at and l.changed_at < res.start_at
       order by l.court_id, to_char(res.start_at at time zone 'Europe/Berlin', 'YYYY-MM-DD'), l.changed_at desc`,
      [user.id]);
    const notices: Record<string, any> = {};
    for (const c of changes.rows as any[]) {
      notices[`${c.court_id}|${c.play_day}`] = { changed_at: c.changed_at, old_price_cents: c.old_price_cents, new_price_cents: c.new_price_cents, zone_label: c.zone_label };
    }
    return json({ ok: true, reservations: r.rows, price_notices: notices });
  } catch (e: any) {
    return json({ ok: false, code: "network", message: e.message }, 500);
  }
}
