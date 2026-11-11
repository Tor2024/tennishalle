// admin-api — админские операции (owner/staff)
// @ts-nocheck
import { createClient } from "jsr:@supabase/supabase-js@2";

const TZ = "Europe/Berlin";
const pad2 = (n) => String(n).padStart(2, "0");

function berlinToUtc(dateKey, hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const noon = new Date(`${dateKey}T12:00:00Z`);
  const f = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });
  const [hh, mm] = f.format(noon).split(":").map(Number);
  const off = Math.round((Date.UTC(noon.getUTCFullYear(), noon.getUTCMonth(), noon.getUTCDate(), hh, mm) - noon.getTime()) / 60000);
  return new Date(new Date(`${dateKey}T${pad2(h)}:${pad2(m)}:00Z`).getTime() - off * 60000);
}
function genRef() {
  const A = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  const b = new Uint8Array(6);
  crypto.getRandomValues(b);
  let s = "";
  for (let i = 0; i < 6; i++) s += A[b[i] % A.length];
  return "TH-" + s;
}
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, prefer" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, prefer", "Access-Control-Allow-Methods": "POST, OPTIONS" } });
  try {
    const body = await req.json();
    const authHeader = req.headers.get("Authorization") ?? "";
    const asUser = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_ANON_KEY"), { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await asUser.auth.getUser();

    let role = null;
    if (user) {
      const admin0 = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
      const { data: prof } = await admin0.from("profiles").select("role").eq("id", user.id).maybeSingle();
      role = prof?.role ?? "member";
    }

    if (body.action === "me") return json({ ok: true, role });
    if (!user) return json({ ok: false, message: "Bitte anmelden." }, 401);
    if (role !== "owner" && role !== "staff") return json({ ok: false, message: "Kein Zugriff." }, 403);

    const admin = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));

    if (body.action === "set_status") {
      const { id, status } = body;
      if (!["confirmed", "cancelled", "completed"].includes(status)) return json({ ok: false, message: "Bad status" }, 400);
      const { error } = await admin.from("reservations").update({ status }).eq("id", id);
      return error ? json({ ok: false, message: error.message }, 500) : json({ ok: true });
    }
    if (body.action === "add_note") {
      const { id, note } = body;
      if (!note?.trim()) return json({ ok: false, message: "Leere Notiz." }, 400);
      const { error } = await admin.from("reservation_notes").insert({ reservation_id: id, note: note.trim() });
      return error ? json({ ok: false, message: error.message }, 500) : json({ ok: true });
    }
    if (body.action === "create_booking") {
      const { court_id, date, start_time, duration, name, email, phone, notes, status } = body;
      if (!court_id || !date || !start_time || !name || !email) return json({ ok: false, message: "Pflichtfelder fehlen." }, 400);
      const dur = Number(duration) || 60;
      const startAt = berlinToUtc(date, start_time);
      const endAt = new Date(startAt.getTime() + dur * 60000);
      for (let i = 0; i < 3; i++) {
        const { data, error } = await admin.from("reservations").insert({
          reference: genRef(), court_id,
          start_at: startAt.toISOString(), end_at: endAt.toISOString(),
          duration_minutes: dur,
          customer_name: name, customer_email: email,
          customer_phone: phone || null, notes: notes || null,
          fee_cents: 0, status: status === "cancelled" ? "cancelled" : "confirmed",
        }).select("reference").single();
        if (!error) return json({ ok: true, reference: data.reference });
        if (error.code === "23P01") return json({ ok: false, code: "conflict", message: "Zeit bereits belegt." }, 409);
      }
      return json({ ok: false, message: "Bitte erneut versuchen." }, 500);
    }
    if (body.action === "create_block") {
      const { court_id, date, start_time, end_time, reason } = body;
      if (!court_id || !date || !start_time || !end_time) return json({ ok: false, message: "Pflichtfelder fehlen." }, 400);
      const { error } = await admin.from("court_blocks").insert({
        court_id,
        starts_at: berlinToUtc(date, start_time).toISOString(),
        ends_at: berlinToUtc(date, end_time).toISOString(),
        reason: reason || null,
      });
      return error ? json({ ok: false, message: error.message }, 500) : json({ ok: true });
    }
    if (body.action === "delete_block") {
      const { error } = await admin.from("court_blocks").delete().eq("id", body.id);
      return error ? json({ ok: false, message: error.message }, 500) : json({ ok: true });
    }
    return json({ ok: false, message: "Unknown action" }, 400);
  } catch (e) {
    return json({ ok: false, message: String(e?.message ?? e) }, 500);
  }
});
