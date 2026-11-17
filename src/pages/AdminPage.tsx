import { useEffect, useMemo, useState } from 'react'
import { RichText } from '../lib/richText'
import { Link, useNavigate } from 'react-router-dom'
import {
  api,
  apiAdmin,
  apiAuth,
  formatPrice,
  getBootstrap,
  type AppUser,
  type ClubSettings,
  type Court,
  type Venue,
} from '../lib/api'

const TZ = 'Europe/Berlin'

const STATUS_CLS: Record<string, string> = {
  pending: 'bg-accent-500/15 text-accent-200 border-accent-500/40',
  confirmed: 'bg-primary-500/15 text-primary-400 border-primary-500/40',
  completed: 'bg-secondary-500/20 text-secondary-200 border-secondary-500/50',
  cancelled: 'bg-secondary-900/60 text-secondary-300 border-secondary-700',
  no_show: 'bg-secondary-900/60 text-secondary-300 border-secondary-700',
}
const STATUS_LABEL: Record<string, string> = {
  pending: 'Ausstehend',
  confirmed: 'Bestätigt',
  completed: 'Abgeschlossen',
  cancelled: 'Storniert',
  no_show: 'Nicht erschienen',
}

const TABS = [
  { id: 'overview', label: 'Übersicht', icon: 'ri-dashboard-line' },
  { id: 'courts', label: 'Plätze', icon: 'ri-layout-grid-line' },
  { id: 'calendar', label: 'Kalender', icon: 'ri-calendar-2-line' },
  { id: 'bookings', label: 'Buchungen', icon: 'ri-list-check-2' },
  { id: 'partners', label: 'Partner', icon: 'ri-hand-heart-line' },
  { id: 'content', label: 'Aktuelles', icon: 'ri-news-line' },
  { id: 'legal', label: 'Rechtliches', icon: 'ri-scales-3-line' },
  { id: 'messages', label: 'Nachrichten', icon: 'ri-mail-line' },
] as const

interface Catalog {
  settings: ClubSettings | null
  courts: Court[]
  venues: Venue[]
}

interface StatsData {
  ok: boolean
  kpi: {
    bookings: { today: number; week: number; month: number; year: number; total: number }
    revenue_cents: { today: number; week: number; month: number; year: number; total: number }
    customers: number
    cancelled: number
    utilization: number
  }
  perDay: { day: string; bookings: string; revenue: string; views: string }[]
  perMonth: { month: string; bookings: string; revenue: string }[]
  perWeekday: { weekday: number; bookings: string }[]
  perHour: { hour: number; bookings: string }[]
  perCourt: { court_id: string; name: string; bookings: string; revenue: string }[]
  statuses: { status: string; cnt: string }[]
  lead: { lead_bucket: string; cnt: string }[]
  topCustomers: { customer_name: string; customer_email: string; bookings: string; revenue: string }[]
  attention?: {
    pending: number
    messages_unread: number
    upcoming: { id: string; reference: string; court_name: string; start_at: string; end_at: string; customer_name: string; status: string }[]
  }
  traffic?: {
    views_total: number
    days_unique: number
    views_today: number
    views_yesterday: number
    top_paths: { path: string; cnt: string }[]
  }
}

interface AdminReservation {
  id: string
  reference: string
  court_id: string
  start_at: string
  end_at: string
  duration_minutes: number
  customer_name: string
  customer_email: string
  customer_phone: string | null
  notes: string | null
  fee_cents: number
  status: string
  court_name: string
  venue_name: string
  created_at?: string
  price_changed_after?: string | null
  price_before_change?: number | null
  court_number: number | null
}

interface AdminBlock {
  id: string
  court_id: string
  starts_at: string
  ends_at: string
  reason: string
  court_name: string
}

/* ---------- berlin time helpers ---------- */

function berlinToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date())
}

function berlinDateKey(ts: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts))
}

function berlinTime(ts: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ts))
}

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

function shiftDateKey(dk: string, days: number): string {
  const d = new Date(`${dk}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function fmtDayLong(dk: string): string {
  return new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${dk}T12:00:00Z`))
}

/* ---------- small chart building blocks (site style, div-based) ---------- */

