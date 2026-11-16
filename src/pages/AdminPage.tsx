import { useEffect, useMemo, useState } from 'react'
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

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="ro-card p-4 md:p-5">
      <p className="ro-eyebrow text-foreground-600">{label}</p>
      <p className="mt-2 font-heading text-[28px] md:text-[32px] leading-none text-foreground-950 tabular-nums">{value}</p>
      {sub && <p className="mt-1.5 text-[12px] text-foreground-600">{sub}</p>}
    </div>
  )
}

function OverviewTab({ catalog }: { catalog: Catalog }) {
  const [stats, setStats] = useState<StatsData | null>(null)
  const [error, setError] = useState('')
  const currency = catalog.settings?.currency ?? 'EUR'

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
  const monthRevenue = stats.perMonth.map((m) => Number(m.revenue) / 100)
  const weekdayMap = new Map(stats.perWeekday.map((w) => [Number(w.weekday), Number(w.bookings)]))
  const weekdayValues = [1, 2, 3, 4, 5, 6, 0].map((d) => weekdayMap.get(d) ?? 0)
  const weekdayLabels = [1, 2, 3, 4, 5, 6, 0].map((d) => WD_SHORT[d])
  const hourMap = new Map(stats.perHour.map((h) => [Number(h.hour), Number(h.bookings)]))
  const hourValues: number[] = []
  const hourLabels: string[] = []
  for (let h = 6; h <= 23; h++) {
    hourValues.push(hourMap.get(h) ?? 0)
    hourLabels.push(String(h))
  }
  const statusMap = new Map(stats.statuses.map((s) => [s.status, Number(s.cnt)]))
  const leadOrder = ['<1 Tag', '1-2 Tage', '3-6 Tage', '1 Woche', '2-4 Wochen', '>1 Monat']
  const leadItems = leadOrder
    .map((b) => ({ label: b, value: Number(stats.lead.find((l) => l.lead_bucket === b)?.cnt ?? 0) }))
    .filter((i) => i.value > 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Buchungen heute" value={String(k.bookings.today)} />
        <KpiCard label="Buchungen Woche" value={String(k.bookings.week)} />
        <KpiCard label="Buchungen Monat" value={String(k.bookings.month)} />
        <KpiCard label="Buchungen Jahr" value={String(k.bookings.year)} />
        <KpiCard label="Umsatz heute" value={formatPrice(k.revenue_cents.today / 100, currency)} />
        <KpiCard label="Umsatz Woche" value={formatPrice(k.revenue_cents.week / 100, currency)} />
        <KpiCard label="Umsatz Monat" value={formatPrice(k.revenue_cents.month / 100, currency)} />
        <KpiCard label="Umsatz Jahr" value={formatPrice(k.revenue_cents.year / 100, currency)} />
        <KpiCard label="Kunden (1 Jahr)" value={String(k.customers)} />
        <KpiCard label="Storniert" value={String(k.cancelled)} />
        <KpiCard label="Auslastung 30 Tage" value={`${Math.round(k.utilization * 100)} %`} sub="bestätigte Slots / öffnungszeiten" />
        <KpiCard label="Buchungen gesamt" value={String(k.bookings.total)} sub={formatPrice(k.revenue_cents.total / 100, currency)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Buchungen — 30 Tage">
          <Bars values={dayBookings} labels={dayLabels} hint={(i) => `${stats.perDay[i].day}: ${dayBookings[i]} Buchungen`} />
        </Panel>
        <Panel title="Besuche — 30 Tage">
          <Bars values={dayViews} labels={dayLabels} hint={(i) => `${stats.perDay[i].day}: ${dayViews[i]} Besuche`} />
        </Panel>
        <Panel title="Buchungen — 12 Monate">
          <Bars values={monthBookings} labels={monthLabels} hint={(i) => `${stats.perMonth[i].month}: ${monthBookings[i]} Buchungen`} />
        </Panel>
        <Panel title="Umsatz — 12 Monate">
          <Bars values={monthRevenue} labels={monthLabels} hint={(i) => `${stats.perMonth[i].month}: ${formatPrice(monthRevenue[i], currency)}`} />
        </Panel>
        <Panel title="Wochentage (1 Jahr)">
          <Bars values={weekdayValues} labels={weekdayLabels} hint={(i) => `${weekdayLabels[i]}: ${weekdayValues[i]} Buchungen`} />
        </Panel>
        <Panel title="Beliebte Zeiten (1 Jahr)">
          <Bars values={hourValues} labels={hourLabels} hint={(i) => `${hourLabels[i]}:00 — ${hourValues[i]} Buchungen`} />
        </Panel>
        <Panel title="Plätze im Vergleich (1 Jahr)">
          <HBars items={stats.perCourt.map((c) => ({ label: c.name, value: Number(c.bookings) }))} format={(n) => `${n}`} />
        </Panel>
        <Panel title="Vorlaufzeit der Buchungen">
          {leadItems.length > 0
            ? <HBars items={leadItems} format={(n) => `${n}`} />
            : <p className="text-[13px] text-foreground-600">Noch keine Daten.</p>}
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Status aller Buchungen">
          <div className="flex flex-wrap gap-2.5">
            {[...statusMap.entries()].map(([s, c]) => (
              <span key={s} className="inline-flex items-center gap-2">
                <StatusChip status={s} />
                <span className="text-[13px] tabular-nums text-foreground-800">{c}</span>
              </span>
            ))}
            {statusMap.size === 0 && <p className="text-[13px] text-foreground-600">Noch keine Buchungen.</p>}
          </div>
        </Panel>
        <Panel title="Top-Kunden">
          <ul className="flex flex-col divide-y divide-foreground-950/[0.06]">
            {stats.topCustomers.map((c, i) => (
              <li key={i} className="py-2.5 flex items-center justify-between gap-3 text-[13px]">
                <span className="min-w-0 truncate"><span className="font-semibold text-foreground-950">{c.customer_name || c.customer_email}</span><span className="ml-2 text-foreground-600">{c.customer_email}</span></span>
                <span className="shrink-0 tabular-nums text-foreground-800">{c.bookings} × {formatPrice(Number(c.revenue) / 100, currency)}</span>
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

function CourtsTab({ catalog, onCatalogReload }: { catalog: Catalog; onCatalogReload: () => void }) {
  const [courts, setCourts] = useState<AdminCourt[]>([])
  const [venues, setVenues] = useState<Venue[]>([])
  const [zones, setZones] = useState<Zone[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [editing, setEditing] = useState<AdminCourt | 'new' | null>(null)
  const [zoneCourt, setZoneCourt] = useState<string | null>(null) // court whose zones panel is open
  const [editingZone, setEditingZone] = useState<Zone | 'new' | null>(null)

  const load = async () => {
    setError('')
    try {
      const r = await apiAdmin<{ ok: boolean; courts: AdminCourt[]; venues: Venue[] }>('courts', {})
      const z = await apiAdmin<{ ok: boolean; zones: Zone[] }>('zones', {})
      if (r.ok) setCourts(r.courts)
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
                    {c.environment ?? 'Halle'} · {c.surface ?? '—'} · {c.hourly_price != null ? `${Number(c.hourly_price).toFixed(2).replace('.', ',')} € / Std.` : 'keine Preisangabe'} · {c.hours_count ?? 0} Öffnungszeiten · {c.zone_count ?? courtZones(c.id).length} Preiszonen
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button onClick={() => setEditing(c)} className="h-9 px-4 rounded-full border border-foreground-950/20 text-[13px] font-medium hover:border-primary-500/60 cursor-pointer">
                      <i className="ri-edit-line mr-1" />Bearbeiten
                    </button>
                    <button onClick={() => setZoneCourt(zoneCourt === c.id ? null : c.id)} className="h-9 px-4 rounded-full border border-foreground-950/20 text-[13px] font-medium hover:border-primary-500/60 cursor-pointer">
                      <i className="ri-price-tag-3-line mr-1" />Preiszonen ({courtZones(c.id).length})
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

              {zoneCourt === c.id && (
                <div className="mt-5 pt-5 border-t border-foreground-950/10">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <p className="ro-eyebrow text-foreground-600">Preiszonen · {c.name}</p>
                    <button onClick={() => setEditingZone('new')} className="h-8 px-3 rounded-full bg-primary-500 text-background-50 text-[12px] font-medium hover:bg-primary-400 cursor-pointer">
                      <i className="ri-add-line" />Zone
                    </button>
                  </div>
                  {courtZones(c.id).length === 0 ? (
                    <p className="text-[13px] text-foreground-500 py-2">Noch keine Zonen — Gäste zahlen den Stundenpreis.</p>
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
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {editing && <CourtModal court={editing === 'new' ? null : editing} venues={venues} onClose={() => setEditing(null)} onSaved={(msg) => { setEditing(null); setMessage(msg); load(); onCatalogReload() }} />}
      {editingZone && zoneCourt && <ZoneModal zone={editingZone === 'new' ? null : editingZone} courtId={zoneCourt} courts={courts} onClose={() => setEditingZone(null)} onSaved={(msg) => { setEditingZone(null); setMessage(msg); load() }} />}
    </div>
  )
}

function CourtModal({ court, venues, onClose, onSaved }: { court: AdminCourt | null; venues: Venue[]; onClose: () => void; onSaved: (msg: string) => void }) {
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
  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }))

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
          <label className="block"><span className="ro-eyebrow text-foreground-600">Std-Preis (€)</span>
            <input type="number" step="0.01" value={form.hourly_price} onChange={(e) => set('hourly_price', e.target.value)} className={ADMIN_FIELD_CLS} placeholder="22" /></label>
        </div>
        <label className="block mt-4"><span className="ro-eyebrow text-foreground-600">Bild-URL</span>
          <input value={form.image_url} onChange={(e) => set('image_url', e.target.value)} className={ADMIN_FIELD_CLS} placeholder="/assets/img/… oder https://…" /></label>
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
              const r = await apiAdmin<{ ok: boolean; message?: string }>('save_court', { ...form, id: court?.id })
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
          {tab === 'overview' && <OverviewTab catalog={catalog} />}
          {tab === 'courts' && <CourtsTab catalog={catalog} onCatalogReload={() => getBootstrap().then(setCatalog).catch(() => {})} />}
          {tab === 'calendar' && <CalendarTab catalog={catalog} />}
          {tab === 'bookings' && <BookingsTab catalog={catalog} />}
        </main>
      </div>
    </div>
  )
}
