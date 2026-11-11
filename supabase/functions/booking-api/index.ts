// booking-api — публичное бронирование
// @ts-nocheck
import { createClient } from "jsr:@supabase/supabase-js@2";

const TZ = "Europe/Berlin";
const pad2 = (n) => String(n).padStart(2, "0");
const toMin = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
const toHHMM = (min) => `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`;

function berlinToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}
function berlinWeekday(dateKey) {
  return new Date(`${dateKey}T12:00:00Z`).getUTCDay();
}
function getBerlinOffsetMin(d) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });
  const [hh, mm] = f.format(d).split(":").map(Number);
  const asUtc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hh, mm);
  return Math.round((asUtc - d.getTime()) / 60000);
}
function berlinToUtc(dateKey, hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const noon = new Date(`${dateKey}T12:00:00Z`);
  const off = getBerlinOffsetMin(noon);
  return new Date(new Date(`${dateKey}T${pad2(h)}:${pad2(m)}:00Z`).getTime() - off * 60000);
}
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, prefer" } });
}
function genRef() {
  const A = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  const b = new Uint8Array(6);
  crypto.getRandomValues(b);
  let s = "";
  for (let i = 0; i < 6; i++) s += A[b[i] % A.length];
  return s;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, prefer", "Access-Control-Allow-Methods": "POST, OPTIONS" } });
  try {
    const body = await req.json();
    const admin = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
    const authHeader = req.headers.get("Authorization") ?? "";
    const asUser = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_ANON_KEY"), { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await asUser.auth.getUser();

    if (body.action === "month_overview") return await monthOverview(admin, body);
    if (body.action === "availability") return await availability(admin, body);
    if (body.action === "create") return await createBooking(admin, body, user);
    if (body.action === "member_cancel") return await memberCancel(admin, body, user);
    return json({ ok: false, code: "bad_action", message: "Unknown action" }, 400);
  } catch (e) {
    return json({ ok: false, code: "network", message: String(e?.message ?? e) }, 500);
  }
});

async function availability(admin, body) {
  const { court_id, date, duration } = body;
  if (!court_id || !date) return json({ ok: false, code: "bad_request", message: "court_id/date required" }, 400);

  const [{ data: court }, { data: hours }, { data: zones }, { data: settings }] = await Promise.all([
    admin.from("courts").select("*").eq("id", court_id).maybeSingle(),
    admin.from("operating_hours").select("*").eq("court_id", court_id).eq("weekday", berlinWeekday(date)).maybeSingle(),
    admin.from("price_zones").select("*").eq("court_id", court_id),
    admin.from("club_settings").select("booking_window_days").eq("id", 1).maybeSingle(),
  ]);
  if (!court) return json({ ok: false, code: "bad_request", message: "Platz nicht gefunden" }, 404);
  if (!hours) return json({ ok: true, times: [], closed: false });

  const today = berlinToday();
  if (date < today) return json({ ok: true, times: [], closed: false });

  const dayStart = berlinToUtc(date, "00:00");
  const dayEnd = new Date(dayStart.getTime() + 36 * 3600000);

  const [{ data: blocks }, { data: reservations }] = await Promise.all([
    admin.from("court_blocks").select("starts_at, ends_at").eq("court_id", court_id)
      .gt("ends_at", dayStart.toISOString()).lt("starts_at", dayEnd.toISOString()),
    admin.from("reservations").select("start_at, end_at").eq("court_id", court_id).eq("status", "confirmed")
      .gt("end_at", dayStart.toISOString()).lt("start_at", dayEnd.toISOString()),
  ]);

  const weekday = berlinWeekday(date);
  const openMin = toMin(hours.opens);
  const closeMin = toMin(hours.closes);
  const durationMin = Number(duration) || 60;

  const slots = [];
  for (let m = openMin; m + 30 <= closeMin; m += 30) {
    const startHHMM = toHHMM(m);
    const endHHMM = toHHMM(m + durationMin);
    const startAt = berlinToUtc(date, startHHMM);
    if (m + durationMin > closeMin) continue; // слот не влезает — не показывать
    const endAt = berlinToUtc(date, endHHMM);

    const isPast = endAt.getTime() < Date.now() + 3600000;
    const blocked = (blocks ?? []).some((b) => new Date(b.starts_at) < endAt && new Date(b.ends_at) > startAt);
    const taken = (reservations ?? []).some((r) => new Date(r.start_at) < endAt && new Date(r.end_at) > startAt);

    const zone = (zones ?? []).filter((z) => z.weekdays.includes(weekday))
      .sort((a, b) => a.sort_order - b.sort_order)
      .find((z) => z.start_time <= startHHMM && startHHMM < z.end_time);

    slots.push({ time: startHHMM, available: !isPast && !blocked && !taken, price: zone ? zone.price_cents * durationMin / 60 : null });
  }
  return json({ ok: true, times: slots, closed: false });
}

