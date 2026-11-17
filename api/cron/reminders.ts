// cron: напоминания о бронях за ~24 часа (ежечасно из vercel.json crons)
// Vercel Cron шлёт GET с Authorization: Bearer $CRON_SECRET (если переменная задана)
import { db, json, sendBookingReminderEmail } from "../_lib.js";

export const config = { runtime: "nodejs" };

export async function GET(req: Request): Promise<Response> {
  const auth = req.headers.get("authorization") ?? "";
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return json({ ok: false, code: "unauthorized", message: "Unauthorized" }, 401);
  }
  try {
    const p = db();
    const rows = await p.query<{
      id: string; reference: string; start_at: string; end_at: string;
      customer_name: string | null; email: string;
      court_name: string; venue_name: string;
    }>(
      `select r.id, r.reference, r.start_at, r.end_at, r.customer_name, u.email,
              c.name as court_name, v.name as venue_name
         from reservations r
         join courts c on c.id = r.court_id
         join venues v on v.id = c.venue_id
         join app_users u on u.id = r.customer_user_id
        where r.status = 'confirmed'
          and r.reminder_sent = false
          and r.start_at >= now() + interval '23 hours'
          and r.start_at < now() + interval '25 hours'`,
    );
    let sent = 0;
    for (const r of rows.rows) {
      const ok = await sendBookingReminderEmail({
        to: r.email,
        name: r.customer_name ?? "",
        reference: r.reference,
        courtName: r.court_name,
        venueName: r.venue_name,
        startAt: r.start_at,
        endAt: r.end_at,
      });
      if (ok) {
        sent++;
        await p.query(`update reservations set reminder_sent = true where id = $1`, [r.id]);
      }
    }
    return json({ ok: true, sent });
  } catch (e) {
    return json({ ok: false, message: String((e as Error)?.message ?? e) }, 500);
  }
}