function Bars({ values, labels, hint }: { values: number[]; labels: string[]; hint?: (i: number) => string }) {
  const max = Math.max(1, ...values)
  return (
    <div>
      <div className="flex items-end gap-1 h-36">
        {values.map((v, i) => (
          <div key={i} className="flex-1 h-full flex items-end" title={hint ? hint(i) : `${labels[i]}: ${v}`}>
            <div
              className="w-full rounded-t-[3px] bg-primary-500/70 hover:bg-primary-500 transition-colors"
              style={{ height: `${v > 0 ? Math.max(4, (v / max) * 100) : 0}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-1 text-[10px] text-foreground-600 tabular-nums">
        {labels.map((l, i) => (
          <div key={i} className="flex-1 text-center truncate">{l}</div>
        ))}
      </div>
    </div>
  )
}

function HBars({ items, format }: { items: { label: string; value: number }[]; format: (n: number) => string }) {
  const max = Math.max(1, ...items.map((i) => i.value))
  return (
    <div className="flex flex-col gap-2.5">
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-3 text-[13px]">
          <span className="w-28 shrink-0 truncate text-foreground-700">{it.label}</span>
          <span className="flex-1 h-6 rounded-md bg-foreground-950/[0.05] relative overflow-hidden">
            <span className="absolute inset-y-0 left-0 rounded-md bg-primary-500/60" style={{ width: `${(it.value / max) * 100}%` }} />
          </span>
          <span className="w-24 text-right tabular-nums text-foreground-800">{format(it.value)}</span>
        </div>
      ))}
    </div>
  )
}

function Panel({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="ro-card p-5 md:p-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="ro-card-title">{title}</h3>
        {right}
      </div>
      {children}
    </div>
  )
}

function StatusChip({ status }: { status: string }) {
  return (
    <span className={`font-label text-[10px] uppercase tracking-widest px-2 py-1 rounded-full border ${STATUS_CLS[status] ?? STATUS_CLS.pending}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}

/* ---------- detail modal (mf) ---------- */

function DetailModal({ r, onClose }: { r: AdminReservation; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-background-950/60" onClick={onClose} />
      <div className="relative w-full max-w-md ro-card p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="ro-eyebrow text-primary-500">{r.reference}</p>
            <h3 className="mt-2 ro-card-title">{r.court_name} · {r.venue_name}</h3>
          </div>
          <button onClick={onClose} aria-label="Schließen" className="w-9 h-9 rounded-full border border-foreground-950/15 hover:border-primary-500/60 cursor-pointer flex items-center justify-center">
            <i className="ri-close-line" />
          </button>
        </div>
        <div className="mt-5 flex flex-col gap-2 text-sm">
          <StatusChip status={r.status} />
          <div className="flex justify-between gap-3"><dt className="text-foreground-600">Wann</dt><dd className="tabular-nums">{berlinDateKey(r.start_at)} · {berlinTime(r.start_at)} – {berlinTime(r.end_at)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-foreground-600">Dauer</dt><dd className="tabular-nums">{r.duration_minutes} min</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-foreground-600">Preis</dt><dd className="tabular-nums">{formatPrice(r.fee_cents / 100)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-foreground-600">Kunde</dt><dd>{r.customer_name}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-foreground-600">E-Mail</dt><dd className="break-all">{r.customer_email}</dd></div>
          {r.customer_phone && <div className="flex justify-between gap-3"><dt className="text-foreground-600">Telefon</dt><dd>{r.customer_phone}</dd></div>}
          {r.notes && <div className="flex justify-between gap-3"><dt className="text-foreground-600">Notiz</dt><dd className="text-right">{r.notes}</dd></div>}
          {r.price_changed_after && (
            <div className="mt-2 flex items-start gap-1.5 rounded-md border border-accent-500/40 bg-accent-500/10 p-2.5 text-xs text-accent-300">
              <i className="ri-information-line mt-0.5 shrink-0" />
              <span>
                Preisänderung am {r.price_changed_after} — Buchung liegt davor ({formatPrice((r.price_before_change ?? 0) / 100)}), Preis bleibt unverändert.
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ---------- block editor modal (bf) ---------- */

function BlockModal({ courts, defaultDate, onClose, onSaved }: { courts: Court[]; defaultDate: string; onClose: () => void; onSaved: () => void }) {
  const [courtId, setCourtId] = useState(courts[0]?.id ?? '')
  const [date, setDate] = useState(defaultDate)
  const [start, setStart] = useState('06:00')
  const [end, setEnd] = useState('23:00')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setBusy(true)
    setError('')
    const r = await apiAdmin<{ ok: boolean; message?: string; error?: string }>('create_block', { court_id: courtId, date, start_time: start, end_time: end, reason })
    setBusy(false)
    if (r.ok) {
      onSaved()
      onClose()
    } else {
      setError(r.message ?? r.error ?? 'Speichern nicht möglich.')
    }
  }

  const inputCls = 'mt-2 w-full box-border bg-foreground-950/[0.04] border border-foreground-950/15 rounded-md px-4 py-2.5 text-[14px] text-foreground-950 transition-colors focus:outline-none focus:border-primary-500'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-background-950/60" onClick={onClose} />
      <div className="relative w-full max-w-md ro-card p-6">
        <p className="ro-eyebrow text-primary-500">Zeit sperren</p>
        <h3 className="mt-2 ro-card-title">Blockierung erstellen</h3>
        <label className="block mt-5">
          <span className="ro-eyebrow text-foreground-600">Platz</span>
          <select value={courtId} onChange={(e) => setCourtId(e.target.value)} className={inputCls}>
            {courts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="ro-eyebrow text-foreground-600">Datum</span>
            <input type="date" value={date} min={berlinToday()} onChange={(e) => setDate(e.target.value)} className={`${inputCls} [color-scheme:dark]`} />
          </label>
          <label className="block">
            <span className="ro-eyebrow text-foreground-600">Grund</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Sanierung" className={inputCls} />
          </label>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="ro-eyebrow text-foreground-600">Von</span>
            <input type="time" step={1800} value={start} onChange={(e) => setStart(e.target.value)} className={`${inputCls} [color-scheme:dark]`} />
          </label>
          <label className="block">
            <span className="ro-eyebrow text-foreground-600">Bis</span>
            <input type="time" step={1800} value={end} onChange={(e) => setEnd(e.target.value)} className={`${inputCls} [color-scheme:dark]`} />
          </label>
        </div>
        {error && <p className="mt-4 text-[13px] text-red-300">{error}</p>}
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="h-11 px-5 rounded-full border border-foreground-950/20 text-[14px] font-medium cursor-pointer hover:border-primary-500/60">Abbrechen</button>
          <button onClick={save} disabled={busy || !courtId || !date} className="h-11 px-5 rounded-full bg-secondary-500 text-background-50 text-[14px] font-medium cursor-pointer disabled:opacity-50">
            {busy ? 'Saving…' : 'Zeit sperren'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ---------- tab: Übersicht (statistics) ---------- */

const WD_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
const MONTH_SHORT = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']

function KpiCard({ label, value, sub, hint, delta }: { label: string; value: string; sub?: string; hint?: string; delta?: { dir: 'up' | 'down' | 'flat'; text: string } }) {
  return (
    <div className="ro-card p-4 md:p-5 group relative">
      <p className="ro-eyebrow text-foreground-600 flex items-center gap-1.5">
        {label}
        {hint && (
          <span className="relative inline-flex cursor-help" tabIndex={0}>
            <i className="ri-question-line text-[13px] text-foreground-500" />
            <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 z-20 rounded-md bg-background-950 text-background-50 text-[11px] leading-snug px-3 py-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shadow-lg">
              {hint}
            </span>
          </span>
        )}
      </p>
      <p className="mt-2 font-heading text-[28px] md:text-[32px] leading-none text-foreground-950 tabular-nums">{value}</p>
      {delta && (
        <p className={`mt-1.5 text-[12px] tabular-nums flex items-center gap-1 ${delta.dir === 'up' ? 'text-primary-600' : delta.dir === 'down' ? 'text-red-400' : 'text-foreground-600'}`}>
          <i className={delta.dir === 'up' ? 'ri-arrow-up-line' : delta.dir === 'down' ? 'ri-arrow-down-line' : 'ri-subtract-line'} />
          {delta.text}
        </p>
      )}
      {sub && <p className="mt-1.5 text-[12px] text-foreground-600">{sub}</p>}
    </div>
  )
}

/** ring gauge for utilization (0..1) */
function UtilRing({ value }: { value: number }) {
  const pct = Math.min(1, Math.max(0, value))
  const deg = Math.round(pct * 360)
  return (
    <div className="relative w-[104px] h-[104px] shrink-0 rounded-full" style={{ background: `conic-gradient(var(--color-primary-500) ${deg}deg, rgba(0,0,0,0.06) 0deg)` }} role="img" aria-label={`Auslastung ${Math.round(pct * 100)} Prozent`}>
      <div className="absolute inset-[10px] rounded-full bg-background-50 flex flex-col items-center justify-center">
        <span className="font-heading text-[24px] leading-none text-foreground-950 tabular-nums">{Math.round(pct * 100)}%</span>
        <span className="mt-1 text-[10px] text-foreground-600">30 Tage</span>
      </div>
    </div>
  )
}

function InfoHint({ text }: { text: string }) {
  return (
    <span className="relative inline-flex group/hint cursor-help" tabIndex={0}>
      <i className="ri-question-line text-[13px] text-foreground-500" />
      <span className="pointer-events-none absolute bottom-full right-0 mb-2 w-56 z-20 rounded-md bg-background-950 text-background-50 text-[11px] leading-snug px-3 py-2 opacity-0 group-hover/hint:opacity-100 focus-within:opacity-100 transition-opacity shadow-lg">
        {text}
      </span>
    </span>
  )
}

function OverviewTab({ onNavigate }: { catalog: Catalog; onNavigate: (tab: (typeof TABS)[number]['id']) => void }) {
  const [stats, setStats] = useState<StatsData | null>(null)
  const [error, setError] = useState('')

  function load() {
    setError('')
    apiAdmin<StatsData & { error?: string; message?: string }>('stats')
      .then((r) => {
        if (r.ok) setStats(r)
        else setError(r.message ?? 'Statistiken konnten nicht geladen werden.')
      })
      .catch(() => setError('Netzwerkfehler. Bitte erneut versuchen.'))
  }
  useEffect(load, [])

  if (error) {
    return (
      <div>
        <p className="text-secondary-300">{error}</p>
        <button onClick={load} className="mt-3 h-10 px-5 rounded-full border border-foreground-950/20 text-[14px] cursor-pointer hover:border-primary-500/60">Erneut versuchen</button>
      </div>
    )
  }
  if (!stats) return <p className="ro-body text-foreground-700">Vereinsdaten werden geladen…</p>

  const k = stats.kpi
  const dayBookings = stats.perDay.map((d) => Number(d.bookings))
  const dayLabels = stats.perDay.map((d) => `${d.day.slice(8)}.${d.day.slice(5, 7)}`)
  const dayViews = stats.perDay.map((d) => Number(d.views))
  const monthBookings = stats.perMonth.map((m) => Number(m.bookings))
  const monthLabels = stats.perMonth.map((m) => MONTH_SHORT[Number(m.month.slice(5, 7)) - 1] ?? m.month)
  const weekdayMap = new Map(stats.perWeekday.map((w) => [Number(w.weekday), Number(w.bookings)]))
  const weekdayValues = [1, 2, 3, 4, 5, 6, 0].map((d) => weekdayMap.get(d) ?? 0)
  const weekdayLabels = [1, 2, 3, 4, 5, 6, 0].map((d) => WD_SHORT[d])
  const hourMap = new Map(stats.perHour.map((h) => [Number(h.hour), Number(h.bookings)]))
  const hourMax = Math.max(1, ...stats.perHour.map((h) => Number(h.bookings)))
  const statusMap = new Map(stats.statuses.map((s) => [s.status, Number(s.cnt)]))
  const statusTotal = Math.max(1, stats.statuses.reduce((a, s) => a + Number(s.cnt), 0))
  const leadOrder = ['<1 Tag', '1-2 Tage', '3-6 Tage', '1 Woche', '2-4 Wochen', '>1 Monat']
  const leadItems = leadOrder
    .map((b) => ({ label: b, value: Number(stats.lead.find((l) => l.lead_bucket === b)?.cnt ?? 0) }))
    .filter((i) => i.value > 0)

  /* deltas: today vs 30-day daily average (bookings), today vs yesterday (views) */
  const avgBookingsPerDay = dayBookings.length > 0 ? dayBookings.reduce((a, b) => a + b, 0) / dayBookings.length : 0
  const bookingsDelta = avgBookingsPerDay > 0 ? (k.bookings.today - avgBookingsPerDay) / avgBookingsPerDay : 0
  const attention = stats.attention
  const traffic = stats.traffic
  const viewsDelta = traffic && traffic.views_yesterday > 0 ? (traffic.views_today - traffic.views_yesterday) / traffic.views_yesterday : null
  const todayKey = berlinToday()
  const tomorrowKey = shiftDateKey(todayKey, 1)
  const gamesToday = (attention?.upcoming ?? []).filter((g) => berlinDateKey(g.start_at) === todayKey)
  const gamesTomorrow = (attention?.upcoming ?? []).filter((g) => berlinDateKey(g.start_at) === tomorrowKey)

  return (
    <div className="flex flex-col gap-4">
      {/* quick actions */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => onNavigate('bookings')} className="h-9 px-4 inline-flex items-center gap-2 rounded-full bg-primary-500 text-background-50 text-[13px] font-medium cursor-pointer hover:bg-primary-400 transition-colors"><i className="ri-add-line" />Neue Buchung</button>
        <button onClick={() => onNavigate('calendar')} className="h-9 px-4 inline-flex items-center gap-2 rounded-full border border-foreground-950/15 text-[13px] font-medium cursor-pointer hover:border-primary-500/60 transition-colors"><i className="ri-calendar-2-line" />Kalender</button>
        <button onClick={() => onNavigate('calendar')} className="h-9 px-4 inline-flex items-center gap-2 rounded-full border border-foreground-950/15 text-[13px] font-medium cursor-pointer hover:border-primary-500/60 transition-colors"><i className="ri-lock-line" />Zeit sperren</button>
        <button onClick={() => onNavigate('courts')} className="h-9 px-4 inline-flex items-center gap-2 rounded-full border border-foreground-950/15 text-[13px] font-medium cursor-pointer hover:border-primary-500/60 transition-colors"><i className="ri-layout-grid-line" />Plätze</button>
      </div>

      {/* heute (hero) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="ro-card p-5 md:p-6">
          <div className="flex items-center justify-between gap-3">
            <h3 className="ro-card-title">Heute</h3>
            <InfoHint text="Buchungen und Website-Besuche des heutigen Tags (Europe/Berlin). Pfeile zeigen die Abweichung: Buchungen heute gegenüber dem 30-Tage-Durchschnitt, Besuche gegenüber gestern." />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <KpiCard label="Buchungen heute" value={String(k.bookings.today)} delta={{ dir: bookingsDelta > 0.05 ? 'up' : bookingsDelta < -0.05 ? 'down' : 'flat', text: `vs Ø 30 Tage (${avgBookingsPerDay.toFixed(1)})` }} hint="Bestätigte und ausstehende Buchungen mit Beginn heute. Vergleich: Durchschnitt der letzten 30 Tage." />
            <KpiCard label="Besuche heute" value={String(traffic?.views_today ?? 0)} delta={viewsDelta === null ? undefined : { dir: viewsDelta > 0.05 ? 'up' : viewsDelta < -0.05 ? 'down' : 'flat', text: `vs gestern (${traffic?.views_yesterday ?? 0})` }} hint="Seitenaufrufe der Website heute (alle Seiten, gezählt bei jedem Seitenaufruf)." />
            <KpiCard label="Buchungen Woche" value={String(k.bookings.week)} hint="Buchungen mit Beginn in den letzten 7 Tagen (inklusive heute)." />
            <KpiCard label="Buchungen Monat" value={String(k.bookings.month)} hint="Buchungen mit Beginn im laufenden Kalendermonat." />
          </div>
        </div>
        <div className="ro-card p-5 md:p-6 flex items-center gap-6 flex-wrap">
          <UtilRing value={k.utilization} />
          <div className="min-w-0">
            <h3 className="ro-card-title flex items-center gap-1.5">Auslastung <InfoHint text="Anteil gebuchter 30-Min-Slots an allen offenen Slots der Öffnungszeiten in den nächsten 30 Tagen. Nur bestätigte Buchungen zählen." /></h3>
            <p className="mt-2 text-[13px] text-foreground-700">bestätigte 30-Min-Slots / offene Slots der Öffnungszeiten, nächste 30 Tage.</p>
            <div className="mt-4 flex flex-wrap gap-2.5">
              <span className="inline-flex items-center gap-2"><StatusChip status="pending" /><span className="text-[13px] tabular-nums text-foreground-800">{statusMap.get('pending') ?? 0}</span></span>
              <span className="inline-flex items-center gap-2"><StatusChip status="confirmed" /><span className="text-[13px] tabular-nums text-foreground-800">{statusMap.get('confirmed') ?? 0}</span></span>
            </div>
          </div>
        </div>
      </div>

      {/* attention (clickable) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button onClick={() => onNavigate('bookings')} className="ro-card p-5 text-left cursor-pointer hover:border-primary-500/50 transition-colors">
          <p className="ro-eyebrow text-foreground-600 flex items-center gap-1.5">Buchungen <InfoHint text="Buchungen mit Status „Ausstehend“ warten auf Bestätigung oder Ablehnung." /></p>
          <p className="mt-2 font-heading text-[32px] leading-none text-foreground-950 tabular-nums">{attention?.pending ?? 0}</p>
          <p className="mt-1.5 text-[12px] text-foreground-600 flex items-center gap-1">warten auf Bestätigung <i className="ri-arrow-right-line" /></p>
        </button>
        <button onClick={() => onNavigate('messages')} className="ro-card p-5 text-left cursor-pointer hover:border-primary-500/50 transition-colors">
          <p className="ro-eyebrow text-foreground-600 flex items-center gap-1.5">Nachrichten <InfoHint text="Kontaktformular-Nachrichten, die noch als „offen“ markiert sind (nicht bearbeitet)." /></p>
          <p className="mt-2 font-heading text-[32px] leading-none text-foreground-950 tabular-nums">{attention?.messages_unread ?? 0}</p>
          <p className="mt-1.5 text-[12px] text-foreground-600 flex items-center gap-1">unbearbeitet <i className="ri-arrow-right-line" /></p>
        </button>
        <div className="ro-card p-5">
          <p className="ro-eyebrow text-foreground-600 flex items-center justify-between gap-1.5">Spiele heute / morgen <InfoHint text="Nicht stornierte Buchungen mit Beginn heute oder morgen (Europe/Berlin)." /></p>
          <ul className="mt-3 flex flex-col divide-y divide-foreground-950/[0.06] max-h-40 overflow-y-auto">
            {[...gamesToday, ...gamesTomorrow].map((g) => (
              <li key={g.id} className="py-2 flex items-center justify-between gap-3 text-[13px]">
                <span className="min-w-0 truncate"><span className="font-semibold text-foreground-950">{berlinDateKey(g.start_at) === todayKey ? 'Heute' : 'Morgen'} {berlinTime(g.start_at)}</span><span className="ml-2 text-foreground-600">{g.court_name}</span></span>
                <span className="shrink-0"><StatusChip status={g.status} /></span>
              </li>
            ))}
            {gamesToday.length === 0 && gamesTomorrow.length === 0 && <li className="py-2 text-[13px] text-foreground-600">Keine Spiele geplant.</li>}
          </ul>
        </div>
      </div>

      {/* website traffic */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Besuche — 30 Tage" right={<InfoHint text="Seitenaufrufe pro Tag (Summe über alle Pfade). Quelle: page_views, gezählt bei jedem Seitenaufruf." />}>
          <Bars values={dayViews} labels={dayLabels} hint={(i) => `${stats.perDay[i].day}: ${dayViews[i]} Besuche`} />
        </Panel>
        <Panel title="Traffic gesamt">
          <div className="grid grid-cols-2 gap-3">
            <KpiCard label="Besuche total" value={String(traffic?.views_total ?? 0)} hint="Alle Seitenaufrufe seit Beginn der Aufzeichnung (page_views)." />
            <KpiCard label="Tage mit Traffic" value={String(traffic?.days_unique ?? 0)} hint="Anzahl unterschiedlicher Tage mit mindestens einem Seitenaufruf." />
          </div>
        </Panel>
        <Panel title="Beliebte Seiten" right={<InfoHint text="Top 10 Pfade nach Seitenaufrufen über alle Tage." />}>
          {traffic && traffic.top_paths.length > 0 ? (
            <HBars items={traffic.top_paths.map((p) => ({ label: p.path || '/', value: Number(p.cnt) }))} format={(n) => `${n}`} />
          ) : (
            <p className="text-[13px] text-foreground-600">Noch keine Daten.</p>
          )}
        </Panel>
        <Panel title="Buchungen vs Besuche — 30 Tage" right={<InfoHint text="Gegenüberstellung: Buchungen und Besuche pro Tag. Zeigt, wie viel Traffic sich in Buchungen umsetzt." />}>
          <div className="flex flex-col gap-4">
            <div>
              <p className="ro-eyebrow text-foreground-600 mb-2">Buchungen</p>
              <Bars values={dayBookings} labels={dayLabels} hint={(i) => `${stats.perDay[i].day}: ${dayBookings[i]} Buchungen`} />
            </div>
            <div>
              <p className="ro-eyebrow text-foreground-600 mb-2">Besuche</p>
              <Bars values={dayViews} labels={dayLabels} hint={(i) => `${stats.perDay[i].day}: ${dayViews[i]} Besuche`} />
            </div>
          </div>
        </Panel>
      </div>

      {/* booking analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Buchungen — 30 Tage">
          <Bars values={dayBookings} labels={dayLabels} hint={(i) => `${stats.perDay[i].day}: ${dayBookings[i]} Buchungen`} />
        </Panel>
        <Panel title="Buchungen — 12 Monate">
          <Bars values={monthBookings} labels={monthLabels} hint={(i) => `${stats.perMonth[i].month}: ${monthBookings[i]} Buchungen`} />
        </Panel>
        <Panel title="Wochentage (1 Jahr)">
          <Bars values={weekdayValues} labels={weekdayLabels} hint={(i) => `${weekdayLabels[i]}: ${weekdayValues[i]} Buchungen`} />
        </Panel>
        <Panel title="Beliebte Zeiten (1 Jahr)" right={<InfoHint text="Heatmap: Startstunde 6–23 Uhr, Sättigung = Anzahl der Buchungen (1 Jahr, ohne Stornierungen)." />}>
          <div className="grid grid-cols-6 md:grid-cols-9 gap-1.5">
            {Array.from({ length: 18 }, (_, idx) => {
              const h = 6 + idx
              const v = hourMap.get(h) ?? 0
              const intensity = v / hourMax
              return (
                <div key={h} className="rounded-md aspect-square flex items-center justify-center text-[11px] tabular-nums" title={`${h}:00 — ${v} Buchungen`} style={{ backgroundColor: v > 0 ? `color-mix(in oklab, var(--color-primary-500) ${Math.round(15 + 85 * intensity)}%, transparent)` : 'rgba(0,0,0,0.04)', color: intensity > 0.5 ? 'var(--color-background-50, #fff)' : undefined }}>
                  {h}
                </div>
              )
            })}
          </div>
        </Panel>
        <Panel title="Plätze im Vergleich (1 Jahr)">
          <HBars items={stats.perCourt.map((c) => ({ label: c.name, value: Number(c.bookings) }))} format={(n) => `${n}`} />
        </Panel>
        <Panel title="Vorlaufzeit der Buchungen" right={<InfoHint text="Zeit zwischen Buchungserstellung und Spielbeginn (Lead time). Zeigt, wie spontan Mitglieder buchen." />}>
          {leadItems.length > 0
            ? <HBars items={leadItems} format={(n) => `${n}`} />
            : <p className="text-[13px] text-foreground-600">Noch keine Daten.</p>}
        </Panel>
      </div>

      {/* statuses + kundschaft */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Status aller Buchungen">
          <div className="flex flex-col gap-2.5">
            {[...statusMap.entries()].map(([s, c]) => (
              <div key={s} className="flex items-center gap-3 text-[13px]">
                <span className="w-36 shrink-0"><StatusChip status={s} /></span>
                <span className="flex-1 h-6 rounded-md bg-foreground-950/[0.05] relative overflow-hidden">
                  <span className={`absolute inset-y-0 left-0 rounded-md ${STATUS_CLS[s]?.split(' ')[0] ?? 'bg-primary-500/60'}`} style={{ width: `${(c / statusTotal) * 100}%` }} />
                </span>
                <span className="w-24 text-right tabular-nums text-foreground-800">{c} · {Math.round((c / statusTotal) * 100)}%</span>
              </div>
            ))}
            {statusMap.size === 0 && <p className="text-[13px] text-foreground-600">Noch keine Buchungen.</p>}
          </div>
        </Panel>
        <Panel title="Kundschaft">
          <div className="grid grid-cols-2 gap-3 mb-4">
            <KpiCard label="Kunden (1 Jahr)" value={String(k.customers)} hint="Anzahl unterschiedlicher E-Mail-Adressen mit mindestens einer Buchung in den letzten 12 Monaten." />
            <KpiCard label="Storniert" value={String(k.cancelled)} hint="Anzahl aller stornierten Buchungen (gesamt)." />
          </div>
          <p className="ro-eyebrow text-foreground-600 mb-1">Top-Kunden <InfoHint text="Mitglieder mit den meisten Buchungen (ohne Umsatzangabe)." /></p>
          <ul className="flex flex-col divide-y divide-foreground-950/[0.06]">
            {stats.topCustomers.map((c, i) => (
              <li key={i} className="py-2.5 flex items-center justify-between gap-3 text-[13px]">
                <span className="min-w-0 truncate"><span className="font-semibold text-foreground-950">{c.customer_name || c.customer_email}</span><span className="ml-2 text-foreground-600">{c.customer_email}</span></span>
                <span className="shrink-0 tabular-nums text-foreground-800">{c.bookings} Buchungen</span>
              </li>
            ))}
            {stats.topCustomers.length === 0 && <li className="py-3 text-[13px] text-foreground-600">Noch keine Kunden.</li>}
          </ul>
        </Panel>
      </div>
    </div>
  )
}

/* ---------- tab: Plätze (courts CRUD + price zones, double confirmation) ---------- */

const WD_FULL = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']

interface AdminCourt extends Court {
  venue_name?: string
  hours_count?: number
  zone_count?: number
}
interface Zone {
  id: string
  court_id: string
  label: string
  weekdays: number[]
  start_time: string
  end_time: string
  price_cents: number
  sort_order: number
}

const ADMIN_FIELD_CLS =
  'mt-2 w-full box-border bg-foreground-950/[0.04] border border-foreground-950/15 rounded-md px-3 py-2.5 text-[14px] text-foreground-950 placeholder:text-foreground-500 transition-colors focus:outline-none focus:bg-foreground-950/[0.06] focus:border-primary-500'

// double-confirmation button: first click arms it, second click within 4s confirms
function ConfirmButton({ label, confirmLabel, onConfirm, cls, busy }: { label: string; confirmLabel: string; onConfirm: () => void; cls: string; busy?: boolean }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 4000)
    return () => clearTimeout(t)
  }, [armed])
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        if (!armed) { setArmed(true); return }
        setArmed(false)
        onConfirm()
      }}
      className={`${cls} ${armed ? 'bg-red-500/90 border-red-500 text-white' : ''} disabled:opacity-50 cursor-pointer transition-colors`}
    >
      {armed ? confirmLabel : label}
    </button>
  )
}

const toMinSafe = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + (m || 0)
}

// 30-min slot grid for a court with the price of the zone covering each slot (or null)
function slotTimesForCourt(c: AdminCourt, zones: Zone[], hours: { weekday: number; opens: string; closes: string }[]): { time: string; price: number | null }[] {
  if (hours.length === 0) return []
  const opensList = hours.map((h) => toMinSafe(h.opens.slice(0, 5)))
  const closesList = hours.map((h) => toMinSafe(h.closes.slice(0, 5)))
  const openMin = Math.min(...opensList)
  const closeMin = Math.max(...closesList)
  const out: { time: string; price: number | null }[] = []
  for (let m = openMin; m + 30 <= closeMin; m += 30) {
    const time = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
    const zone = zones.find((z) => z.court_id === c.id && toMinSafe(z.start_time.slice(0, 5)) <= m && m < toMinSafe(z.end_time.slice(0, 5)))
    out.push({ time, price: zone ? zone.price_cents : null })
  }
  return out
}

function courtPriceRange(zs: Zone[]): string | null {
  if (zs.length === 0) return null
  const prices = zs.map((z) => z.price_cents / 100)
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const fmt = (n: number) => n.toFixed(2).replace('.', ',').replace(/,00$/, '')
  return min === max ? `${fmt(min)} € / Std.` : `${fmt(min)}–${fmt(max)} € / Std.`
}

// uncovered intervals within opening hours: slots without a price zone are not bookable
function coverageGaps(courtId: string, zs: Zone[], hours: { weekday: number; opens: string; closes: string }[] | undefined): { wd: number; text: string }[] {
  if (!hours) return []
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
  const gaps: { wd: number; text: string }[] = []
  for (const h of hours) {
    if (h.opens >= h.closes) continue
    const dayZones = zs.filter((z) => z.court_id === courtId && z.weekdays.includes(h.weekday))
    const uncovered: [number, number][] = []
    for (let s = toMin(h.opens); s + 30 <= toMin(h.closes); s += 30) {
      const hit = dayZones.some((z) => toMin(z.start_time) <= s && s + 30 <= toMin(z.end_time))
      if (!hit) {
        const last = uncovered[uncovered.length - 1]
        if (last && last[1] === s) last[1] = s + 30
        else uncovered.push([s, s + 30])
      }
    }
    if (uncovered.length > 0) {
      const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
      gaps.push({ wd: h.weekday, text: uncovered.map(([a, b]) => `${fmt(a)}–${fmt(b)}`).join(', ') })
    }
  }
  return gaps
}

function CourtsTab({ onCatalogReload }: { catalog: Catalog; onCatalogReload: () => void }) {
  const [courts, setCourts] = useState<AdminCourt[]>([])
  const [venues, setVenues] = useState<Venue[]>([])
  const [zones, setZones] = useState<Zone[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [editing, setEditing] = useState<AdminCourt | 'new' | null>(null)
  const [zoneCourt, setZoneCourt] = useState<string | null>(null) // court whose zones panel is open
  const [editingZone, setEditingZone] = useState<Zone | 'new' | null>(null)
  const [hoursCourt, setHoursCourt] = useState<string | null>(null) // court whose hours panel is open
  const [hoursRows, setHoursRows] = useState<{ weekday: number; opens: string; closes: string }[]>([])
  const [zoneHours, setZoneHours] = useState<{ weekday: number; opens: string; closes: string }[]>([]) // hours for the court whose zones panel is open
  const [priceHistoryRows, setPriceHistoryRows] = useState<{ id: string; court_id: string; zone_label: string; old_price_cents: number | null; new_price_cents: number | null; changed_at: string }[]>([])
  const [allHours, setAllHours] = useState<Record<string, { weekday: number; opens: string; closes: string }[]>>({})

  const load = async () => {
    setError('')
    try {
      const r = await apiAdmin<{ ok: boolean; courts: AdminCourt[]; venues: Venue[] }>('courts', {})
      const z = await apiAdmin<{ ok: boolean; zones: Zone[] }>('zones', {})
      apiAdmin<{ ok: boolean; history: typeof priceHistoryRows }>('price_history', {}).then((h) => { if (h.ok) setPriceHistoryRows(h.history ?? []) })
      if (r.ok) {
        setCourts(r.courts); setVenues(r.venues)
        for (const c of r.courts) {
          apiAdmin<{ ok: boolean; hours?: { weekday: number; opens: string; closes: string }[] }>('hours', { court_id: c.id })
            .then((h) => setAllHours((prev) => ({ ...prev, [c.id]: h.hours ?? [] })))
        }
      }
      if (z.ok) setZones(z.zones)
    } catch {
      setError('Netzwerkfehler. Bitte erneut versuchen.')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const courtZones = (courtId: string) => zones.filter((z) => z.court_id === courtId)

  const zoneLabel = (z: Zone) => `${z.label}: ${WD_FULL.filter((_, i) => z.weekdays.includes(i)).join(', ') || '—'} ${z.start_time.slice(0, 5)}–${z.end_time.slice(0, 5)} · ${(z.price_cents / 100).toFixed(2).replace('.', ',')} €`

  const openHours = async (courtId: string) => {
    if (hoursCourt === courtId) { setHoursCourt(null); return }
    setHoursCourt(courtId)
    const r = await apiAdmin<{ ok: boolean; hours: { weekday: number; opens: string; closes: string }[] }>('hours', { court_id: courtId })
    const rows = r.ok ? r.hours : []
    setHoursRows([0, 1, 2, 3, 4, 5, 6].map((wd) => {
      const h = rows.find((x) => x.weekday === wd)
      return { weekday: wd, opens: (h?.opens ?? '06:00').slice(0, 5), closes: (h?.closes ?? '23:30').slice(0, 5) }
    }))
  }

  const saveHours = async (courtId: string) => {
    const r = await apiAdmin<{ ok: boolean; message?: string }>('save_hours', { court_id: courtId, rows: hoursRows })
    setMessage(r.ok ? 'Öffnungszeiten gespeichert.' : r.message ?? 'Fehler')
    await load()
    onCatalogReload()
  }

  return (
    <div>
      {error && (
        <p className="mb-5 rounded-md border border-red-400/40 bg-red-400/10 px-4 py-3 text-[14px] text-red-300 flex items-center justify-between gap-3">
          {error}
          <button onClick={() => { setLoading(true); load() }} className="underline underline-offset-4 cursor-pointer">Erneut versuchen</button>
        </p>
      )}
      {message && <p className="mb-5 rounded-md border border-primary-500/40 bg-primary-500/10 px-4 py-3 text-[14px] text-primary-400">{message}</p>}

      <div className="flex items-center justify-between gap-3 mb-6">
        <p className="ro-body text-foreground-700">{courts.length} Plätze · Preise pro Zeitzone frei definierbar</p>
        <button
          onClick={() => setEditing('new')}
          className="h-10 inline-flex items-center gap-2 px-5 rounded-full bg-primary-500 text-background-50 text-[13px] font-medium hover:bg-primary-400 cursor-pointer"
        >
          <i className="ri-add-line" />Platz hinzufügen
        </button>
      </div>

      {loading ? (
        <p className="ro-body text-foreground-600 py-10">Wird geladen…</p>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {courts.map((c) => (
            <div key={c.id} className="ro-card p-5">
              <div className="flex gap-4">
                {c.image_url && <img src={c.image_url} alt="" className="w-24 h-24 rounded-lg object-cover ro-frame shrink-0" />}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="ro-eyebrow text-foreground-600">{c.venue_name ?? '—'} · Nr. {c.court_number ?? '—'}</p>
                      <p className="ro-card-title ro-grad-lime">{c.name}</p>
                    </div>
                    <span className={`h-7 px-3 inline-flex items-center rounded-full text-[11px] font-semibold ${c.is_active ? 'bg-primary-500/15 text-primary-400' : 'bg-foreground-950/[0.06] text-foreground-500'}`}>
                      {c.is_active ? 'Aktiv' : 'Inaktiv'}
                    </span>
                  </div>
                  <p className="mt-2 text-[13px] text-foreground-700">
                    {c.environment ?? 'Halle'} · {c.surface ?? '—'} · {courtPriceRange(courtZones(c.id)) ?? <span className="text-amber-500 font-medium">keine Preiszonen</span>} · {c.hours_count ?? 0} Öffnungszeiten · {c.zone_count ?? courtZones(c.id).length} Preiszonen
                  </p>
                  {(() => {
                    const gaps = coverageGaps(c.id, zones, allHours[c.id])
                    if (gaps.length === 0) return null
                    return (
                      <p className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-500 flex items-start gap-2">
                        <i className="ri-error-warning-line mt-0.5" />
                        <span>
                          <span className="font-semibold">Nicht abgedeckt — diese Slots sind nicht buchbar:</span>{' '}
                          {gaps.map((g) => `${WD_FULL[g.wd]} ${g.text}`).join(' · ')}
                        </span>
                      </p>
                    )
                  })()}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button onClick={() => setEditing(c)} className="h-9 px-4 rounded-full border border-foreground-950/20 text-[13px] font-medium hover:border-primary-500/60 cursor-pointer">
                      <i className="ri-edit-line mr-1" />Bearbeiten
                    </button>
                    <button onClick={() => {
                      if (zoneCourt === c.id) {
                        setZoneCourt(null)
                      } else {
                        setZoneCourt(c.id)
                        apiAdmin<{ ok: boolean; hours?: { weekday: number; opens: string; closes: string }[] }>('hours', { court_id: c.id }).then((r) => setZoneHours(r.hours ?? []))
                      }
                    }} className="h-9 px-4 rounded-full border border-foreground-950/20 text-[13px] font-medium hover:border-primary-500/60 cursor-pointer">
                      <i className="ri-price-tag-3-line mr-1" />Preiszonen ({courtZones(c.id).length})
                    </button>
                    <button onClick={() => openHours(c.id)} className="h-9 px-4 rounded-full border border-foreground-950/20 text-[13px] font-medium hover:border-primary-500/60 cursor-pointer">
                      <i className="ri-time-line mr-1" />Öffnungszeiten
                    </button>
                    <ConfirmButton
                      label="Löschen"
                      confirmLabel="Wirklich löschen?"
                      cls="h-9 px-4 rounded-full border border-red-400/40 text-red-300 text-[13px] font-medium hover:bg-red-500/10"
                      onConfirm={async () => {
                        const r = await apiAdmin<{ ok: boolean; message?: string }>('delete_court', { id: c.id })
                        setMessage(r.ok ? `${c.name} gelöscht.` : r.message ?? 'Fehler')
                        await load()
                        onCatalogReload()
                      }}
                    />
                  </div>
                </div>
              </div>

              {zoneCourt === c.id && courtZones(c.id).length === 0 && (
                <div className="mt-5 rounded-lg border border-primary-500/40 bg-primary-500/10 px-4 py-3 text-[13px] text-primary-400">
                  <span className="font-semibold">Einrichtung:</span> Schritt 2 — Preiszonen festlegen → Schritt 3 — Öffnungszeiten prüfen. Danach ist der Platz buchbar.
                </div>
              )}

              {hoursCourt === c.id && (
                <div className="mt-5 pt-5 border-t border-foreground-950/10">
                  <p className="ro-eyebrow text-foreground-600 mb-3 flex items-center gap-1.5">Öffnungszeiten · {c.name} <InfoHint text="Definiert, wann der Platz buchbar ist. Gäste sehen nur Slots innerhalb der Öffnungszeiten." /></p>
                  <div className="space-y-2">
                    {hoursRows.map((h, i) => (
                      <div key={h.weekday} className="flex items-center gap-3 text-[13px]">
                        <span className="w-8 text-foreground-700 font-medium">{WD_FULL[h.weekday]}</span>
                        <input
                          type="time"
                          value={h.opens}
                          onChange={(e) => setHoursRows(hoursRows.map((x, j) => (j === i ? { ...x, opens: e.target.value } : x)))}
                          className={`${ADMIN_FIELD_CLS} !w-auto px-2 py-1.5`}
                        />
                        <span className="text-foreground-500">–</span>
                        <input
                          type="time"
                          value={h.closes}
                          onChange={(e) => setHoursRows(hoursRows.map((x, j) => (j === i ? { ...x, closes: e.target.value } : x)))}
                          className={`${ADMIN_FIELD_CLS} !w-auto px-2 py-1.5`}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="mt-3">
                    <ConfirmButton
                      label="Öffnungszeiten speichern"
                      confirmLabel="Wirklich speichern?"
                      cls="h-9 px-4 rounded-full bg-primary-500 text-background-50 text-[13px] font-medium hover:bg-primary-400"
                      onConfirm={() => saveHours(c.id)}
                    />
                  </div>
                </div>
              )}

              {zoneCourt === c.id && (
                <div className="mt-5 pt-5 border-t border-foreground-950/10">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <p className="ro-eyebrow text-foreground-600 flex items-center gap-1.5">Preiszonen · {c.name} <InfoHint text="Eine Zone = Wochentage + Zeitfenster + Preis pro Stunde. Der Preis wird auf 30-Min-Slots aufgeteilt (€/2 pro Slot). Slots ohne Zone nutzen keinen Preis — lege Zonen für die gesamte Öffnungszeit an." /></p>
                    <button onClick={() => setEditingZone('new')} className="h-8 px-3 rounded-full bg-primary-500 text-background-50 text-[12px] font-medium hover:bg-primary-400 cursor-pointer">
                      <i className="ri-add-line" />Zone
                    </button>
                  </div>
                  {courtZones(c.id).length === 0 ? (
                    <p className="text-[13px] text-amber-500 py-2">Noch keine Zonen — der Platz ist ohne Preiszonen nicht buchbar.</p>
                  ) : (
                    <ul className="divide-y divide-foreground-950/[0.07]">
                      {courtZones(c.id).map((z) => (
                        <li key={z.id} className="py-2.5 flex items-center justify-between gap-3 text-[13px]">
                          <span className="text-foreground-800">{zoneLabel(z)}</span>
                          <span className="flex gap-2 shrink-0">
                            <button onClick={() => setEditingZone(z)} className="text-foreground-600 hover:text-primary-500 cursor-pointer" aria-label="Zone bearbeiten"><i className="ri-edit-line" /></button>
                            <ConfirmButton
                              label=""
                              confirmLabel="?"
                              cls="text-red-300 hover:text-red-400 text-[13px]"
                              onConfirm={async () => {
                                await apiAdmin('delete_zone', { id: z.id })
                                setMessage('Zone gelöscht.')
                                await load()
                              }}
                            />
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-5 pt-4 border-t border-foreground-950/[0.07]">
                    <p className="ro-eyebrow text-foreground-600 mb-3">Preise · 30-Min-Slots · {c.name}</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-1.5">
                      {slotTimesForCourt(c, zones, zoneHours).map(({ time, price }) => (
                        <div key={time} className="flex items-center justify-between gap-2 text-[12.5px] tabular-nums">
                          <span className="text-foreground-700">{time}</span>
                          <span className={price == null ? 'text-foreground-500/60' : 'text-primary-500 font-semibold'}>
                            {price == null ? '—' : `${(price / 100).toFixed(2).replace('.', ',')} €`}
                          </span>
                        </div>
                      ))}
                    </div>
                    {priceHistoryRows.length > 0 && (
                      <div className="mt-5 pt-4 border-t border-foreground-950/[0.07]">
                        <p className="ro-eyebrow text-foreground-600 mb-3">Preis-Archiv · {c.name}</p>
                        <ul className="divide-y divide-foreground-950/[0.07] text-[12.5px]">
                          {priceHistoryRows.filter((h) => h.court_id === c.id).map((h) => (
                            <li key={h.id} className="py-2 flex items-center justify-between gap-3">
                              <span className="text-foreground-700">{h.changed_at.slice(0, 16).replace('T', ' ')} · {h.zone_label}</span>
                              <span className="tabular-nums shrink-0">
                                {h.old_price_cents != null ? `${((h.old_price_cents) / 100).toFixed(2).replace('.', ',')} €` : '—'}
                                {' → '}
                                {h.new_price_cents != null ? `${((h.new_price_cents) / 100).toFixed(2).replace('.', ',')} €` : '—'}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {editing && <CourtModal court={editing === 'new' ? null : editing} venues={venues} onClose={() => setEditing(null)} onSaved={(msg, courtId) => {
        setEditing(null)
        setMessage(msg)
        load().then(() => {
          if (courtId) {
            setZoneCourt(courtId)
            apiAdmin<{ ok: boolean; hours?: { weekday: number; opens: string; closes: string }[] }>('hours', { court_id: courtId }).then((r) => setZoneHours(r.hours ?? []))
          }
        })
        onCatalogReload()
      }} />}
      {editingZone && zoneCourt && <ZoneModal zone={editingZone === 'new' ? null : editingZone} courtId={zoneCourt} courts={courts} onClose={() => setEditingZone(null)} onSaved={(msg) => { setEditingZone(null); setMessage(msg); load() }} />}
    </div>
  )
}

// resize image client-side (max width) and return base64 payload for upload_image
async function fileToUploadData(file: File, maxWidth: number): Promise<{ filename: string; data: string }> {
  const isSvg = file.type === 'image/svg+xml'
  const isGif = file.type === 'image/gif'
  if (isSvg || isGif || file.size <= 150 * 1024) {
    const buf = await file.arrayBuffer()
    let bin = ''
    const bytes = new Uint8Array(buf)
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
    return { filename: file.name, data: `data:${file.type};base64,${btoa(bin)}` }
  }
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxWidth / bitmap.width)
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no ctx')
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  const dataUrl = canvas.toDataURL('image/webp', 0.82)
  const name = file.name.replace(/\.[^.]+$/, '') + '.webp'
  return { filename: name, data: dataUrl }
}

// ---------- partners tab ----------
interface AdminPartner { id: string; name: string; link: string | null; logo_path: string | null; sort_order: number; is_active: boolean }

function PartnersTab() {
  const [partners, setPartners] = useState<AdminPartner[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [editing, setEditing] = useState<AdminPartner | null | 'new'>(null)

  const load = () => {
    setLoading(true)
    apiAdmin<{ ok: boolean; partners?: AdminPartner[]; message?: string }>('partners')
      .then((r) => {
        if (r.ok && r.partners) setPartners(r.partners)
        else setError(r.message ?? 'Fehler beim Laden.')
      })
      .catch(() => setError('Netzwerkfehler.'))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="ro-h2 !text-[28px]">Partner</h1>
        <button onClick={() => setEditing('new')} className="h-10 px-5 rounded-full bg-primary-500 text-background-50 text-[13px] font-medium hover:bg-primary-400 cursor-pointer">
          <i className="ri-add-line" />Partner
        </button>
      </div>
      {message && <p className="mt-4 rounded-md border border-primary-500/40 bg-primary-500/10 px-4 py-3 text-[14px] text-primary-400">{message}</p>}
      {error && <p className="mt-4 rounded-md border border-red-400/40 bg-red-400/10 px-4 py-3 text-[14px] text-red-300">{error}</p>}
      {loading ? (
        <p className="mt-8 text-[14px] text-foreground-600">Partner werden geladen…</p>
      ) : partners.length === 0 ? (
        <p className="mt-8 text-[14px] text-foreground-600">Noch keine Partner angelegt.</p>
      ) : (
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {partners.map((p) => (
            <div key={p.id} className={`ro-card p-5 flex gap-4 items-start ${p.is_active ? '' : 'opacity-50'}`}>
              {p.logo_path ? (
                <img src={p.logo_path} alt="" className="w-14 h-14 rounded-lg object-cover ro-frame shrink-0" />
              ) : (
                <span className="w-14 h-14 rounded-lg bg-primary-500/15 text-primary-500 flex items-center justify-center shrink-0"><i className="ri-award-line text-xl" /></span>
              )}
              <div className="min-w-0 flex-1">
                <p className="ro-card-title !text-[16px] truncate">{p.name}</p>
                {p.link && <p className="text-[12px] text-foreground-600 truncate mt-0.5">{p.link}</p>}
                <p className="text-[11px] text-foreground-500 mt-0.5">Sortierung {p.sort_order}</p>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => setEditing(p)} className="h-8 px-3 rounded-full border border-foreground-950/20 text-[12px] hover:border-primary-500/60 cursor-pointer"><i className="ri-edit-line" />Bearbeiten</button>
                  <ConfirmButton
                    label="Löschen"
                    confirmLabel="Wirklich löschen?"
                    cls="h-8 px-3 rounded-full border border-red-400/30 text-red-300 text-[12px] hover:border-red-400/60"
                    onConfirm={async () => {
                      const r = await apiAdmin<{ ok: boolean; message?: string }>('delete_partner', { id: p.id })
                      setMessage(r.ok ? r.message ?? 'Partner geloescht.' : r.message ?? 'Fehler')
                      await load()
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {editing && <PartnerModal partner={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={(msg) => { setMessage(msg); setEditing(null); load() }} />}
    </div>
  )
}

function PartnerModal({ partner, onClose, onSaved }: { partner: AdminPartner | null; onClose: () => void; onSaved: (msg: string) => void }) {
  const [form, setForm] = useState({
    name: partner?.name ?? '',
    link: partner?.link ?? '',
    logo_path: partner?.logo_path ?? '',
    is_active: partner?.is_active ?? true,
    sort_order: partner?.sort_order != null ? String(partner.sort_order) : '99',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }))

  const onFile = async (file: File) => {
    if (!file) return
    setError('')
    setUploading(true)
    try {
      const { filename, data } = await fileToUploadData(file, 520)
      const r = await apiAdmin<{ ok: boolean; path?: string; message?: string }>('upload_image', { filename, data })
      if (r.ok && r.path) set('logo_path', r.path)
      else setError(r.message ?? 'Upload fehlgeschlagen.')
    } catch {
      setError('Upload fehlgeschlagen.')
    }
    setUploading(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-background-950/60" onClick={onClose}>
      <div className="ro-card w-full max-w-md p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <p className="ro-eyebrow text-primary-500">{partner ? 'Partner bearbeiten' : 'Neuer Partner'}</p>
        <h3 className="mt-2 ro-card-title">{partner ? partner.name : 'Partner hinzufügen'}</h3>
        {error && <p className="mt-4 rounded-md border border-red-400/40 bg-red-400/10 px-3 py-2 text-[13px] text-red-300">{error}</p>}
        <label className="block mt-5"><span className="ro-eyebrow text-foreground-600">Name *</span>
          <input value={form.name} onChange={(e) => set('name', e.target.value)} className={ADMIN_FIELD_CLS} placeholder="Partner Eins" /></label>
        <label className="block mt-4"><span className="ro-eyebrow text-foreground-600">Link (optional)</span>
          <input value={form.link} onChange={(e) => set('link', e.target.value)} className={ADMIN_FIELD_CLS} placeholder="https://…" /></label>
        <div className="mt-4 flex items-center gap-3">
          <label className={`inline-flex h-9 items-center gap-2 rounded-full border border-foreground-950/20 px-4 text-[12px] font-medium cursor-pointer hover:border-primary-500/60 ${uploading ? 'opacity-60 pointer-events-none' : ''}`}>
            {uploading ? <i className="ri-loader-4-line animate-spin" /> : <i className="ri-upload-2-line" />}
            {uploading ? 'Wird hochgeladen…' : 'Logo hochladen'}
            <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f) }} />
          </label>
          {form.logo_path && <img src={form.logo_path} alt="" className="w-12 h-12 rounded-lg object-cover ro-frame" />}
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-foreground-500">
          <i className="ri-information-line mr-1 text-primary-500" />
          PNG, JPEG, WebP, SVG oder GIF · quadratisch empfohlen (z.&nbsp;B. 512×512 px) · bis 150&nbsp;KB bleibt das Original unverändert, größere Bilder werden automatisch auf max. 520&nbsp;px Breite skaliert (WebP) · SVG/GIF werden immer unverändert übernommen — halte sie klein.
        </p>
        <div className="mt-4 flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 cursor-pointer text-[13px] text-foreground-700">
            <input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} className="accent-[var(--color-primary-500)]" />
            Aktiv (sichtbar auf der Website)
          </label>
          <label className="flex items-center gap-2 text-[13px] text-foreground-700">Sortierung
            <input type="number" value={form.sort_order} onChange={(e) => set('sort_order', e.target.value)} className="w-20 mt-0 bg-foreground-950/[0.04] border border-foreground-950/15 rounded-md px-2 py-1.5 text-[14px] focus:outline-none focus:border-primary-500" /></label>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="h-10 px-5 rounded-full border border-foreground-950/20 text-[13px] font-medium cursor-pointer">Abbrechen</button>
          <ConfirmButton
            label={partner ? 'Speichern' : 'Anlegen'}
            confirmLabel={partner ? 'Wirklich speichern?' : 'Wirklich anlegen?'}
            cls="h-10 px-5 rounded-full bg-primary-500 text-background-50 text-[13px] font-medium hover:bg-primary-400 border border-primary-500"
            busy={busy}
            onConfirm={async () => {
              setBusy(true); setError('')
              const r = await apiAdmin<{ ok: boolean; message?: string }>('save_partner', { ...form, id: partner?.id })
              setBusy(false)
              if (r.ok) onSaved(r.message ?? 'Gespeichert.')
              else setError(r.message ?? 'Fehler')
            }}
          />
        </div>
      </div>
    </div>
  )
}

// ---------- content tab (news / promo / events / tournaments) ----------
interface AdminPost { id: string; title: string; slug: string; lead: string | null; body: string | null; image_path: string | null; published: boolean; type: 'news' | 'promo'; promo_expires_at: string | null; published_at: string | null; icon: string | null; cta_label: string | null; cta_link: string | null }
interface AdminEvent { id: string; kind: string; title: string; participants: string | null; starts_at: string; ends_at: string | null; description: string | null; is_published: boolean }
interface AdminTournament { id: string; title: string; description: string | null; format: 'single' | 'double'; fee_cents: number; starts_at: string; registration_deadline: string | null; max_entries: number | null; status: 'announcement' | 'registration' | 'running' | 'finished'; is_published: boolean; image_path: string | null; entry_count: number }
interface AdminTournamentEntry { id: string; full_name: string; email: string; phone: string | null; partner_name: string | null; note: string | null; created_at: string; paid: boolean; paid_at: string | null }
const TOURNAMENT_STATUS = [
  { id: 'announcement', label: 'Angekündigt' },
  { id: 'registration', label: 'Anmeldung läuft' },
  { id: 'running', label: 'Läuft gerade' },
  { id: 'finished', label: 'Beendet' },
] as const
const EVENT_KINDS = [
  { id: 'match', label: 'Spiel' },
  { id: 'tournament', label: 'Turnier' },
  { id: 'training', label: 'Training' },
  { id: 'other', label: 'Sonstiges' },
] as const

function ContentTab() {
  const [posts, setPosts] = useState<AdminPost[]>([])
  const [events, setEvents] = useState<AdminEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [editingPost, setEditingPost] = useState<AdminPost | null | 'new'>(null)
  const [editingEvent, setEditingEvent] = useState<AdminEvent | null | 'new'>(null)
  const [tournaments, setTournaments] = useState<AdminTournament[]>([])
  const [editingTournament, setEditingTournament] = useState<AdminTournament | null | 'new'>(null)
  const [entriesFor, setEntriesFor] = useState<AdminTournament | null>(null)

  const load = () => {
    setLoading(true)
    Promise.all([
      apiAdmin<{ ok: boolean; posts?: AdminPost[]; message?: string }>('posts'),
      apiAdmin<{ ok: boolean; events?: AdminEvent[]; message?: string }>('events'),
      apiAdmin<{ ok: boolean; tournaments?: AdminTournament[]; message?: string }>('tournaments'),
    ])
      .then(([p, e, t]) => {
        if (p.ok && p.posts) setPosts(p.posts)
        else setError(p.message ?? 'Fehler beim Laden.')
        if (e.ok && e.events) setEvents(e.events)
        if (t.ok && t.tournaments) setTournaments(t.tournaments)
      })
      .catch(() => setError('Netzwerkfehler.'))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const postCard = (p: AdminPost) => (
    <div key={p.id} className={`ro-card p-5 ${p.published ? '' : 'opacity-50'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="ro-eyebrow text-primary-500">{p.type === 'promo' ? 'Angebot' : 'News'}</p>
          <p className="ro-card-title !text-[16px] mt-1 truncate">{p.title}</p>
        </div>
        {p.image_path && <img src={p.image_path} alt="" className="w-14 h-14 rounded-lg object-cover ro-frame shrink-0" />}
      </div>
      {(p.lead || p.body) && <p className="text-[13px] text-foreground-600 mt-2 line-clamp-2">{p.lead ?? p.body}</p>}
      <p className="text-[11px] text-foreground-500 mt-1">
        {p.published ? 'Veröffentlicht' : 'Entwurf'}
        {p.type === 'promo' && p.promo_expires_at ? ` · bis ${new Date(p.promo_expires_at).toLocaleDateString('de-DE')}` : ''}
      </p>
      <div className="mt-3 flex gap-2">
        <button onClick={() => setEditingPost(p)} className="h-8 px-3 rounded-full border border-foreground-950/20 text-[12px] hover:border-primary-500/60 cursor-pointer"><i className="ri-edit-line" />Bearbeiten</button>
        <ConfirmButton
          label="Löschen"
          confirmLabel="Wirklich löschen?"
          cls="h-8 px-3 rounded-full border border-red-400/30 text-red-300 text-[12px] hover:border-red-400/60"
          onConfirm={async () => {
            const r = await apiAdmin<{ ok: boolean; message?: string }>('delete_post', { id: p.id })
            setMessage(r.ok ? r.message ?? 'Geloescht.' : r.message ?? 'Fehler')
            await load()
          }}
        />
      </div>
    </div>
  )

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="ro-h2 !text-[28px]">Aktuelles</h1>
        <div className="flex gap-2">
          <button onClick={() => setEditingPost('new')} className="h-10 px-5 rounded-full bg-primary-500 text-background-50 text-[13px] font-medium hover:bg-primary-400 cursor-pointer"><i className="ri-add-line" />Beitrag</button>
          <button onClick={() => setEditingTournament('new')} className="h-10 px-5 rounded-full border border-primary-500/60 text-primary-500 text-[13px] font-medium hover:bg-primary-500/10 cursor-pointer"><i className="ri-trophy-line" />Turnier</button>
          <button onClick={() => setEditingEvent('new')} className="h-10 px-5 rounded-full border border-foreground-950/20 text-[13px] font-medium hover:border-primary-500/60 cursor-pointer"><i className="ri-add-line" />Termin</button>
        </div>
      </div>
      {message && <p className="mt-4 rounded-md border border-primary-500/40 bg-primary-500/10 px-4 py-3 text-[14px] text-primary-400">{message}</p>}
      {error && <p className="mt-4 rounded-md border border-red-400/40 bg-red-400/10 px-4 py-3 text-[14px] text-red-300">{error}</p>}
      {loading ? (
        <p className="mt-8 text-[14px] text-foreground-600">Inhalte werden geladen…</p>
      ) : (
        <>
          <p className="ro-eyebrow text-foreground-600 mt-8 mb-3">News & Angebote ({posts.length})</p>
          {posts.length === 0 ? (
            <p className="text-[14px] text-foreground-600">Noch keine Beiträge angelegt.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">{posts.map(postCard)}</div>
          )}
          <p className="ro-eyebrow text-foreground-600 mt-10 mb-3">Turniere ({tournaments.length})</p>
          {tournaments.length === 0 ? (
            <p className="text-[14px] text-foreground-600">Noch keine Turniere angelegt.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {tournaments.map((t) => (
                <div key={t.id} className={`ro-card p-5 ${t.is_published ? '' : 'opacity-50'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="ro-eyebrow text-primary-500">{t.format === 'double' ? 'Doppel' : 'Einzel'}</p>
                      <p className="ro-card-title !text-[16px] mt-1 truncate">{t.title}</p>
                    </div>
                    <span className={`shrink-0 inline-flex items-center gap-1 h-6 px-2.5 rounded-full border text-[11px] font-medium ${t.status === 'registration' || t.status === 'running' ? 'border-primary-500/60 text-primary-500' : 'border-foreground-950/20 text-foreground-500'}`}>
                      {TOURNAMENT_STATUS.find((s) => s.id === t.status)?.label ?? t.status}
                    </span>
                  </div>
                  <p className="text-[13px] text-foreground-600 mt-1">{new Date(t.starts_at).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Berlin' })}</p>
                  <p className="text-[12px] text-foreground-500 mt-0.5">
                    {t.entry_count} Anmeldung{t.entry_count === 1 ? '' : 'en'}{t.max_entries ? ` · max. ${t.max_entries}` : ''}{t.fee_cents > 0 ? ` · ${(t.fee_cents / 100).toFixed(0)} €` : ''}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button onClick={() => setEntriesFor(t)} className="h-8 px-3 rounded-full border border-foreground-950/20 text-[12px] hover:border-primary-500/60 cursor-pointer"><i className="ri-group-line" />Teilnehmer ({t.entry_count})</button>
                    <button onClick={() => setEditingTournament(t)} className="h-8 px-3 rounded-full border border-foreground-950/20 text-[12px] hover:border-primary-500/60 cursor-pointer"><i className="ri-edit-line" />Bearbeiten</button>
                    <ConfirmButton
                      label="Löschen"
                      confirmLabel="Wirklich löschen?"
                      cls="h-8 px-3 rounded-full border border-red-400/30 text-red-300 text-[12px] hover:border-red-400/60"
                      onConfirm={async () => {
                        const r = await apiAdmin<{ ok: boolean; message?: string }>('delete_tournament', { id: t.id })
                        setMessage(r.ok ? r.message ?? 'Geloescht.' : r.message ?? 'Fehler')
                        await load()
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="ro-eyebrow text-foreground-600 mt-10 mb-3">Termine ({events.length})</p>
          {events.length === 0 ? (
            <p className="text-[14px] text-foreground-600">Noch keine Termine angelegt.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {events.map((e) => (
                <div key={e.id} className={`ro-card p-5 ${e.is_published ? '' : 'opacity-50'}`}>
                  <p className="ro-eyebrow text-primary-500">{EVENT_KINDS.find((k) => k.id === e.kind)?.label ?? e.kind}</p>
                  <p className="ro-card-title !text-[16px] mt-1 truncate">{e.title}</p>
                  <p className="text-[13px] text-foreground-600 mt-1">{new Date(e.starts_at).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Berlin' })}</p>
                  {e.participants && <p className="text-[12px] text-foreground-500 mt-0.5 truncate">{e.participants}</p>}
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => setEditingEvent(e)} className="h-8 px-3 rounded-full border border-foreground-950/20 text-[12px] hover:border-primary-500/60 cursor-pointer"><i className="ri-edit-line" />Bearbeiten</button>
                    <ConfirmButton
                      label="Löschen"
                      confirmLabel="Wirklich löschen?"
                      cls="h-8 px-3 rounded-full border border-red-400/30 text-red-300 text-[12px] hover:border-red-400/60"
                      onConfirm={async () => {
                        const r = await apiAdmin<{ ok: boolean; message?: string }>('delete_event', { id: e.id })
                        setMessage(r.ok ? r.message ?? 'Geloescht.' : r.message ?? 'Fehler')
                        await load()
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {editingPost && <PostModal post={editingPost === 'new' ? null : editingPost} onClose={() => setEditingPost(null)} onSaved={(msg) => { setMessage(msg); setEditingPost(null); load() }} />}
      {editingEvent && <EventModal event={editingEvent === 'new' ? null : editingEvent} onClose={() => setEditingEvent(null)} onSaved={(msg) => { setMessage(msg); setEditingEvent(null); load() }} />}
      {editingTournament && <TournamentModal tournament={editingTournament === 'new' ? null : editingTournament} onClose={() => setEditingTournament(null)} onSaved={(msg) => { setMessage(msg); setEditingTournament(null); load() }} />}
      {entriesFor && <TournamentEntriesModal tournament={entriesFor} onClose={() => setEntriesFor(null)} onChanged={load} />}
    </div>
  )
}

const PROMO_ICONS = [
  { id: 'ri-discount-percent-line', label: 'Rabatt / Angebot' },
  { id: 'ri-time-line', label: 'Zeitlich begrenzt' },
  { id: 'ri-gift-line', label: 'Gutschein / Geschenk' },
  { id: 'ri-star-line', label: 'Highlight' },
  { id: 'ri-calendar-event-line', label: 'Termin / Event' },
  { id: 'ri-group-line', label: 'Gruppe / Gemeinsam' },
  { id: 'ri-vip-crown-line', label: 'Premium' },
  { id: 'ri-information-line', label: 'Hinweis' },
] as const

function PostModal({ post, onClose, onSaved }: { post: AdminPost | null; onClose: () => void; onSaved: (msg: string) => void }) {
  const [form, setForm] = useState({
    title: post?.title ?? '',
    lead: post?.lead ?? '',
    body: post?.body ?? '',
    type: (post?.type ?? 'news') as 'news' | 'promo',
    image_path: post?.image_path ?? '',
    published: post?.published ?? true,
    promo_expires_at: post?.promo_expires_at ? post.promo_expires_at.slice(0, 10) : '',
    icon: post?.icon ?? '',
    cta_label: post?.cta_label ?? '',
    cta_link: post?.cta_link ?? '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }))

  const onFile = async (file: File) => {
    if (!file) return
    setError('')
    setUploading(true)
    try {
      const { filename, data } = await fileToUploadData(file, 780)
      const r = await apiAdmin<{ ok: boolean; path?: string; message?: string }>('upload_image', { filename, data })
      if (r.ok && r.path) set('image_path', r.path)
      else setError(r.message ?? 'Upload fehlgeschlagen.')
    } catch {
      setError('Upload fehlgeschlagen.')
    }
    setUploading(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-background-950/60" onClick={onClose}>
      <div className="ro-card w-full max-w-md p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <p className="ro-eyebrow text-primary-500">{post ? 'Beitrag bearbeiten' : 'Neuer Beitrag'}</p>
        <h3 className="mt-2 ro-card-title">{post ? post.title : 'Beitrag anlegen'}</h3>
        {error && <p className="mt-4 rounded-md border border-red-400/40 bg-red-400/10 px-3 py-2 text-[13px] text-red-300">{error}</p>}
        <div className="mt-5 flex gap-2">
          {(['news', 'promo'] as const).map((t) => (
            <button key={t} onClick={() => set('type', t)} className={`h-9 px-4 rounded-full text-[13px] font-medium cursor-pointer border ${form.type === t ? 'bg-primary-500 border-primary-500 text-background-50' : 'border-foreground-950/20 text-foreground-700'}`}>
              {t === 'news' ? 'News' : 'Angebot'}
            </button>
          ))}
        </div>
        <label className="block mt-4"><span className="ro-eyebrow text-foreground-600">Titel *</span>
          <input value={form.title} onChange={(e) => set('title', e.target.value)} className={ADMIN_FIELD_CLS} placeholder="Winterhallen-Plan ist da" /></label>
        <label className="block mt-4">
          <span className="ro-eyebrow text-foreground-600 flex items-center gap-1.5">Kurzfassung (Lead) <InfoHint text="Erscheint in der Übersicht als Einzeiler unter dem Titel. 1-2 Sätze, die neugierig machen — der volle Text steht unten." /></span>
          <input value={form.lead} onChange={(e) => set('lead', e.target.value)} className={ADMIN_FIELD_CLS} placeholder="Kurze Zusammenfassung in 1-2 Sätzen (optional)" />
        </label>
        <label className="block mt-4">
          <span className="ro-eyebrow text-foreground-600 flex items-center gap-1.5">Text <InfoHint text="Formatierung: Leerzeile = neuer Absatz, **Text** = fett, Zeilen die mit - beginnen = Aufzählung. Rechts siehst du eine Live-Vorschau." /></span>
          <textarea value={form.body} onChange={(e) => set('body', e.target.value)} rows={6} className={`${ADMIN_FIELD_CLS} resize-y`} placeholder={`Erster Absatz…\n\n**Fett gesetzter Hinweis**\n\n- Punkt eins\n- Punkt zwei`} /></label>
        {(form.body || form.lead) && (
          <div className="mt-4 rounded-lg border border-foreground-950/15 p-4">
            <span className="ro-eyebrow text-foreground-600">Vorschau</span>
            {form.lead && <p className="text-[14px] text-primary-400 mt-2">{form.lead}</p>}
            <RichText body={form.body} className="mt-2 text-[13px] text-foreground-700 [&_p+p]:mt-2 [&_ul]:mt-1 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mt-0.5" />
          </div>
        )}
        <div className="mt-4 flex items-center gap-3">
          <label className={`inline-flex h-9 items-center gap-2 rounded-full border border-foreground-950/20 px-4 text-[12px] font-medium cursor-pointer hover:border-primary-500/60 ${uploading ? 'opacity-60 pointer-events-none' : ''}`}>
            {uploading ? <i className="ri-loader-4-line animate-spin" /> : <i className="ri-upload-2-line" />}
            {uploading ? 'Wird hochgeladen…' : 'Bild hochladen'}
            <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f) }} />
          </label>
          {form.image_path && <img src={form.image_path} alt="" className="w-12 h-12 rounded-lg object-cover ro-frame" />}
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-foreground-500">
          <i className="ri-information-line mr-1 text-primary-500" />
          PNG, JPEG, WebP, SVG oder GIF · bis 150&nbsp;KB bleibt das Original unverändert, größere Bilder werden automatisch auf max. 780&nbsp;px Breite skaliert (WebP) · SVG/GIF werden immer unverändert übernommen — halte sie klein.
        </p>
        {form.type === 'promo' && (
          <>
            <div className="mt-4">
              <span className="ro-eyebrow text-foreground-600 flex items-center gap-1.5">Symbol <InfoHint text="Kleine Ikone neben dem Titel auf der Aktuelles-Seite. Optional — ohne Auswahl wird keine Ikone gezeigt." /></span>
              <div className="mt-2 flex flex-wrap gap-2">
                {PROMO_ICONS.map((ic) => (
                  <button key={ic.id} type="button" onClick={() => set('icon', form.icon === ic.id ? '' : ic.id)} title={ic.label}
                    className={`h-10 w-10 rounded-lg border text-[18px] cursor-pointer flex items-center justify-center ${form.icon === ic.id ? 'border-primary-500 bg-primary-500/15 text-primary-400' : 'border-foreground-950/20 text-foreground-600 hover:border-primary-500/60'}`}>
                    <i className={ic.id} />
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="block">
                <span className="ro-eyebrow text-foreground-600 flex items-center gap-1.5">Button-Text <InfoHint text="Beschriftung der Schaltfläche auf der Aktuelles-Karte. Leer = kein Button." /></span>
                <input value={form.cta_label} onChange={(e) => set('cta_label', e.target.value)} className={ADMIN_FIELD_CLS} placeholder="Jetzt buchen" />
              </label>
              <label className="block">
                <span className="ro-eyebrow text-foreground-600 flex items-center gap-1.5">Button-Link <InfoHint text="Wohin der Button führt. Intern: /book (Buchung), /konto oder #partner. Extern: https://… Leer = /book." /></span>
                <input value={form.cta_link} onChange={(e) => set('cta_link', e.target.value)} className={ADMIN_FIELD_CLS} placeholder="/book" />
              </label>
            </div>
            <label className="block mt-4"><span className="ro-eyebrow text-foreground-600">Angebot gültig bis (optional)</span>
              <input type="date" value={form.promo_expires_at} onChange={(e) => set('promo_expires_at', e.target.value)} className={ADMIN_FIELD_CLS} /></label>
          </>
        )}
        <label className="mt-4 flex items-center gap-2 cursor-pointer text-[13px] text-foreground-700">
          <input type="checkbox" checked={form.published} onChange={(e) => set('published', e.target.checked)} className="accent-[var(--color-primary-500)]" />
          Veröffentlicht (sichtbar auf der Website)
        </label>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="h-10 px-5 rounded-full border border-foreground-950/20 text-[13px] font-medium cursor-pointer">Abbrechen</button>
          <ConfirmButton
            label={post ? 'Speichern' : 'Anlegen'}
            confirmLabel={post ? 'Wirklich speichern?' : 'Wirklich anlegen?'}
            cls="h-10 px-5 rounded-full bg-primary-500 text-background-50 text-[13px] font-medium hover:bg-primary-400 border border-primary-500"
            busy={busy}
            onConfirm={async () => {
              setBusy(true); setError('')
              const r = await apiAdmin<{ ok: boolean; message?: string }>('save_post', { ...form, id: post?.id, promo_expires_at: form.promo_expires_at ? `${form.promo_expires_at}T23:59:59Z` : null })
              setBusy(false)
              if (r.ok) onSaved(r.message ?? 'Gespeichert.')
              else setError(r.message ?? 'Fehler')
            }}
          />
        </div>
      </div>
    </div>
  )
}

function EventModal({ event, onClose, onSaved }: { event: AdminEvent | null; onClose: () => void; onSaved: (msg: string) => void }) {
  const [form, setForm] = useState({
    title: event?.title ?? '',
    kind: event?.kind ?? 'match',
    participants: event?.participants ?? '',
    starts_at: event?.starts_at ? event.starts_at.slice(0, 16) : '',
    ends_at: event?.ends_at ? event.ends_at.slice(0, 16) : '',
    description: event?.description ?? '',
    is_published: event?.is_published ?? true,
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-background-950/60" onClick={onClose}>
      <div className="ro-card w-full max-w-md p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <p className="ro-eyebrow text-primary-500">{event ? 'Termin bearbeiten' : 'Neuer Termin'}</p>
        <h3 className="mt-2 ro-card-title">{event ? event.title : 'Termin anlegen'}</h3>
        {error && <p className="mt-4 rounded-md border border-red-400/40 bg-red-400/10 px-3 py-2 text-[13px] text-red-300">{error}</p>}
        <label className="block mt-5"><span className="ro-eyebrow text-foreground-600">Titel *</span>
          <input value={form.title} onChange={(e) => set('title', e.target.value)} className={ADMIN_FIELD_CLS} placeholder="Vereinsmeisterschaft" /></label>
        <label className="block mt-4"><span className="ro-eyebrow text-foreground-600 flex items-center gap-1.5">Art <InfoHint text="Spiel = Pflichtspiel/Match, Turnier = Turnierhinweis, Training = Trainingseinheit, Sonstiges = z. B. Vereinsfeier. Erscheint als Label im Terminkalender der Website." /></span>
          <select value={form.kind} onChange={(e) => set('kind', e.target.value)} className={ADMIN_FIELD_CLS}>
            {EVENT_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select></label>
        <label className="block mt-4"><span className="ro-eyebrow text-foreground-600 flex items-center gap-1.5">Teilnehmer / Ort (optional) <InfoHint text="Freitext, erscheint unter dem Titel: Ort, Gegner oder Uhrzeit-Zusatz. Beispiel: „Halle, Platz 1 · 18:00“ oder „Mannschaftsspiel U14“." /></span>
          <input value={form.participants} onChange={(e) => set('participants', e.target.value)} className={ADMIN_FIELD_CLS} placeholder="Halle, Platz 1 · 18:00" /></label>
        <label className="block mt-4"><span className="ro-eyebrow text-foreground-600 flex items-center gap-1.5">Beginn * <InfoHint text="Datum und Uhrzeit des Termins. Anzeige auf der Website in Europe/Berlin." /></span>
          <input type="datetime-local" value={form.starts_at} onChange={(e) => set('starts_at', e.target.value)} className={ADMIN_FIELD_CLS} /></label>
        <label className="block mt-4"><span className="ro-eyebrow text-foreground-600 flex items-center gap-1.5">Ende (optional) <InfoHint text="Wann der Termin voraussichtlich endet. Leer = nur Startzeit wird gezeigt." /></span>
          <input type="datetime-local" value={form.ends_at} onChange={(e) => set('ends_at', e.target.value)} className={ADMIN_FIELD_CLS} /></label>
        <label className="block mt-4"><span className="ro-eyebrow text-foreground-600 flex items-center gap-1.5">Beschreibung <InfoHint text="Kurzer Hinweistext zum Termin. Optional — leer = keine Beschreibung." /></span>
          <textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={3} className={`${ADMIN_FIELD_CLS} resize-y`} /></label>
        <label className="mt-4 flex items-center gap-2 cursor-pointer text-[13px] text-foreground-700">
          <input type="checkbox" checked={form.is_published} onChange={(e) => set('is_published', e.target.checked)} className="accent-[var(--color-primary-500)]" />
          Veröffentlicht
        </label>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="h-10 px-5 rounded-full border border-foreground-950/20 text-[13px] font-medium cursor-pointer">Abbrechen</button>
          <ConfirmButton
            label={event ? 'Speichern' : 'Anlegen'}
            confirmLabel={event ? 'Wirklich speichern?' : 'Wirklich anlegen?'}
            cls="h-10 px-5 rounded-full bg-primary-500 text-background-50 text-[13px] font-medium hover:bg-primary-400 border border-primary-500"
            busy={busy}
            onConfirm={async () => {
              setBusy(true); setError('')
              const r = await apiAdmin<{ ok: boolean; message?: string }>('save_event', {
                ...form,
                id: event?.id,
                starts_at: form.starts_at ? `${form.starts_at}:00Z` : '',
                ends_at: form.ends_at ? `${form.ends_at}:00Z` : null,
              })
              setBusy(false)
              if (r.ok) onSaved(r.message ?? 'Gespeichert.')
              else setError(r.message ?? 'Fehler')
            }}
          />
        </div>
      </div>
    </div>
  )
}

function TournamentModal({ tournament, onClose, onSaved }: { tournament: AdminTournament | null; onClose: () => void; onSaved: (msg: string) => void }) {
  const [form, setForm] = useState({
    title: tournament?.title ?? '',
    description: tournament?.description ?? '',
    format: (tournament?.format ?? 'single') as 'single' | 'double',
    fee_eur: tournament ? String(tournament.fee_cents / 100) : '0',
    starts_at: tournament?.starts_at ? tournament.starts_at.slice(0, 16) : '',
    registration_deadline: tournament?.registration_deadline ? tournament.registration_deadline.slice(0, 16) : '',
    max_entries: tournament?.max_entries ? String(tournament.max_entries) : '',
    status: (tournament?.status ?? 'announcement') as AdminTournament['status'],
    is_published: tournament?.is_published ?? true,
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-background-950/60" onClick={onClose}>
      <div className="ro-card w-full max-w-md p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <p className="ro-eyebrow text-primary-500">{tournament ? 'Turnier bearbeiten' : 'Neues Turnier'}</p>
        <h3 className="mt-2 ro-card-title">{tournament ? tournament.title : 'Turnier anlegen'}</h3>
        {error && <p className="mt-4 rounded-md border border-red-400/40 bg-red-400/10 px-3 py-2 text-[13px] text-red-300">{error}</p>}
        <label className="block mt-5"><span className="ro-eyebrow text-foreground-600 flex items-center gap-1.5">Titel * <InfoHint text="Name des Turniers, z. B. „Vereinsmeisterschaft 2026“. Erscheint als Überschrift der Turnierkarte." /></span>
          <input value={form.title} onChange={(e) => set('title', e.target.value)} className={ADMIN_FIELD_CLS} placeholder="Vereinsmeisterschaft 2026" /></label>
        <label className="block mt-4">
          <span className="ro-eyebrow text-foreground-600 flex items-center gap-1.5">Beschreibung <InfoHint text="Formatierung: Leerzeile = neuer Absatz, **Text** = fett, Zeilen die mit - beginnen = Aufzählung. Kurz halten: Modus, Modus-Besonderheiten, Zielgruppe." /></span>
          <textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={4} className={`${ADMIN_FIELD_CLS} resize-y`} placeholder={`Modus und Ablauf…\n\n- 2 Gewinnsätze\n- 15 Punkte pro Satz`} /></label>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="ro-eyebrow text-foreground-600 flex items-center gap-1.5">Format <InfoHint text="Einzel oder Doppel. Bei Doppel melden sich Teilnehmer mit Partner — das Feld dafür erscheint im Meldeformular." /></span>
            <select value={form.format} onChange={(e) => set('format', e.target.value)} className={ADMIN_FIELD_CLS}>
              <option value="single">Einzel</option>
              <option value="double">Doppel</option>
            </select>
          </label>
          <label className="block">
            <span className="ro-eyebrow text-foreground-600 flex items-center gap-1.5">Startgeld (€) <InfoHint text="Startgeld pro Teilnehmer in Euro, 0 = kostenlos. Wird auf der Website angezeigt, aber nicht automatisch abgerechnet." /></span>
            <input type="number" min="0" step="1" value={form.fee_eur} onChange={(e) => set('fee_eur', e.target.value)} className={ADMIN_FIELD_CLS} />
          </label>
        </div>
        <label className="block mt-4">
          <span className="ro-eyebrow text-foreground-600 flex items-center gap-1.5">Beginn * <InfoHint text="Wann das Turnier startet. Erscheint mit Datum und Uhrzeit auf der Website (Zeitzone Europe/Berlin)." /></span>
          <input type="datetime-local" value={form.starts_at} onChange={(e) => set('starts_at', e.target.value)} className={ADMIN_FIELD_CLS} />
        </label>
        <label className="block mt-4">
          <span className="ro-eyebrow text-foreground-600 flex items-center gap-1.5">Anmeldefrist <InfoHint text="Nach diesem Datum ist keine Anmeldung mehr möglich (Button auf der Website wird gesperrt). Leer = Anmeldung bis Turnierbeginn." /></span>
          <input type="datetime-local" value={form.registration_deadline} onChange={(e) => set('registration_deadline', e.target.value)} className={ADMIN_FIELD_CLS} />
        </label>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="ro-eyebrow text-foreground-600 flex items-center gap-1.5">Max. Teilnehmer <InfoHint text="Obergrenze der Anmeldungen. Erreicht, zeigt die Website «Ausgebucht». Leer = unbegrenzt." /></span>
            <input type="number" min="1" step="1" value={form.max_entries} onChange={(e) => set('max_entries', e.target.value)} className={ADMIN_FIELD_CLS} placeholder="unbegrenzt" />
          </label>
          <label className="block">
            <span className="ro-eyebrow text-foreground-600 flex items-center gap-1.5">Status <InfoHint text="Angekündigt/Anmeldung läuft = Melden möglich. Läuft gerade/Beendet = Melden gesperrt. Status kannst du jederzeit ändern." /></span>
            <select value={form.status} onChange={(e) => set('status', e.target.value)} className={ADMIN_FIELD_CLS}>
              {TOURNAMENT_STATUS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
        </div>
        <label className="mt-4 flex items-center gap-2 cursor-pointer text-[13px] text-foreground-700">
          <input type="checkbox" checked={form.is_published} onChange={(e) => set('is_published', e.target.checked)} className="accent-[var(--color-primary-500)]" />
          Veröffentlicht (sichtbar auf der Website)
        </label>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="h-10 px-5 rounded-full border border-foreground-950/20 text-[13px] font-medium cursor-pointer">Abbrechen</button>
          <ConfirmButton
            label={tournament ? 'Speichern' : 'Anlegen'}
            confirmLabel={tournament ? 'Wirklich speichern?' : 'Wirklich anlegen?'}
            cls="h-10 px-5 rounded-full bg-primary-500 text-background-50 text-[13px] font-medium hover:bg-primary-400 border border-primary-500"
            busy={busy}
            onConfirm={async () => {
              setBusy(true); setError('')
              const r = await apiAdmin<{ ok: boolean; message?: string }>('save_tournament', {
                ...form,
                id: tournament?.id,
                fee_eur: Number(form.fee_eur) || 0,
                max_entries: form.max_entries ? Number(form.max_entries) : null,
                starts_at: form.starts_at ? `${form.starts_at}:00Z` : '',
                registration_deadline: form.registration_deadline ? `${form.registration_deadline}:00Z` : null,
              })
              setBusy(false)
              if (r.ok) onSaved(r.message ?? 'Gespeichert.')
              else setError(r.message ?? 'Fehler')
            }}
          />
        </div>
      </div>
    </div>
  )
}

function TournamentEntriesModal({ tournament, onClose, onChanged }: { tournament: AdminTournament; onClose: () => void; onChanged: () => void }) {
  const [entries, setEntries] = useState<AdminTournamentEntry[] | null>(null)
  const [error, setError] = useState('')

  const load = () => {
    apiAdmin<{ ok: boolean; entries?: AdminTournamentEntry[]; message?: string }>('tournament_entries', { tournament_id: tournament.id })
      .then((r) => {
        if (r.ok && r.entries) setEntries(r.entries)
        else setError(r.message ?? 'Fehler beim Laden.')
      })
      .catch(() => setError('Netzwerkfehler.'))
  }
  useEffect(load, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-background-950/60" onClick={onClose}>
      <div className="ro-card w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <p className="ro-eyebrow text-primary-500">Anmeldungen</p>
        <h3 className="mt-2 ro-card-title truncate">{tournament.title}</h3>
        {entries !== null && entries.length > 0 && (() => {
          const paidCount = entries.filter((e) => e.paid).length
          const feeSum = entries.filter((e) => e.paid).length * tournament.fee_cents
          return (
            <p className="mt-2 text-[13px] text-foreground-600">
              {paidCount}/{entries.length} bezahlt{tournament.fee_cents > 0 ? ` · ${(feeSum / 100).toFixed(2).replace('.', ',')} € eingenommen` : ''}
              <InfoHint text="Bezahlt wird vor Ort im Verein. Markiere einen Teilnehmer nach dem Zahlungseingang mit dem Schalter „Bezahlt“. Die Summe zeigt eingenommene Startgebühren." />
            </p>
          )
        })()}
        {error && <p className="mt-4 rounded-md border border-red-400/40 bg-red-400/10 px-3 py-2 text-[13px] text-red-300">{error}</p>}
        {entries === null ? (
          <p className="mt-5 text-[14px] text-foreground-600">Wird geladen…</p>
        ) : entries.length === 0 ? (
          <p className="mt-5 text-[14px] text-foreground-600">Noch keine Anmeldungen.</p>
        ) : (
          <div className="mt-5 space-y-3">
            {entries.map((e) => (
              <div key={e.id} className="rounded-lg border border-foreground-950/15 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-foreground-950 truncate">{e.full_name}</p>
                    <p className="text-[12px] text-foreground-500 truncate">{e.email}{e.phone ? ` · ${e.phone}` : ''}</p>
                    {e.partner_name && <p className="text-[12px] text-foreground-600 mt-0.5">Partner: {e.partner_name}</p>}
                    {e.note && <p className="text-[12px] text-foreground-600 mt-0.5">Notiz: {e.note}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    {tournament.fee_cents > 0 && (
                      <button
                        onClick={async () => {
                          const r = await apiAdmin<{ ok: boolean; message?: string }>('mark_entry_paid', { id: e.id, paid: !e.paid })
                          if (r.ok) { load(); onChanged() }
                          else setError(r.message ?? 'Fehler')
                        }}
                        className={`h-8 px-3 rounded-full border text-[12px] cursor-pointer ${e.paid ? 'border-primary-500/60 bg-primary-500/15 text-primary-500 font-semibold' : 'border-foreground-950/20 text-foreground-600 hover:border-primary-500/60'}`}
                      >
                        <i className={e.paid ? 'ri-checkbox-circle-line' : 'ri-price-tag-line'} />{e.paid ? 'Bezahlt' : 'Offen'}
                      </button>
                    )}
                    <ConfirmButton
                      label="Entfernen"
                      confirmLabel="Wirklich entfernen?"
                      cls="h-8 px-3 rounded-full border border-red-400/30 text-red-300 text-[12px] hover:border-red-400/60"
                      onConfirm={async () => {
                        const r = await apiAdmin<{ ok: boolean; message?: string }>('remove_entry', { id: e.id })
                        if (r.ok) { load(); onChanged() }
                        else setError(r.message ?? 'Fehler')
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-6 flex justify-end">
          <button onClick={onClose} className="h-10 px-5 rounded-full border border-foreground-950/20 text-[13px] font-medium cursor-pointer">Schließen</button>
        </div>
      </div>
    </div>
  )
}

// ---------- legal tab (AGB / Impressum / Datenschutz / Cookies) ----------

const LEGAL_LABELS: Record<string, string> = { agb: 'AGB', impressum: 'Impressum', datenschutz: 'Datenschutz', cookies: 'Cookies' }

interface AdminLegal { id: string; title: string; body: string; updated_at: string }

// --- Nachrichten: входящие сообщения с формы обратной связи (#kontakt) ---
interface ContactMessage {
  id: string
  name: string
  email: string
  phone: string | null
  message: string
  handled: boolean
  created_at: string
}

function MessagesTab() {
  const [messages, setMessages] = useState<ContactMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const load = () => {
    setLoading(true)
    apiAdmin<{ ok: boolean; messages?: ContactMessage[] }>('messages')
      .then((r) => {
        if (r.ok) setMessages(r.messages ?? [])
        else setError('Nachrichten konnten nicht geladen werden.')
      })
      .catch(() => setError('Nachrichten konnten nicht geladen werden.'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  async function toggleHandled(id: string) {
    const r = await apiAdmin<{ ok: boolean; handled?: boolean }>('handle_message', { id })
    if (r.ok) setMessages((ms) => ms.map((m) => (m.id === id ? { ...m, handled: !!r.handled } : m)))
  }

  async function remove(id: string) {
    const r = await apiAdmin<{ ok: boolean; message?: string }>('delete_message', { id })
    if (r.ok) {
      setMessage('Nachricht geloescht.')
      setMessages((ms) => ms.filter((m) => m.id !== id))
    }
  }

  const fmt = (s: string) =>
    new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: TZ }).format(new Date(s))

  return (
    <div>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-heading font-light heading-tight md:text-[32px] text-foreground-950">Nachrichten</h1>
        <button type="button" onClick={load} className="h-10 px-4 inline-flex items-center gap-2 rounded-full border border-background-300 text-sm font-medium text-foreground-800 hover:bg-background-200 cursor-pointer">
          <i className="ri-refresh-line" aria-hidden="true" /> Aktualisieren
        </button>
      </div>
      {error && (
        <p className="mt-6 text-sm text-secondary-300">
          {error}{' '}
          <button type="button" onClick={load} className="underline underline-offset-4 cursor-pointer">
            Erneut versuchen
          </button>
        </p>
      )}
      {message && <p className="mt-4 text-sm text-primary-400">{message}</p>}
      {loading ? (
        <p className="mt-8 text-sm text-foreground-600">Nachrichten werden geladen…</p>
      ) : messages.length === 0 ? (
        <div className="mt-8 ro-card p-8 text-center">
          <i className="ri-mail-line text-3xl text-foreground-500" aria-hidden="true" />
          <p className="mt-3 text-sm text-foreground-600">Noch keine Nachrichten. Eingänge aus dem Kontaktformular erscheinen hier.</p>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 xl:grid-cols-2 gap-4">
          {messages.map((m) => (
            <div key={m.id} className={`ro-card p-5 ${m.handled ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-heading text-lg text-foreground-950">{m.name}</p>
                  <p className="mt-0.5 text-xs text-foreground-600">
                    <a href={`mailto:${m.email}`} className="hover:text-primary-500">{m.email}</a>
                    {m.phone && <> · <a href={`tel:${m.phone}`} className="hover:text-primary-500">{m.phone}</a></>}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <span className={`font-label text-[10px] uppercase tracking-widest px-2 py-1 rounded-full border ${m.handled ? 'bg-secondary-900/60 text-secondary-300 border-secondary-700' : 'bg-primary-500/20 text-primary-400 border-primary-500/50'}`}>
                    {m.handled ? 'Erledigt' : 'Neu'}
                  </span>
                  <span className="text-xs text-foreground-500 tabular-nums">{fmt(m.created_at)}</span>
                </div>
              </div>
              <p className="mt-3 text-sm text-foreground-800 whitespace-pre-line">{m.message}</p>
              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => toggleHandled(m.id)}
                  className="text-[13px] font-semibold border border-background-300 hover:border-primary-500/60 hover:text-primary-500 px-4 py-2 rounded-full cursor-pointer transition-colors"
                >
                  {m.handled ? 'Als neu markieren' : 'Als erledigt markieren'}
                </button>
                <ConfirmButton label="Löschen" confirmLabel="Wirklich löschen?" cls="text-[13px] font-semibold border border-secondary-700/60 text-secondary-200 hover:bg-secondary-950/60 px-4 py-2 rounded-full" onConfirm={() => remove(m.id)} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function LegalTab() {
  const [pages, setPages] = useState<AdminLegal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [editing, setEditing] = useState<AdminLegal | null>(null)
  const [busy, setBusy] = useState(false)

  const load = () => {
    setLoading(true)
    apiAdmin<{ ok: boolean; pages?: AdminLegal[]; message?: string }>('legal', {})
      .then((r) => {
        if (r.ok && r.pages) setPages(r.pages)
        else setError(r.message ?? 'Fehler beim Laden.')
      })
      .catch(() => setError('Netzwerkfehler.'))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const save = (p: Record<string, unknown>) => {
    setBusy(true)
    apiAdmin<{ ok: boolean; message?: string }>('save_legal', p)
      .then((r) => {
        if (r.ok) {
          setMessage(r.message ?? 'Seite gespeichert.')
          setEditing(null)
          load()
        } else setError(r.message ?? 'Fehler beim Speichern.')
      })
      .catch(() => setError('Netzwerkfehler.'))
      .finally(() => setBusy(false))
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h1 className="ro-h2 !text-[28px]">Rechtliches</h1>
      </div>
      {message && <p className="mt-4 text-sm text-primary-500">{message}</p>}
      {error && <p className="mt-4 text-sm text-secondary-300">{error} <button onClick={load} className="underline cursor-pointer">Erneut versuchen</button></p>}
      {loading ? (
        <p className="mt-8 text-sm text-foreground-600">Wird geladen…</p>
      ) : (
        <div className="mt-8 grid grid-cols-1 xl:grid-cols-2 gap-5">
          {pages.map((p) => (
            <div key={p.id} className="ro-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="ro-eyebrow text-primary-500">{LEGAL_LABELS[p.id] ?? p.id}</p>
                  <h3 className="ro-card-title mt-1">{p.title}</h3>
                  <p className="mt-1 text-xs text-foreground-500">
                    Stand: {new Date(p.updated_at).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Europe/Berlin' })} · /legal/{p.id}
                  </p>
                  <p className="mt-3 text-sm text-foreground-700 line-clamp-2">{p.body}</p>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <button onClick={() => setEditing(p)} className="h-9 px-4 rounded-full border border-background-400 text-[13px] font-medium cursor-pointer hover:border-primary-500 transition-colors">
                  Bearbeiten
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {editing && <LegalModal page={editing} onClose={() => setEditing(null)} onSaved={save} busy={busy} />}
    </div>
  )
}

function LegalModal({ page, onClose, onSaved, busy }: { page: AdminLegal; onClose: () => void; onSaved: (p: Record<string, unknown>) => void; busy: boolean }) {
  const [title, setTitle] = useState(page.title)
  const [body, setBody] = useState(page.body)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background-950/60" onClick={onClose}>
      <div className="ro-card w-full max-w-2xl p-6 md:p-8 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="ro-eyebrow text-primary-500">{LEGAL_LABELS[page.id] ?? page.id}</p>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={ADMIN_FIELD_CLS + ' mt-2 text-lg font-semibold'} placeholder="Titel" />
          </div>
          <button onClick={onClose} aria-label="Schließen" className="w-9 h-9 shrink-0 rounded-full border border-background-400 flex items-center justify-center cursor-pointer hover:border-primary-500 transition-colors">
            <i className="ri-close-line" />
          </button>
        </div>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={12} className={ADMIN_FIELD_CLS + ' mt-4'} placeholder="Text…" />
        <div className="mt-5 flex justify-end gap-3">
          <button onClick={onClose} className="h-10 px-5 rounded-full border border-background-400 text-[13px] font-medium cursor-pointer hover:border-primary-500 transition-colors">
            Abbrechen
          </button>
          <ConfirmButton
            label="Speichern"
            confirmLabel="Wirklich speichern?"
            onConfirm={() => onSaved({ id: page.id, updated_at: page.updated_at, title, body })}
            cls="h-10 px-5 rounded-full bg-primary-500 text-background-50 text-[13px] font-semibold hover:bg-primary-400"
            busy={busy}
          />
        </div>
      </div>
    </div>
  )
}

function CourtModal({ court, venues, onClose, onSaved }: { court: AdminCourt | null; venues: Venue[]; onClose: () => void; onSaved: (msg: string, courtId?: string) => void }) {
  const [form, setForm] = useState({
    name: court?.name ?? '',
    venue_id: court?.venue_id ?? venues[0]?.id ?? '',
    surface: court?.surface ?? '',
    environment: court?.environment ?? 'Halle',
    court_number: court?.court_number != null ? String(court.court_number) : '',
    hourly_price: court?.hourly_price != null ? String(court.hourly_price) : '',
    image_url: court?.image_url ?? '',
    is_active: court?.is_active ?? true,
    sort_order: court?.sort_order != null ? String(court.sort_order) : '99',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }))

  const onFile = async (file: File) => {
    if (!file) return
    setError('')
    setUploading(true)
    try {
      const { filename, data } = await fileToUploadData(file, 520)
      const r = await apiAdmin<{ ok: boolean; path?: string; message?: string }>('upload_image', { filename, data })
      if (r.ok && r.path) set('image_url', r.path)
      else setError(r.message ?? 'Upload fehlgeschlagen.')
    } catch {
      setError('Upload fehlgeschlagen.')
    }
    setUploading(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-background-950/60" onClick={onClose}>
      <div className="ro-card w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <p className="ro-eyebrow text-primary-500">{court ? 'Platz bearbeiten' : 'Neuer Platz'}</p>
        <h3 className="mt-2 ro-card-title">{court ? court.name : 'Platz hinzufügen'}</h3>
        {error && <p className="mt-4 rounded-md border border-red-400/40 bg-red-400/10 px-3 py-2 text-[13px] text-red-300">{error}</p>}
        <label className="block mt-5"><span className="ro-eyebrow text-foreground-600">Name *</span>
          <input value={form.name} onChange={(e) => set('name', e.target.value)} className={ADMIN_FIELD_CLS} placeholder="Platz 1" /></label>
        <label className="block mt-4"><span className="ro-eyebrow text-foreground-600">Anlage *</span>
          <select value={form.venue_id} onChange={(e) => set('venue_id', e.target.value)} className={ADMIN_FIELD_CLS}>
            {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select></label>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <label className="block"><span className="ro-eyebrow text-foreground-600">Umgebung</span>
            <select value={form.environment} onChange={(e) => set('environment', e.target.value)} className={ADMIN_FIELD_CLS}>
              <option value="Halle">Halle</option>
              <option value="Außenplatz">Außenplatz</option>
            </select></label>
          <label className="block"><span className="ro-eyebrow text-foreground-600">Belag</span>
            <input value={form.surface} onChange={(e) => set('surface', e.target.value)} className={ADMIN_FIELD_CLS} placeholder="Rebound Ace" /></label>
          <label className="block"><span className="ro-eyebrow text-foreground-600">Platz-Nr.</span>
            <input type="number" value={form.court_number} onChange={(e) => set('court_number', e.target.value)} className={ADMIN_FIELD_CLS} /></label>
          <div className="self-end text-[12px] text-foreground-500 leading-snug pb-1">
            {court ? 'Preise über Preiszonen steuern.' : <>Preiszonen und Öffnungszeiten werden beim Anlegen automatisch übernommen — danach anpassbar.</>}
          </div>
        </div>
        <label className="block mt-4"><span className="ro-eyebrow text-foreground-600">Bild-URL</span>
          <input value={form.image_url} onChange={(e) => set('image_url', e.target.value)} className={ADMIN_FIELD_CLS} placeholder="/assets/img/… oder https://…" /></label>
        <div className="mt-2 flex items-center gap-3">
          <label className={`inline-flex h-9 items-center gap-2 rounded-full border border-foreground-950/20 px-4 text-[12px] font-medium cursor-pointer hover:border-primary-500/60 ${uploading ? 'opacity-60 pointer-events-none' : ''}`}>
            {uploading ? <i className="ri-loader-4-line animate-spin" /> : <i className="ri-upload-2-line" />}
            {uploading ? 'Wird hochgeladen…' : 'Bild hochladen'}
            <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f) }} />
          </label>
          <span className="text-[11px] text-foreground-500">PNG, JPG, WEBP, SVG, GIF · bis 150 KB Original, größere werden auf 520 px (WebP) skaliert</span>
        </div>
        {form.image_url && <img src={form.image_url} alt="" className="mt-3 h-32 w-full object-cover rounded-lg ro-frame" />}
        <div className="mt-4 flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 cursor-pointer text-[13px] text-foreground-700">
            <input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} className="accent-[var(--color-primary-500)]" />
            Aktiv (sichtbar auf der Website)
          </label>
          <label className="flex items-center gap-2 text-[13px] text-foreground-700">Sortierung
            <input type="number" value={form.sort_order} onChange={(e) => set('sort_order', e.target.value)} className="w-20 mt-0 bg-foreground-950/[0.04] border border-foreground-950/15 rounded-md px-2 py-1.5 text-[14px] focus:outline-none focus:border-primary-500" /></label>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="h-10 px-5 rounded-full border border-foreground-950/20 text-[13px] font-medium cursor-pointer">Abbrechen</button>
          <ConfirmButton
            label={court ? 'Speichern' : 'Anlegen'}
            confirmLabel={court ? 'Wirklich speichern?' : 'Wirklich anlegen?'}
            cls="h-10 px-5 rounded-full bg-primary-500 text-background-50 text-[13px] font-medium hover:bg-primary-400 border border-primary-500"
            busy={busy}
            onConfirm={async () => {
              setBusy(true); setError('')
              const r = await apiAdmin<{ ok: boolean; message?: string; id?: string }>('save_court', { ...form, id: court?.id })
              setBusy(false)
              if (r.ok) onSaved(r.message ?? 'Gespeichert.', r.id)
              else setError(r.message ?? 'Fehler')
            }}
          />
        </div>
      </div>
    </div>
  )
}

function ZoneModal({ zone, courtId, courts, onClose, onSaved }: { zone: Zone | null; courtId: string; courts: AdminCourt[]; onClose: () => void; onSaved: (msg: string) => void }) {
  const [form, setForm] = useState({
    court_id: zone?.court_id ?? courtId,
    label: zone?.label ?? '',
    start_time: zone?.start_time.slice(0, 5) ?? '06:00',
    end_time: zone?.end_time.slice(0, 5) ?? '23:30',
    price_eur: zone ? String(zone.price_cents / 100) : '',
  })
  const [weekdays, setWeekdays] = useState<number[]>(zone?.weekdays ?? [0, 1, 2, 3, 4, 5, 6])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const toggleDay = (d: number) => setWeekdays((w) => (w.includes(d) ? w.filter((x) => x !== d) : [...w, d].sort()))
  const setTimePreset = (mins: number) => setForm((f) => ({ ...f, end_time: String(Math.floor(mins / 60)).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0') }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-background-950/60" onClick={onClose}>
      <div className="ro-card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <p className="ro-eyebrow text-primary-500">{zone ? 'Zone bearbeiten' : 'Neue Zone'}</p>
        <h3 className="mt-2 ro-card-title">Preis pro Zeitraum</h3>
        {error && <p className="mt-4 rounded-md border border-red-400/40 bg-red-400/10 px-3 py-2 text-[13px] text-red-300">{error}</p>}
        <label className="block mt-5"><span className="ro-eyebrow text-foreground-600">Platz</span>
          <select value={form.court_id} onChange={(e) => setForm((f) => ({ ...f, court_id: e.target.value }))} className={ADMIN_FIELD_CLS}>
            {courts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select></label>
        <label className="block mt-4"><span className="ro-eyebrow text-foreground-600">Bezeichnung</span>
          <input value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} className={ADMIN_FIELD_CLS} placeholder="Werktag Abend" /></label>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <label className="block"><span className="ro-eyebrow text-foreground-600">Von</span>
            <input type="time" value={form.start_time} onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))} className={ADMIN_FIELD_CLS} /></label>
          <label className="block"><span className="ro-eyebrow text-foreground-600">Bis</span>
            <input type="time" value={form.end_time} onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))} className={ADMIN_FIELD_CLS} /></label>
          <label className="block"><span className="ro-eyebrow text-foreground-600">€ / Stunde</span>
            <input type="number" step="0.01" min="0" value={form.price_eur} onChange={(e) => setForm((f) => ({ ...f, price_eur: e.target.value }))} className={ADMIN_FIELD_CLS} placeholder="22" /></label>
        </div>
        <p className="mt-2 text-[12px] text-foreground-600">Freies Zeitfenster — nicht auf 30-Min-Raster beschränkt.</p>
        <p className="mt-4 ro-eyebrow text-foreground-600">Wochentage</p>
        <div className="mt-2 flex gap-1.5">
          {WD_FULL.map((d, i) => (
            <button key={i} type="button" onClick={() => toggleDay(i)}
              className={`w-9 h-9 rounded-full text-[12px] font-semibold cursor-pointer border transition-colors ${weekdays.includes(i) ? 'bg-primary-500 border-primary-500 text-background-50' : 'border-foreground-950/20 text-foreground-700 hover:border-primary-500/60'}`}>
              {d}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {[30, 60, 90, 120].map((m) => (
            <button key={m} type="button" onClick={() => setTimePreset(m)}
              className="h-7 px-3 rounded-full border border-foreground-950/15 text-[11px] text-foreground-600 hover:border-primary-500/60 cursor-pointer">
              {m} min
            </button>
          ))}
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="h-10 px-5 rounded-full border border-foreground-950/20 text-[13px] font-medium cursor-pointer">Abbrechen</button>
          <ConfirmButton
            label={zone ? 'Speichern' : 'Anlegen'}
            confirmLabel={zone ? 'Wirklich speichern?' : 'Wirklich anlegen?'}
            cls="h-10 px-5 rounded-full bg-primary-500 text-background-50 text-[13px] font-medium hover:bg-primary-400 border border-primary-500"
            busy={busy}
            onConfirm={async () => {
              setBusy(true); setError('')
              const r = await apiAdmin<{ ok: boolean; message?: string }>('save_zone', {
                id: zone?.id,
                court_id: form.court_id,
                label: form.label,
                weekdays,
                start_time: form.start_time,
                end_time: form.end_time,
                price_cents: Math.round(Number(form.price_eur) * 100),
              })
              setBusy(false)
              if (r.ok) onSaved(r.message ?? 'Gespeichert.')
              else setError(r.message ?? 'Fehler')
            }}
          />
        </div>
      </div>
    </div>
  )
}

/* ---------- tab: Kalender (wf) ---------- */

const CAL_START = 360 // 06:00
const CAL_END = 1380 // 23:00
const PX_PER_MIN = 1.2

function CalendarTab({ catalog }: { catalog: Catalog }) {
  const [date, setDate] = useState(berlinToday())
  const [data, setData] = useState<{ reservations: AdminReservation[]; blocks: AdminBlock[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<AdminReservation | null>(null)
  const [blockModal, setBlockModal] = useState(false)

  function load(dk: string) {
    setLoading(true)
    apiAdmin<{ ok: boolean; reservations: AdminReservation[]; blocks: AdminBlock[] }>('day_data', { from: `${dk}T00:00:00Z`, to: `${dk}T23:59:59Z` })
      .then((r) => setData({ reservations: r.reservations ?? [], blocks: r.blocks ?? [] }))
      .catch(() => setData({ reservations: [], blocks: [] }))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load(date) }, [date])

  const courts = catalog.courts.filter((c) => c.is_active)
  const height = (CAL_END - CAL_START) * PX_PER_MIN

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2.5">
        <button onClick={() => setDate(shiftDateKey(date, -1))} aria-label="Vorheriger Tag" className="w-9 h-9 rounded-full border border-foreground-950/20 cursor-pointer hover:border-primary-500/60 flex items-center justify-center"><i className="ri-arrow-left-s-line" /></button>
        <button onClick={() => setDate(shiftDateKey(date, 1))} aria-label="Nächster Tag" className="w-9 h-9 rounded-full border border-foreground-950/20 cursor-pointer hover:border-primary-500/60 flex items-center justify-center"><i className="ri-arrow-right-s-line" /></button>
        <input type="date" value={date} min={berlinToday()} onChange={(e) => e.target.value && setDate(e.target.value)} className="h-10 rounded-full border border-foreground-950/15 bg-transparent px-4 text-[14px] [color-scheme:dark]" />
        <button onClick={() => setDate(berlinToday())} className="h-10 px-4 rounded-full border border-foreground-950/20 text-[13px] font-semibold cursor-pointer hover:border-primary-500/60">Heute</button>
        <button onClick={() => setBlockModal(true)} className="h-10 px-4 rounded-full bg-secondary-500 text-background-50 text-[13px] font-semibold cursor-pointer hover:opacity-90 sm:ml-auto">Zeit sperren</button>
      </div>
      <p className="mt-2 text-[13px] text-foreground-600">{fmtDayLong(date)} · Zeiten in {catalog.settings?.timezone ?? TZ}</p>

      <div className="mt-4 bg-background-100 border border-foreground-950/[0.08] rounded-lg overflow-x-auto">
        <div className="flex min-w-[760px]">
          <div className="w-16 shrink-0 border-r border-foreground-950/[0.06]">
            <div className="h-10" />
            <div className="relative" style={{ height }}>
              {Array.from({ length: (CAL_END - CAL_START) / 60 + 1 }, (_, i) => CAL_START / 60 + i).map((h) => (
                <span key={h} className="absolute left-0 w-full text-right pr-2 text-[11px] tabular-nums text-foreground-600 -translate-y-1/2" style={{ top: (h * 60 - CAL_START) * PX_PER_MIN }}>
                  {String(h).padStart(2, '0')}:00
                </span>
              ))}
            </div>
          </div>
          {courts.map((c) => (
            <div key={c.id} className="flex-1 min-w-[160px] border-l border-foreground-950/[0.06]">
              <div className="h-10 flex items-center justify-center gap-2 border-b border-foreground-950/[0.06]">
                <span className="text-[13px] font-semibold text-foreground-950">{c.name}</span>
                {c.surface && <span className="text-[10px] text-foreground-600">{c.surface}</span>}
              </div>
              <div className="relative" style={{ height }}>
                {Array.from({ length: (CAL_END - CAL_START) / 60 }, (_, i) => i + 1).map((i) => (
                  <div key={i} className="absolute inset-x-0 border-t border-foreground-950/[0.05]" style={{ top: i * 60 * PX_PER_MIN }} />
                ))}
                {loading && <span className="absolute inset-0 flex items-center justify-center text-[12px] text-foreground-600">Lade…</span>}
                {(data?.blocks ?? []).filter((b) => b.court_id === c.id).map((b) => {
                  const s = Math.max(toMin(berlinTime(b.starts_at)), CAL_START)
                  const e = Math.min(toMin(berlinTime(b.ends_at)), CAL_END)
                  return (
                    <div key={b.id} className="absolute inset-x-1 rounded-md bg-background-400/50 border border-dashed border-foreground-400 p-1.5 text-[11px] text-foreground-800" style={{ top: (s - CAL_START) * PX_PER_MIN, height: Math.max((e - s) * PX_PER_MIN, 18) }}>
                      <span className="font-semibold">{b.reason || 'Gesperrt'}</span>
                      <button
                        onClick={async () => { await apiAdmin('delete_block', { id: b.id }); load(date) }}
                        className="block mt-1 text-[10px] underline underline-offset-2 cursor-pointer hover:text-red-300"
                      >
                        Entfernen
                      </button>
                    </div>
                  )
                })}
                {(data?.reservations ?? []).filter((r) => r.court_id === c.id).map((r) => {
                  const s = Math.max(toMin(berlinTime(r.start_at)), CAL_START)
                  const e = Math.min(toMin(berlinTime(r.end_at)), CAL_END)
                  return (
                    <button
                      key={r.id}
                      onClick={() => setDetail(r)}
                      className={`absolute inset-x-1 rounded-md border px-1.5 py-1 text-left text-[11px] cursor-pointer truncate ${STATUS_CLS[r.status] ?? STATUS_CLS.confirmed}`}
                      style={{ top: (s - CAL_START) * PX_PER_MIN, height: Math.max((e - s) * PX_PER_MIN, 18) }}
                    >
                      <span className="font-semibold">{r.customer_name}</span>
                      <span className="ml-1 tabular-nums opacity-80">{berlinTime(r.start_at)}–{berlinTime(r.end_at)}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2.5">
        {['confirmed', 'pending', 'completed', 'cancelled'].map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5"><StatusChip status={s} /></span>
        ))}
        <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest px-2 py-1 rounded-full border border-dashed border-foreground-400 text-foreground-700">Gesperrt</span>
      </div>

      {detail && <DetailModal r={detail} onClose={() => setDetail(null)} />}
      {blockModal && <BlockModal courts={courts} defaultDate={date} onClose={() => setBlockModal(false)} onSaved={() => load(date)} />}
    </div>
  )
}

/* ---------- tab: Buchungen (vf) ---------- */

const ADMIN_INPUT = 'h-10 rounded-md border border-foreground-950/15 bg-foreground-950/[0.03] px-3 text-[13px] text-foreground-950 transition-colors focus:outline-none focus:border-primary-500 [color-scheme:dark]'

function BookingsTab({ catalog }: { catalog: Catalog }) {
  const [rows, setRows] = useState<AdminReservation[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [courtId, setCourtId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [detail, setDetail] = useState<AdminReservation | null>(null)
  const [newModal, setNewModal] = useState(false)

  function load() {
    setLoading(true)
    apiAdmin<{ ok: boolean; reservations: AdminReservation[] }>('bookings', {
      from: from || undefined, to: to || undefined, status: status || undefined, court_id: courtId || undefined,
    })
      .then((r) => setRows(r.reservations ?? []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }
  useEffect(load, [from, to, status, courtId])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter((r) =>
      [r.reference, r.customer_name, r.customer_email, r.customer_phone ?? ''].some((v) => v.toLowerCase().includes(needle)),
    )
  }, [rows, q])

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2.5">
        <label className="relative">
          <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-foreground-600" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Referenz, Name, E-Mail, Telefon" className={`${ADMIN_INPUT} w-64 pl-8`} />
        </label>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={ADMIN_INPUT}>
          <option value="">Alle Status</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={courtId} onChange={(e) => setCourtId(e.target.value)} className={ADMIN_INPUT}>
          <option value="">Alle Plätze</option>
          {catalog.courts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${ADMIN_INPUT} [color-scheme:dark]`} aria-label="Von" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${ADMIN_INPUT} [color-scheme:dark]`} aria-label="Bis" />
        <button onClick={load} aria-label="Aktualisieren" className="w-10 h-10 rounded-full border border-foreground-950/20 cursor-pointer hover:border-primary-500/60 flex items-center justify-center"><i className="ri-refresh-line" /></button>
        <button onClick={() => setNewModal(true)} className="h-10 px-4 rounded-full bg-primary-500 text-background-50 text-[13px] font-semibold cursor-pointer hover:bg-primary-400 sm:ml-auto">Neue Buchung</button>
      </div>

      <div className="mt-4 bg-background-100 border border-foreground-950/[0.08] rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[820px]">
          <thead>
            <tr className="text-left text-xs text-foreground-600 border-b border-foreground-950/[0.08]">
              {['Reference', 'Kunde', 'Platz', 'Wann', 'Dur.', 'Price', 'Status'].map((h) => (
                <th key={h} className="px-4 py-3 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-foreground-950/[0.05]">
            {loading && <tr><td colSpan={7} className="px-4 py-6 text-foreground-600">Wird geladen…</td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-foreground-600">Keine Buchungen für diese Filter.</td></tr>}
            {!loading && filtered.map((r) => (
              <tr key={r.id} onClick={() => setDetail(r)} className="hover:bg-foreground-950/[0.03] cursor-pointer">
                <td className="px-4 py-3 font-label text-xs">{r.reference}</td>
                <td className="px-4 py-3">
                  <span className="block">{r.customer_name}</span>
                  <span className="block text-xs text-foreground-600">{r.customer_email}</span>
                </td>
                <td className="px-4 py-3">{r.court_name}</td>
                <td className="px-4 py-3 tabular-nums">{berlinDateKey(r.start_at)} · {berlinTime(r.start_at)}</td>
                <td className="px-4 py-3 tabular-nums">{r.duration_minutes} min</td>
                <td className="px-4 py-3 tabular-nums">{formatPrice(r.fee_cents / 100)}</td>
                <td className="px-4 py-3"><StatusChip status={r.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {detail && <DetailModal r={detail} onClose={() => setDetail(null)} />}
      {newModal && <NewBookingModal courts={catalog.courts} onClose={() => setNewModal(false)} onSaved={load} />}
    </div>
  )
}

function NewBookingModal({ courts, onClose, onSaved }: { courts: Court[]; onClose: () => void; onSaved: () => void }) {
  const [courtId, setCourtId] = useState(courts[0]?.id ?? '')
  const [date, setDate] = useState(berlinToday())
  const [start, setStart] = useState('09:00')
  const [duration, setDuration] = useState(30)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setBusy(true)
    setError('')
    const r = await api<{ ok: boolean; error?: string; message?: string }>('create', {
      court_id: courtId, date, start_time: start, duration, name, email, phone,
      idempotency_key: `admin-${Date.now()}`,
    })
    setBusy(false)
    if (r.ok) {
      onSaved()
      onClose()
    } else {
      setError(r.message ?? r.error ?? 'Buchung nicht möglich.')
    }
  }

  const inputCls = 'mt-2 w-full box-border bg-foreground-950/[0.04] border border-foreground-950/15 rounded-md px-4 py-2.5 text-[14px] text-foreground-950 transition-colors focus:outline-none focus:border-primary-500'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-background-950/60" onClick={onClose} />
      <div className="relative w-full max-w-md ro-card p-6">
        <p className="ro-eyebrow text-primary-500">Neue Buchung</p>
        <h3 className="mt-2 ro-card-title">Manuell eintragen</h3>
        <label className="block mt-5">
          <span className="ro-eyebrow text-foreground-600">Platz</span>
          <select value={courtId} onChange={(e) => setCourtId(e.target.value)} className={inputCls}>
            {courts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <label className="block col-span-1">
            <span className="ro-eyebrow text-foreground-600">Datum</span>
            <input type="date" value={date} min={berlinToday()} onChange={(e) => setDate(e.target.value)} className={`${inputCls} [color-scheme:dark]`} />
          </label>
          <label className="block">
            <span className="ro-eyebrow text-foreground-600">Start</span>
            <input type="time" step={1800} value={start} onChange={(e) => setStart(e.target.value)} className={`${inputCls} [color-scheme:dark]`} />
          </label>
          <label className="block">
            <span className="ro-eyebrow text-foreground-600">Dauer</span>
            <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className={inputCls}>
              {[30, 60, 90].map((d) => <option key={d} value={d}>{d} min</option>)}
            </select>
          </label>
        </div>
        <label className="block mt-4">
          <span className="ro-eyebrow text-foreground-600">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        </label>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="ro-eyebrow text-foreground-600">E-Mail</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
          </label>
          <label className="block">
            <span className="ro-eyebrow text-foreground-600">Telefon</span>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
          </label>
        </div>
        {error && <p className="mt-4 text-[13px] text-red-300">{error}</p>}
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="h-11 px-5 rounded-full border border-foreground-950/20 text-[14px] font-medium cursor-pointer hover:border-primary-500/60">Abbrechen</button>
          <button onClick={save} disabled={busy || !courtId || !date || !name || !email} className="h-11 px-5 rounded-full bg-primary-500 text-background-50 text-[14px] font-medium cursor-pointer hover:bg-primary-400 disabled:opacity-50">
            {busy ? 'Saving…' : 'Buchen'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ---------- page shell (Of) ---------- */

export function AdminPage() {
  const [checking, setChecking] = useState(true)
  const [user, setUser] = useState<AppUser | null>(null)
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('overview')
  const navigate = useNavigate()

  useEffect(() => {
    apiAdmin<{ ok: boolean; user: AppUser | null }>('me')
      .then((r) => {
        const u = r.ok ? r.user : null
        if (u && (u.role === 'admin' || u.role === 'owner')) {
          setUser(u)
          getBootstrap().then(setCatalog).catch(() => setCatalog(null)).finally(() => setChecking(false))
        } else {
          setChecking(false)
        }
      })
      .catch(() => setChecking(false))
  }, [])

  async function signOut() {
    await apiAuth('signout', {})
    navigate('/sign-in')
  }

  if (checking) {
    return (
      <div className="ro min-h-screen bg-background-50 flex flex-col items-center justify-center gap-5 px-4 text-center">
        <Link to="/" className="tracking-[0.32em] text-[13px] font-semibold text-foreground-950">TENNISHALLE</Link>
        <p className="ro-body text-foreground-700 flex items-center gap-3">Zugriff wird geprüft <i className="ri-loader-4-line animate-spin" /></p>
      </div>
    )
  }

  if (!user || !catalog) {
    return (
      <div className="ro min-h-screen bg-background-50 flex flex-col items-center justify-center gap-5 px-4 text-center">
        <Link to="/" className="tracking-[0.32em] text-[13px] font-semibold text-foreground-950">TENNISHALLE</Link>
        <p className="ro-eyebrow text-primary-500">Vereins-Tresen</p>
        <h2 className="ro-h2 text-foreground-950">Kein Besitzer-Zugriff</h2>
        <p className="ro-body text-foreground-700 max-w-md">Du bist angemeldet, aber dieses Konto ist nicht der Vereinsbesitzer.</p>
        <div className="flex gap-3">
          <Link to="/account" className="h-12 inline-flex items-center px-6 rounded-full border border-foreground-950/20 text-[14px] font-medium hover:border-primary-500/60">Mein Konto</Link>
          <Link to="/" className="h-12 inline-flex items-center px-6 rounded-full bg-primary-500 text-background-50 text-[14px] font-medium hover:bg-primary-400">Zur Startseite</Link>
        </div>
      </div>
    )
  }

  const activeLabel = TABS.find((t) => t.id === tab)?.label ?? ''

  return (
    <div className="ro min-h-screen bg-background-50 flex">
      <aside className="hidden lg:flex w-64 shrink-0 sticky top-0 h-screen border-r border-foreground-950/[0.07] flex-col px-4 py-8">
        <Link to="/" className="px-3 tracking-[0.32em] text-[13px] font-semibold text-foreground-950">TENNISHALLE</Link>
        <nav className="mt-8 flex flex-col gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              aria-pressed={tab === t.id}
              className={`h-11 px-4 rounded-full text-[14px] flex gap-3 items-center cursor-pointer transition-colors ${
                tab === t.id ? 'bg-primary-500 text-background-50 font-medium' : 'text-foreground-700 hover:bg-foreground-950/[0.05]'
              }`}
            >
              <i className={`${t.icon} text-base`} />
              {t.label}
            </button>
          ))}
        </nav>
        <div className="mt-8 pt-6 border-t border-foreground-950/[0.07] flex flex-col gap-1">
          <p className="px-4 ro-eyebrow text-foreground-600">Website</p>
          <a href="/" className="h-11 px-4 rounded-full text-[14px] flex gap-3 items-center text-foreground-700 hover:bg-foreground-950/[0.05]"><i className="ri-global-line text-base" />Plätze ansehen</a>
          <a href="/book" className="h-11 px-4 rounded-full text-[14px] flex gap-3 items-center text-foreground-700 hover:bg-foreground-950/[0.05]"><i className="ri-calendar-check-line text-base" />Buchungsseite</a>
        </div>
        <div className="mt-auto px-3 pt-6 border-t border-foreground-950/[0.07]">
          <p className="ro-eyebrow text-foreground-600">Besitzer</p>
          <p className="mt-1 text-[13px] text-foreground-800 break-all">{user.email}</p>
          <button onClick={signOut} className="mt-3 inline-flex items-center gap-2 text-[13px] font-semibold text-foreground-700 hover:text-foreground-950 cursor-pointer">
            <i className="ri-logout-box-r-line" />Abmelden
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="lg:hidden sticky top-0 z-30 bg-background-50/90 backdrop-blur-md border-b border-foreground-950/[0.07] px-4 py-3 flex items-center justify-between gap-3">
          <Link to="/" className="tracking-[0.32em] text-[12px] font-semibold text-foreground-950">TENNISHALLE</Link>
          <button onClick={signOut} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-foreground-700 hover:text-foreground-950 cursor-pointer">
            <i className="ri-logout-box-r-line" />Abmelden
          </button>
        </header>
        <nav className="lg:hidden flex gap-1.5 overflow-x-auto px-4 py-2.5 border-b border-foreground-950/[0.07]">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`h-9 px-4 shrink-0 rounded-full text-[13px] flex gap-2 items-center cursor-pointer transition-colors ${
                tab === t.id ? 'bg-primary-500 text-background-50 font-medium' : 'text-foreground-700 hover:bg-foreground-950/[0.05]'
              }`}
            >
              <i className={t.icon} />
              {t.label}
            </button>
          ))}
        </nav>

        <div className="hidden lg:flex h-20 px-10 border-b border-foreground-950/[0.07] items-center justify-between gap-3">
          <h2 className="ro-h2 !text-[32px]">{activeLabel}</h2>
          <a href="/" className="h-10 inline-flex items-center px-5 rounded-full border border-foreground-950/20 text-[13px] font-medium hover:border-primary-500/60">Website ansehen</a>
        </div>

        <main className="px-4 md:px-10 py-6 md:py-10">
          {tab === 'overview' && <OverviewTab catalog={catalog} onNavigate={setTab} />}
          {tab === 'courts' && <CourtsTab catalog={catalog} onCatalogReload={() => getBootstrap().then(setCatalog).catch(() => {})} />}          {tab === 'calendar' && <CalendarTab catalog={catalog} />}
          {tab === 'bookings' && <BookingsTab catalog={catalog} />}
{tab === 'partners' && <PartnersTab />}
{tab === 'content' && <ContentTab />}
{tab === 'legal' && <LegalTab />}
{tab === 'messages' && <MessagesTab />}
        </main>
      </div>
    </div>
  )
}