async function createBooking(admin, body, user) {
  const { court_id, date, start_time, duration, name, email, phone, notes, idempotency_key, website_alt } = body;

  if (website_alt) return json({ ok: false, code: "spam", message: "Rejected" }, 400);
  if (!court_id || !date || !start_time || !name || !email)
    return json({ ok: false, code: "bad_request", message: "Bitte alle Pflichtfelder ausfuellen." }, 400);
  if (!user) return json({ ok: false, code: "unauthorized", message: "Bitte anmelden, um zu buchen." }, 401);

  const [{ data: settings }, { data: hours }, { data: zones }, { data: court }] = await Promise.all([
    admin.from("club_settings").select("*").eq("id", 1).maybeSingle(),
    admin.from("operating_hours").select("*").eq("court_id", court_id).eq("weekday", berlinWeekday(date)).maybeSingle(),
    admin.from("price_zones").select("*").eq("court_id", court_id),
    admin.from("courts").select("*").eq("id", court_id).maybeSingle(),
  ]);
  if (!court || !hours) return json({ ok: false, code: "bad_request", message: "Platz nicht gefunden" }, 404);

  const dur = Number(duration) || 60;
  const allowed = settings?.allowed_durations ?? [60, 90, 120];
  if (!allowed.includes(dur)) return json({ ok: false, code: "bad_request", message: "Dauer nicht erlaubt." }, 400);

  const today = berlinToday();
  if (date < today) return json({ ok: false, code: "too_soon", message: "Datum liegt in der Vergangenheit." }, 400);

  const startMin = toMin(start_time);
  const closeMin = toMin(hours.closes);
  if (startMin < toMin(hours.opens) || startMin + dur > closeMin)
    return json({ ok: false, code: "outside_hours", message: "Zeit ausserhalb der Oeffnungszeiten." }, 400);

  const startAt = berlinToUtc(date, start_time);
  const endAt = new Date(startAt.getTime() + dur * 60000);

  if (idempotency_key) {
    const { data: dupe } = await admin.from("reservations").select("reference")
      .eq("customer_user_id", user.id).eq("court_id", court_id).eq("start_at", startAt.toISOString())
      .gte("created_at", new Date(Date.now() - 120000).toISOString()).maybeSingle();
    if (dupe) return json({ ok: true, reservation: { reference: dupe.reference } });
  }

  const weekday = berlinWeekday(date);
  const zone = (zones ?? []).filter((z) => z.weekdays.includes(weekday))
    .sort((a, b) => a.sort_order - b.sort_order)
    .find((z) => z.start_time <= start_time && start_time < z.end_time);
  const feeCents = zone?.price_cents ? Math.round(zone.price_cents * dur / 60) : 0;

  for (let attempt = 0; attempt < 3; attempt++) {
    const reference = "TH-" + genRef();
    const { data: inserted, error } = await admin.from("reservations").insert({
      reference, court_id,
      start_at: startAt.toISOString(), end_at: endAt.toISOString(),
      duration_minutes: dur,
      customer_user_id: user.id,
      customer_name: name, customer_email: email,
      customer_phone: phone || null, notes: notes || null,
      fee_cents: feeCents, status: "confirmed", created_by: user.id,
    }).select("reference, fee_cents").single();
    if (!error) {
      const { data: full } = await admin.from("reservations").select("reference, start_at, end_at, fee_cents, status, courts(name, image_url, venues(name))").eq("reference", inserted.reference).maybeSingle();
      return json({ ok: true, reservation: {
        reference: full?.reference ?? inserted.reference,
        status: full?.status ?? "confirmed",
        court_name: full?.courts?.name ?? "",
        venue_name: full?.courts?.venues?.name ?? "",
        start_at: full?.start_at, end_at: full?.end_at,
        price: (full?.fee_cents ?? feeCents) / 100,
        currency: "EUR",
      } });
    }
    if (error.code === "23P01") return json({ ok: false, code: "conflict", message: "Diese Zeit ist leider nicht mehr verfuegbar." }, 409);
    if (String(error.message ?? "").includes("duplicate key")) continue;
    return json({ ok: false, code: "network", message: error.message }, 500);
  }
  return json({ ok: false, code: "network", message: "Bitte erneut versuchen." }, 500);
}

async function monthOverview(admin: any, body: any): Promise<Response> {
  const { from, days } = body;
  const today = berlinToday();
  const start = from || today;
  const nDays = Math.min(Number(days) || 31, 400);

  const [{ data: courts }, { data: hours }, { data: settings }] = await Promise.all([
    admin.from("courts").select("id").eq("is_active", true),
    admin.from("operating_hours").select("*"),
    admin.from("club_settings").select("booking_window_days").eq("id", 1).maybeSingle(),
  ]);
  const courtIds = (courts ?? []).map((c: any) => c.id);

  const rangeStart = berlinToUtc(start, "00:00");
  const rangeEnd = new Date(rangeStart.getTime() + (nDays + 1) * 86400000);

  const [{ data: reservations }, { data: blocks }] = await Promise.all([
    admin.from("reservations").select("court_id, start_at, end_at").eq("status", "confirmed")
      .gt("end_at", rangeStart.toISOString()).lt("start_at", rangeEnd.toISOString()),
    admin.from("court_blocks").select("court_id, starts_at, ends_at")
      .gt("ends_at", rangeStart.toISOString()).lt("starts_at", rangeEnd.toISOString()),
  ]);

  const out: { date: string; total: number; free: number }[] = [];
  for (let i = 0; i < nDays; i++) {
    const date = new Date(new Date(`${start}T12:00:00Z`).getTime() + i * 86400000).toISOString().slice(0, 10);
    if (date < today) { out.push({ date, total: 0, free: 0 }); continue; }
    const weekday = berlinWeekday(date);
    let total = 0, free = 0;
    const dayStart = berlinToUtc(date, "00:00");
    const dayEnd = new Date(dayStart.getTime() + 36 * 3600000);
    for (const cid of courtIds) {
      const h = (hours ?? []).find((x: any) => x.court_id === cid && x.weekday === weekday);
      if (!h) continue;
      const openMin = toMin(h.opens), closeMin = toMin(h.closes);
      // для сегодняшнего дня считать только будущие слоты (как в availability: +1h запас)
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
      for (const r of reservations ?? []) {
        if (r.court_id !== cid) continue;
        const rs = new Date(r.start_at), re = new Date(r.end_at);
        if (re <= dayStart || rs >= dayEnd) continue;
        const s2 = Math.max(0, Math.floor((Math.max(rs.getTime(), dayStart.getTime()) - dayStart.getTime()) / 60000) - openMin);
        const e2 = Math.min(closeMin - openMin, Math.floor((Math.min(re.getTime(), dayEnd.getTime()) - dayStart.getTime()) / 60000) - openMin);
        if (e2 > s2) busy.push([s2, e2]);
      }
      for (const b of blocks ?? []) {
        if (b.court_id !== cid) continue;
        const bs = new Date(b.starts_at), be = new Date(b.ends_at);
        if (be <= dayStart || bs >= dayEnd) continue;
        const s2 = Math.max(0, Math.floor((Math.max(bs.getTime(), dayStart.getTime()) - dayStart.getTime()) / 60000) - openMin);
        const e2 = Math.min(closeMin - openMin, Math.floor((Math.min(be.getTime(), dayEnd.getTime()) - dayStart.getTime()) / 60000) - openMin);
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

async function memberCancel(admin, body, user) {
  if (!user) return json({ ok: false, code: "unauthorized", message: "Bitte anmelden." }, 401);
  const { id } = body;
  const { data: res } = await admin.from("reservations").select("start_at, status, customer_user_id").eq("id", id).maybeSingle();
  if (!res || res.customer_user_id !== user.id) return json({ ok: false, code: "not_found", message: "Nicht gefunden." }, 404);
  if (res.status !== "confirmed") return json({ ok: false, code: "bad_status", message: "Bereits storniert." }, 400);

  const { data: settings } = await admin.from("club_settings").select("member_cancel_cutoff_hours").eq("id", 1).maybeSingle();
  const cutoff = settings?.member_cancel_cutoff_hours ?? 24;
  if (new Date(res.start_at).getTime() - Date.now() < cutoff * 3600000)
    return json({ ok: false, code: "cutoff", message: `Stornierung weniger als ${cutoff}h vorher nicht moeglich.` }, 400);

  const { error } = await admin.from("reservations").update({ status: "cancelled" }).eq("id", id);
  return error ? json({ ok: false, code: "network", message: error.message }, 500) : json({ ok: true });
}
