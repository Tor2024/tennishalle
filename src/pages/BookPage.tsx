import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Nav } from '../components/Nav'
import { Footer } from '../components/Footer'
import {
  api,
  formatPrice,
  getCourts,
  getClubSettings,
  hhmmToMin,
  minToHHMM,
  type ClubSettings,
  type Court,
  type Venue,
  type DayOverview,
  type SlotInfo,
} from '../lib/supabase'

// 30-Minuten-Intervals: 30 / 60 / 90 Minuten
const DURATIONS = [30, 60, 90] as const
import { addDays, dateParts, dateShort, todayInTz } from '../lib/dates'

const STEPS = ['Anlage', 'Datum & Dauer', 'Platz & Zeit', 'Angaben', 'Prüfen']
const TITLES = ['Anlage wählen', 'Datum & Dauer', 'Platz & Zeit wählen', 'Deine Angaben', 'Prüfen & absenden']

interface AvailabilityResp {
  ok?: boolean
  closed?: boolean
  times?: SlotInfo[]
  message?: string
}

interface CreateResp {
  ok?: boolean
  reservation?: { reference: string; status: string; start_at: string; end_at: string; court_name?: string; venue_name?: string; price?: number | null; currency?: string }
  message?: string
}

/* ---------- pill button (hd) ---------- */

function StepPill({
  label,
  onClick,
  variant,
  icon,
  disabled,
  busy,
}: {
  label: string
  onClick: () => void
  variant: 'lime' | 'dark'
  icon?: string
  disabled?: boolean
  busy?: boolean
}) {
  const lime = variant === 'lime'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      aria-label={label}
      className={`group box-border inline-flex h-12 items-center justify-between sm:justify-center gap-3 rounded-full border pl-5 pr-[5px] whitespace-nowrap text-[15px] font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
        lime
          ? 'bg-primary-500 text-background-950 border-transparent'
          : 'bg-foreground-950/[0.05] text-foreground-950 border-foreground-950/20 hover:border-primary-500/60'
      }`}
    >
      <span className={lime ? 'font-bold' : ''}>{label}</span>
      <span
        className={`flex h-9 w-9 items-center justify-center rounded-full ${
          lime ? 'bg-background-50 text-primary-500' : 'bg-primary-500 text-background-50'
        }`}
      >
        <i className={`${busy ? 'ri-loader-4-line animate-spin' : icon ?? 'ri-arrow-right-up-line'} text-base`} />
      </span>
    </button>
  )
}

/* ---------- steps header (pd) ---------- */

function StepsHeader({ current, onJump }: { current: number; onJump: (i: number) => void }) {
  return (
    <div>
      <p className="ro-eyebrow text-foreground-500">
        Schritt{' '}
        <span className="text-primary-500 tabular-nums font-bold">
          {String(current + 1).padStart(2, '0')}
        </span>{' '}
        / {String(STEPS.length).padStart(2, '0')}
        <span className="sm:hidden font-bold text-foreground-950"> · {STEPS[current]}</span>
      </p>
      <ol className="mt-3 grid grid-cols-6 gap-1.5">
        {STEPS.map((label, i) => (
          <li key={label}>
            <button
              type="button"
              onClick={() => i < current && onJump(i)}
              disabled={i >= current}
              aria-label={label}
              className="w-full cursor-pointer disabled:cursor-default"
            >
              <span
                className={`block h-[3px] rounded-full ${
                  i <= current ? 'bg-primary-500' : 'bg-foreground-950/[0.12]'
                } ${i < current ? 'hover:bg-primary-400 hover:opacity-60' : ''}`}
              />
              <span
                className={`hidden sm:block mt-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] truncate ${
                  i === current ? 'text-foreground-950' : 'text-foreground-500'
                }`}
              >
                {label}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}

/* ---------- step footer (gd) ---------- */

function StepFooter({
  onBack,
  onNext,
  nextLabel,
  nextDisabled,
  busy,
}: {
  onBack: () => void
  onNext: () => void
  nextLabel: string
  nextDisabled?: boolean
  busy?: boolean
}) {
  return (
    <div className="mt-8 pt-6 border-t border-foreground-950/[0.08] flex flex-col-reverse sm:flex-row sm:justify-between gap-3">
      <StepPill label="Zurück" variant="dark" icon="ri-arrow-left-line" onClick={onBack} />
      <StepPill label={nextLabel} variant="lime" onClick={onNext} disabled={nextDisabled} busy={busy} />
    </div>
  )
}

/* ---------- sidebar (Qd) ---------- */

function Sidebar({
  image,
  imageAlt,
  courtNumber,
  summary,
  fee,
  filled,
}: {
  image: string
  imageAlt: string
  courtNumber: string | null
  summary: [string, string | null][]
  fee: number | null
  filled: number
}) {
  return (
    <aside className="lg:sticky lg:top-24">
      <p className="ro-body max-w-[420px] text-foreground-700">
        Vereinszeit (Europe/Berlin). Es wird nichts online abgebucht. Die Platzgebühr zahlst du im Verein.
      </p>
      <div className="hidden md:block mt-7 h-[240px] lg:min-h-[240px] rounded-lg overflow-hidden ro-frame relative">
        <img src={image} alt={imageAlt} className="ro-img-court absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-background-50/60 to-transparent" />
        {courtNumber && (
          <span className="absolute bottom-3 left-4 font-wordmark text-5xl text-primary-500 leading-none">{courtNumber}</span>
        )}
      </div>
      <div className="mt-4 ro-card px-5 py-4">
        <div className="flex items-center justify-between">
          <p className="ro-eyebrow text-foreground-600">Deine Reservierung</p>
          <span className="text-[13px] tabular-nums text-foreground-600">{filled}/4</span>
        </div>
        <dl className="divide-y divide-foreground-950/[0.08] mt-1">
          {summary.map(([k, v]) => (
            <div key={k} className="py-2.5 flex justify-between gap-4 text-[14px]">
              <dt className="text-foreground-600">{k}</dt>
              <dd className={`text-right break-all ${v ? 'text-foreground-950' : 'text-foreground-500/70'}`}>
                {v ?? 'Nicht gewählt'}
              </dd>
            </div>
          ))}
        </dl>
        <div className="mt-1 pt-3 border-t border-foreground-950/[0.12] flex items-center justify-between">
          <p className="ro-eyebrow text-foreground-600">Platzgebühr</p>
          <p className="text-[24px] font-bold text-primary-500 tabular-nums">{fee !== null ? formatPrice(fee) : '—'}</p>
        </div>
      </div>
    </aside>
  )
}

/* ---------- step 0: venue (md) ---------- */

function VenueStep({
  venues,
  courts,
  selected,
  onSelect,
}: {
  venues: Venue[]
  courts: Court[]
  selected: string | null
  onSelect: (id: string) => void
}) {
  if (venues.length === 0) return <p className="ro-body text-foreground-700">Aktuell ist keine Anlage buchbar.</p>
  return (
    <div className="grid md:grid-cols-2 gap-4">
      {venues.map((v) => {
        const vc = courts.filter((c) => c.venue_id === v.id)
        const img = vc.find((c) => c.image_url)?.image_url ?? '/assets/img/gen-02.webp'
        const surfaces = [...new Set(vc.map((c) => c.surface).filter(Boolean))] as string[]
        const sel = selected === v.id
        return (
          <button
            key={v.id}
            type="button"
            onClick={() => onSelect(v.id)}
            aria-pressed={sel}
            className="group text-left rounded-lg overflow-hidden border transition-colors duration-300 cursor-pointer bg-foreground-950/[0.03] border-foreground-950/10 hover:border-foreground-950/30"
          >
            <div className="relative w-full h-40 md:h-48 overflow-hidden bg-background-100">
              <img src={img} alt={`${v.name} Tennisanlage`} className="ro-img-court w-full h-full object-cover object-top" />
              <span className="absolute top-3 left-3 ro-chip rounded-full px-2.5 py-0.5 text-[12px] text-foreground-800 backdrop-blur">
                {vc.length} {vc.length === 1 ? 'Platz' : 'Plätze'}
              </span>
              <span
                className={`absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center ${
                  sel ? 'bg-primary-500 text-background-50' : 'border border-foreground-950/30 text-transparent'
                }`}
              >
                <i className="ri-check-line text-base" />
              </span>
            </div>
            <div className="p-4 md:p-5">
              <p className="ro-card-title">{v.name}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {surfaces.map((s) => (
                  <span key={s} className="ro-chip rounded-full px-2.5 py-0.5 text-[12px] text-foreground-800 capitalize">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}

/* ---------- step 2: date & duration (yd) ---------- */

const LEGEND = [
  { color: '#5ad06e', label: 'Alles frei' },
  { color: '#4aa8ff', label: 'Teilweise belegt' },
  { color: '#ff5a5a', label: 'Ausgebucht' },
]

function DateStep({
  settings,
  date,
  duration,
  overview,
  onChange,
  onBack,
  onNext,
}: {
  settings: ClubSettings
  date: string
  duration: 30 | 60 | 90
  overview: DayOverview[]
  onChange: (patch: { date?: string; duration?: number }) => void
  onBack: () => void
  onNext: () => void
}) {
  const tz = settings.timezone
  const days = Array.from({ length: 7 }, (_, i) => addDays(todayInTz(tz), i))
  const colorFor = (d: string) => {
    const o = overview.find((x) => x.date === d)
    if (!o || o.total === 0) return undefined
    if (o.free <= 0) return '#ff5a5a'
    if (o.free < o.total) return '#4aa8ff'
    return '#5ad06e'
  }

  return (
    <div>
      <p className="ro-eyebrow text-foreground-600">Datum</p>
      <div className="mt-3 flex flex-wrap gap-3 text-[13px] text-foreground-700">
        {LEGEND.map((l) => (
          <span key={l.label} className="inline-flex items-center gap-1.5">
            <span className="font-bold tabular-nums" style={{ color: l.color }}>
              12
            </span>
            {l.label}
          </span>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-4 sm:grid-cols-7 gap-2">
        {days.map((d, i) => {
          const p = dateParts(d)
          const sel = date === d
          return (
            <button
              key={d}
              type="button"
              onClick={() => onChange({ date: d })}
              aria-pressed={sel}
              className={`rounded-lg border p-3 text-center transition-colors cursor-pointer ${
                sel ? 'border-primary-500 bg-primary-500/[0.12]' : 'border-foreground-950/10 hover:border-foreground-950/30'
              }`}
            >
              <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground-600">
                {i === 0 ? 'Heute' : p.wd}
              </span>
              <span className="block mt-1 text-[22px] font-bold tabular-nums" style={{ color: colorFor(d) }}>
                {p.day}
              </span>
              <span className="block text-[11px] uppercase tracking-[0.12em] text-foreground-500">{p.mon}</span>
            </button>
          )
        })}
      </div>

      <label className="block mt-5 max-w-xs">
        <span className="ro-eyebrow text-foreground-600">Späteres Datum (bis zu {settings.booking_window_days} Tage im Voraus)</span>
        <input
          type="date"
          value={date}
          min={todayInTz(tz)}
          max={addDays(todayInTz(tz), settings.booking_window_days)}
          onChange={(e) => onChange({ date: e.target.value || date })}
          className="mt-2 h-11 w-full rounded-full border border-foreground-950/15 bg-transparent px-4 text-[15px] text-foreground-950 [color-scheme:dark] focus:border-primary-500/60 focus:outline-none transition-colors"
        />
      </label>

      <p className="mt-8 ro-eyebrow text-foreground-600">Dauer</p>
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
        {DURATIONS.map((d) => {
          const sel = duration === d
          return (
            <button
              key={d}
              type="button"
              onClick={() => onChange({ duration: d })}
              aria-pressed={sel}
              className={`relative h-14 rounded-lg border transition-colors cursor-pointer ${
                sel ? 'border-primary-500 bg-primary-500/[0.08]' : 'border-foreground-950/10 hover:border-foreground-950/30'
              }`}
            >
              <span className="text-[18px] font-bold text-foreground-950">{d}</span>
              <span className="text-[13px] text-foreground-600 ml-1">min</span>
              {sel && (
                <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary-500 text-background-50 flex items-center justify-center">
                  <i className="ri-check-line text-xs" />
                </span>
              )}
            </button>
          )
        })}
      </div>

      <StepFooter onBack={onBack} onNext={onNext} nextLabel="Zeiten ansehen" nextDisabled={!date || !DURATIONS.includes(duration)} />
    </div>
  )
}

/* ---------- step 3: time list (bd) ---------- */

/* ---------- step 1+2 merged: court × time table (tz) ---------- */

const SLOT_START = 6   // 06:00
const SLOT_END = 23    // 23:00 (last slot 23:00–23:30)

function slotTimes(): string[] {
  const out: string[] = []
  for (let h = SLOT_START; h < SLOT_END; h++) {
    out.push(`${String(h).padStart(2,'0')}:00`)
    out.push(`${String(h).padStart(2,'0')}:30`)
  }
  return out
}

const SLOTS = slotTimes()

interface TableSlot {
  courtId: string
  time: string
  available: boolean
}

function TimeTable({
  courts,
  date,
  duration,
  selected,
  onSelect,
  onBack,
}: {
  courts: Court[]
  date: string
  duration: 30 | 60 | 90
  selected: { courtId: string | null; time: string | null } | null
  onSelect: (courtId: string, time: string) => void
  onBack: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [table, setTable] = useState<Map<string, TableSlot>>(new Map())

  const load = async () => {
    setBusy(true)
    const m = new Map<string, TableSlot>()
    await Promise.all(courts.map(async (c) => {
      try {
        const r = await api<AvailabilityResp>('availability', { court_id: c.id, date, duration })
        ;(r.times ?? []).forEach((t) => m.set(`${c.id}|${t.time}`, { courtId: c.id, time: t.time, available: t.available }))
      } catch { /* keep missing as unknown */ }
    }))
    setTable(m)
    setBusy(false)
  }

  useEffect(() => { load() }, [courts.length, date, duration])

  const selCourt = selected?.courtId ?? null
  const selTime = selected?.time ?? null

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <span className="ro-chip rounded-full px-3 py-1.5 text-[13px] text-foreground-800">{dateShort(date)}</span>
        <span className="ro-chip rounded-full px-3 py-1.5 text-[13px] text-foreground-800">{duration} min</span>
        <button
          type="button"
          onClick={load}
          disabled={busy}
          className="ml-auto inline-flex items-center gap-2 h-9 px-4 rounded-full border border-foreground-950/15 text-[13px] font-semibold text-foreground-800 cursor-pointer hover:border-foreground-950/40 transition-colors disabled:opacity-50"
        >
          <i className={`ri-refresh-line ${busy ? 'animate-spin' : ''}`} />
          Aktualisieren
        </button>
      </div>

      {busy && table.size === 0 ? (
        <div className="mt-6 grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-6 gap-2">
          {Array.from({ length: 18 }).map((_, i) => (
            <div key={i} className="h-12 rounded-md bg-foreground-950/[0.06] animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr>
                <th className="text-left py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground-600 w-24">Zeit</th>
                {courts.map((c) => (
                  <th key={c.id} className="py-3 text-center text-[12px] font-semibold text-foreground-900">
                    <span className="block text-foreground-700">{c.name}</span>
                    <span className="block text-[10px] text-foreground-500">{c.surface ?? ''}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SLOTS.map((time) => (
                <tr key={time} className="border-t border-foreground-950/10">
                  <td className="py-2.5 text-[13px] tabular-nums text-foreground-800 font-medium whitespace-nowrap">{time} – {minToHHMM(hhmmToMin(time) + duration)}</td>
                  {courts.map((c) => {
                    const s = table.get(`${c.id}|${time}`)
                    const available = s?.available ?? true
                    const isSel = selCourt === c.id && selTime === time
                    return (
                      <td key={c.id} className="py-2.5">
                        <button
                          type="button"
                          disabled={!available || busy}
                          onClick={() => available && onSelect(c.id, time)}
                          aria-pressed={isSel}
                          aria-label={`${time} ${c.name} ${available ? 'verfügbar' : 'belegt'}`}
                          className="block w-full rounded-md border transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                            isSel
                              ? 'bg-primary-500 text-background-50 border-primary-500 font-bold'
                              : available
                                ? 'bg-foreground-950/[0.04] border-foreground-950/15 text-foreground-950 font-medium hover:border-primary-500/70'
                                : 'bg-foreground-950/[0.03] border-foreground-950/10 text-foreground-400'
                          }"
                        >
                          {time}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-4 text-[13px] text-foreground-600">
            Belegte Slots sind grau und nicht anklickbar. Wähle eine freie Zelle.
          </p>
        </div>
      )}

      <StepFooter onBack={onBack} onNext={() => {}} nextLabel="Weiter" nextDisabled={!selCourt || !selTime} />
    </div>
  )
}

/* ---------- step 4: details (Od) ---------- */

const inputCls =
  'mt-2 h-12 w-full rounded-md border border-foreground-950/15 bg-foreground-950/[0.03] px-4 text-[15px] text-foreground-950 placeholder:text-foreground-500/60 focus:border-primary-500/60 focus:outline-none transition-colors'

function DetailsStep({
  details,
  onPatch,
  onBack,
  onNext,
}: {
  details: { name: string; email: string; phone: string; notes: string }
  onPatch: (patch: Partial<{ name: string; email: string; phone: string; notes: string }>) => void
  onBack: () => void
  onNext: (errors: Record<string, string>) => void
}) {
  const [errors, setErrors] = useState<Record<string, string>>({})
  const honeypot = useRef<HTMLInputElement>(null)

  const validate = () => {
    const e: Record<string, string> = {}
    if (details.name.trim().length < 2) e.name = 'Bitte vollständigen Namen angeben.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email.trim())) e.email = 'Bitte gültige E-Mail angeben.'
    if (!/^[+0-9 ()/-]{6,20}$/.test(details.phone.trim())) e.phone = 'Bitte gültige Telefonnummer angeben.'
    return e
  }

  const field = (
    key: 'name' | 'email' | 'phone',
    label: string,
    type: string,
    placeholder: string,
    err?: string,
  ) => (
    <label className="block">
      <span className={`ro-eyebrow ${err ? 'text-red-400' : 'text-foreground-600'}`}>{label}</span>
      <input
        type={type}
        value={details[key]}
        placeholder={placeholder}
        onChange={(e) => onPatch({ [key]: e.target.value })}
        className={`${inputCls} ${err ? 'border-red-400/70' : ''}`}
      />
      {err && <span className="mt-1 block text-[13px] text-red-400">{err}</span>}
    </label>
  )

  return (
    <div>
      <div className="rounded-lg border border-foreground-950/10 bg-foreground-950/[0.03] px-4 py-3 text-[14px] text-foreground-700">
        Buchung als Gast.{' '}
        <Link to="/sign-in" className="text-primary-500 underline underline-offset-2 font-semibold">
          Anmelden
        </Link>{' '}
        um einen Verlauf deiner Buchungen zu behalten.
      </div>

      <div className="mt-6 grid gap-5">
        {field('name', 'Vollständiger Name', 'text', 'Alex Moreno', errors.name)}
        <div className="grid gap-5 sm:grid-cols-2">
          {field('email', 'E-Mail', 'email', 'alex@email.com', errors.email)}
          {field('phone', 'Telefon', 'tel', '+1 212 555 0199', errors.phone)}
        </div>
        <label className="block">
          <span className="flex items-center justify-between">
            <span className="ro-eyebrow text-foreground-600">Anmerkungen · Optional</span>
            <span className="text-[12px] tabular-nums text-foreground-500">{details.notes.length}/500</span>
          </span>
          <textarea
            value={details.notes}
            maxLength={500}
            placeholder="Ballmaschine, Trainingstermin…"
            onChange={(e) => onPatch({ notes: e.target.value })}
            className={`${inputCls} min-h-24 resize-none`}
          />
        </label>
        <input
          ref={honeypot}
          type="text"
          name="website_alt"
          tabIndex={-1}
          autoComplete="off"
          className="booking-alt-field"
          aria-hidden="true"
        />
      </div>

      <StepFooter
        onBack={onBack}
        onNext={() => {
          const e = validate()
          setErrors(e)
          if (Object.keys(e).length === 0) onNext(e)
        }}
        nextLabel="Weiter zur Prüfung"
      />
    </div>
  )
}

/* ---------- step 5: review (Ad) ---------- */

function ReviewStep({
  court,
  venue,
  settings,
  date,
  duration,
  time,
  details,
  onBack,
  onSuccess,
  onConflict,
}: {
  court: Court
  venue: Venue | null
  settings: ClubSettings
  date: string
  duration: 30 | 60 | 90
  time: string
  details: { name: string; email: string; phone: string; notes: string }
  onBack: () => void
  onSuccess: (r: NonNullable<CreateResp['reservation']>) => void
  onConflict: (msg: string) => void
}) {
  const [checked, setChecked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const idempotency = useRef(crypto.randomUUID())
  const honeypot = useRef<HTMLInputElement>(null)

  const fee = Math.round((court.hourly_price ?? 0) * duration * 100 / 60) / 100
  const end = minToHHMM(hhmmToMin(time) + duration)

  const rows: [string, string][] = [
    ['Anlage', venue?.name ?? '—'],
    ['Platz', `${court.name}${court.surface ? ` · ${court.surface}` : ''}`],
    ['Datum', dateShort(date)],
    ['Zeit', `${time} – ${end} (${settings.timezone})`],
    ['Dauer', `${duration} Minuten`],
    ['Name', details.name],
    ['E-Mail', details.email],
    ['Telefon', details.phone],
  ]

  const submit = async () => {
    setBusy(true)
    setError(null)
    const r = await api<CreateResp>('create', {
      court_id: court.id,
      date,
      start_time: time,
      duration,
      name: details.name.trim(),
      email: details.email.trim(),
      phone: details.phone.trim(),
      notes: details.notes.trim() || undefined,
      idempotency_key: idempotency.current,
      website_alt: honeypot.current?.value ?? '',
    })
    setBusy(false)
    if (r.ok && r.reservation) {
      onSuccess(r.reservation)
      return
    }
    const msg = r.message ?? 'Buchung fehlgeschlagen. Es wurde nichts reserviert.'
    if (/conflict|too_soon|outside_hours/i.test(msg)) {
      idempotency.current = crypto.randomUUID()
      onConflict(msg === 'Buchung fehlgeschlagen. Es wurde nichts reserviert.' ? 'Diese Zeit ist nicht mehr verfügbar.' : msg)
    } else {
      setError(msg)
    }
  }

  return (
    <div>
      <div className="grid xl:grid-cols-5 gap-4">
        <dl className="xl:col-span-3 divide-y divide-foreground-950/[0.08] rounded-lg border border-foreground-950/10 bg-foreground-950/[0.03] px-5 md:px-6 py-2">
          {rows.map(([k, v]) => (
            <div key={k} className="py-3 flex justify-between gap-4 text-[14px]">
              <dt className="ro-eyebrow text-foreground-600 pt-0.5 uppercase">{k}</dt>
              <dd className="text-right text-foreground-950 break-all">{v}</dd>
            </div>
          ))}
          {details.notes.trim() && (
            <div className="py-3 flex justify-between gap-4 text-[14px]">
              <dt className="ro-eyebrow text-foreground-600 pt-0.5 uppercase">Anmerkung</dt>
              <dd className="text-right text-foreground-950 break-all">{details.notes}</dd>
            </div>
          )}
        </dl>

        <div className="xl:col-span-2 rounded-lg border border-primary-500/40 bg-primary-500/[0.05] p-5 md:p-6">
          <p className="ro-eyebrow text-primary-500">Platzgebühr · zahlbar im Verein</p>
          <p className="mt-2 font-heading text-[44px] leading-none ro-grad-text-soft tabular-nums">{formatPrice(fee, settings.currency)}</p>
          <p className="mt-3 text-[13px] text-foreground-700">
            Es wird nichts online abgebucht. Der Server prüft Gebühr und Slot beim Absenden erneut.
          </p>
          <ul className="mt-4 space-y-3 text-[13px] text-foreground-700">
            <li className="flex gap-2.5">
              <i className="ri-time-line text-primary-500 mt-0.5" />
              <span>
                Bleibt <strong className="text-foreground-950">ausstehend</strong>, bis der Verein bestätigt.
              </span>
            </li>
            <li className="flex gap-2.5">
              <i className="ri-user-line text-primary-500 mt-0.5" />
              <span>Mitglieder stornieren online bis 24 h vor Spielbeginn.</span>
            </li>
            <li className="flex gap-2.5">
              <i className="ri-hashtag text-primary-500 mt-0.5" />
              <span>Gäste stornieren über den Verein unter Angabe der Referenz.</span>
            </li>
          </ul>
          <label className="mt-5 flex items-start gap-2.5 text-[13px] text-foreground-800 cursor-pointer">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-0.5 accent-primary-500"
            />
            <span>Ich akzeptiere die obigen Buchungsbedingungen.</span>
          </label>
          <input ref={honeypot} type="text" name="website_alt2" tabIndex={-1} autoComplete="off" className="booking-alt-field" aria-hidden="true" />
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-md border border-red-400/40 bg-red-400/10 px-4 py-3 text-[14px] text-red-300">{error}</p>
      )}

      <StepFooter onBack={onBack} onNext={submit} nextLabel="Reservierung absenden" nextDisabled={!checked} busy={busy} />
    </div>
  )
}

/* ---------- success (jd) ---------- */

function Success({ result, onAgain }: { result: NonNullable<CreateResp['reservation']>; onAgain: () => void }) {
  return (
    <div className="animate-fade-up max-w-xl">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-500 text-background-50">
          <i className="ri-check-line text-xl" />
        </span>
        <p className="ro-eyebrow text-primary-500">Reservierung vom Vereinsserver gespeichert</p>
      </div>
      <p className="ro-eyebrow text-foreground-600 mt-8">Deine Referenz</p>
      <p className="mt-1 font-heading text-[34px] md:text-[44px] leading-tight ro-grad-text-soft break-all">{result.reference}</p>
      <dl className="mt-6 divide-y divide-foreground-950/[0.08] rounded-lg border border-foreground-950/10 bg-foreground-950/[0.03] px-5 py-2">
        <div className="py-3 flex justify-between gap-4 text-[14px]">
          <dt className="ro-eyebrow text-foreground-600 pt-0.5 uppercase">Platz</dt>
          <dd className="text-right text-foreground-950">
            {result.court_name ?? '—'}
            {result.venue_name ? ` · ${result.venue_name}` : ''}
          </dd>
        </div>
        <div className="py-3 flex justify-between gap-4 text-[14px]">
          <dt className="ro-eyebrow text-foreground-600 pt-0.5 uppercase">Status</dt>
          <dd className="text-right text-foreground-950 capitalize">{result.status}</dd>
        </div>
      </dl>
      <p className="mt-5 ro-body text-foreground-700">
        Bewahre die Referenz auf. Du brauchst sie bei Rückfragen zu dieser Buchung.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <StepPill label="Weiteren Platz buchen" variant="lime" onClick={onAgain} />
        <Link
          to="/"
          className="inline-flex h-12 items-center gap-3 rounded-full border border-foreground-950/20 pl-5 pr-[5px] text-[15px] font-medium text-foreground-950 hover:border-foreground-950/40 transition-colors"
        >
          Zurück zum Verein
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-500 text-background-50">
            <i className="ri-arrow-right-up-line text-base" />
          </span>
        </Link>
      </div>
    </div>
  )
}

/* ---------- page ---------- */

// hardcoded outdoor courts (BД без колонки environment — визуал только на странице)
const OUTDOOR_COURTS: Court[] = [
  {
    id: 'outdoor-3',
    venue_id: '35c2a482-71ab-4ada-aa15-f6fc16d4392c',
    name: 'Platz 3',
    surface: 'Sand',
    environment: 'Außenplatz',
    is_active: true,
    sort_order: 3,
    image_url: '/assets/img/gen-04-outdoor-urban-tennis-court-at-golden-hou.jpg',
    hourly_price: 20,
    court_number: 3,
  },
  {
    id: 'outdoor-4',
    venue_id: '35c2a482-71ab-4ada-aa15-f6fc16d4392c',
    name: 'Platz 4',
    surface: 'Sand',
    environment: 'Außenplatz',
    is_active: true,
    sort_order: 4,
    image_url: '/assets/img/gen-04-overhead-aerial-view-of-three-dark-green.webp',
    hourly_price: 20,
    court_number: 4,
  },
]

export default function BookPage() {
  const [params] = useSearchParams()

  const [venues, setVenues] = useState<Venue[]>([])
  const [courts, setCourts] = useState<Court[]>([])
  const [settings, setSettings] = useState<ClubSettings | null>(null)
  const [overview, setOverview] = useState<DayOverview[]>([])
  const [loading, setLoading] = useState(true)

  const [step, setStep] = useState(0)
  const [venueId, setVenueId] = useState<string | null>(null)
  const [selected, setSelected] = useState<{ courtId: string | null; time: string | null }>({ courtId: null, time: null })
  const [date, setDate] = useState('')
  const [duration, setDuration] = useState<30 | 60 | 90>(30)
  const [details, setDetails] = useState({ name: '', email: '', phone: '', notes: '' })
  const [result, setResult] = useState<NonNullable<CreateResp['reservation']> | null>(null)

  useEffect(() => {
    Promise.all([getCourts(), getClubSettings()]).then(([cv, s]) => {
      // merge DB courts + hardcoded outdoor courts (Platz 3, Platz 4)
      const allCourts = [...cv.courts, ...OUTDOOR_COURTS]
      setVenues(cv.venues)
      setCourts(allCourts)
      setSettings(s)
      setLoading(false)
      // URL prefill
      const pCourt = params.get('court')
      const pDate = params.get('date')
      const pDur = Number(params.get('duration'))
      let target = 0
      const court = pCourt ? allCourts.find((c) => c.id === pCourt && c.is_active) : undefined
      if (court) {
        setVenueId(court.venue_id)
        setSelected({ courtId: court.id, time: null })
        target = 1
      }
      const tz = s?.timezone ?? 'Europe/Berlin'
      const today = todayInTz(tz)
      if (s && pDate && /^\d{4}-\d{2}-\d{2}$/.test(pDate) && pDate >= today && pDate <= addDays(today, s.booking_window_days)) {
        setDate(pDate)
        if (DURATIONS.includes(pDur as 30 | 60 | 90)) {
          setDuration(pDur as 30 | 60 | 90)
          target = court ? 2 : 1
        } else {
          target = court ? 2 : 1
        }
      }
      if (target > 0) setStep(target)
      // month overview for date step
      api<{ ok?: boolean; days?: DayOverview[] }>('month_overview', { from: today, days: 365 }).then((r) => {
        if (r.days) setOverview(r.days)
      })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [step])

  const venue = venues.find((v) => v.id === venueId) ?? null
  const court = courts.find((c) => c.id === selected.courtId) ?? null
  const venueCourts = useMemo(() => courts.filter((c) => c.venue_id === venueId), [courts, venueId])

  const sidebarImage =
    court?.image_url ?? venueCourts.find((c) => c.image_url)?.image_url ?? courts.find((c) => c.image_url)?.image_url ?? '/assets/img/gen-02.webp'
  const sidebarNumber = court ? String(court.court_number ?? 1).padStart(2, '0') : null
  const fee = court ? Math.round((court.hourly_price ?? 0) * duration * 100 / 60) / 100 : null

  const slotSummary: [string, string | null][] = [
    ['Anlage', venue?.name ?? null],
    ['Platz', court ? `${court.name}${court.surface ? ` · ${court.surface}` : ''}` : null],
    ['Datum', step >= 1 && date ? dateShort(date) : null],
    ['Zeit', selected.time ? `1x${duration} min – ${selected.time} – ${minToHHMM(hhmmToMin(selected.time) + duration)}` : step >= 1 ? `${duration} min` : null],
  ]

  const jump = (i: number) => {
    if (i < step) {
      setResult(null)
      setStep(i)
      setSelected({ courtId: null, time: null })
    }
  }

  const reset = () => {
    setResult(null)
    setStep(0)
    setVenueId(null)
    setSelected({ courtId: null, time: null })
    setDate('')
    setDuration(30)
  }

  return (
    <div className="ro min-h-screen flex flex-col">
      <Nav />
      <main className="flex-1 pt-16 md:pt-20 ro-band-list ro-spot">
        <div className="ro-container grid grid-cols-1 lg:grid-cols-[37fr_63fr] gap-x-8 xl:gap-x-14 gap-y-3 items-stretch pt-8 md:pt-12 pb-16 md:pb-24">
          <div>
            <p className="ro-eyebrow text-primary-500">Reservieren · Live-Verfügbarkeit</p>
            <h1 className="ro-h1 mt-3">
              Buche
              <br />
              <span className="font-script text-primary-500">deinen Platz.</span>
            </h1>
            <Sidebar
              image={sidebarImage}
              imageAlt={court ? `${court.name} Tennisplatz` : 'Tennishalle Platz'}
              courtNumber={sidebarNumber}
              summary={slotSummary}
              fee={fee}
              filled={slotSummary.filter(([, v]) => v !== null).length}
            />
          </div>

          <div>
            {result ? (
              <Success result={result} onAgain={reset} />
            ) : loading ? (
              <div className="mt-12 space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-12 rounded-md bg-foreground-950/[0.06] animate-pulse" />
                ))}
              </div>
            ) : (
              <>
                <StepsHeader current={step} onJump={jump} />
                <h2 className="mt-7 md:mt-8 font-heading text-[26px] md:text-[32px] ro-grad-text-soft">{TITLES[step]}</h2>

                {step === 0 && (
                  <div className="mt-5">
                    <VenueStep
                      venues={venues}
                      courts={courts}
                      selected={venueId}
                      onSelect={(id) => {
                        setVenueId(id)
                        setSelected({ courtId: null, time: null })
                        setStep(1)
                      }}
                    />
                  </div>
                )}

                {step === 1 && settings && (
                  <div className="mt-5">
                    <DateStep
                      settings={settings}
                      date={date}
                      duration={duration}
                      overview={overview}
                      onChange={(p) => {
                        if (p.date !== undefined) setDate(p.date)
                        if (p.duration !== undefined) setDuration(p.duration as 30 | 60 | 90)
                      }}
                      onBack={() => setStep(0)}
                      onNext={() => setStep(2)}
                    />
                  </div>
                )}

                {step === 2 && venue && settings && (
                  <div className="mt-5">
                    <TimeTable
                      courts={venueCourts}
                      date={date}
                      duration={duration}
                      selected={selected}
                      onSelect={(courtId, time) => {
                        setSelected({ courtId, time })
                        setStep(3)
                      }}
                      onBack={() => setStep(1)}
                    />
                  </div>
                )}

                {step === 3 && (
                  <div className="mt-5">
                    <DetailsStep
                      details={details}
                      onPatch={(p) => setDetails((d) => ({ ...d, ...p }))}
                      onBack={() => setStep(2)}
                      onNext={() => setStep(4)}
                    />
                  </div>
                )}

                {step === 4 && court && settings && (
                  <div className="mt-5">
                    <ReviewStep
                      court={court}
                      venue={venue}
                      settings={settings}
                      date={date}
                      duration={duration}
                      time={selected.time ?? ''}
                      details={details}
                      onBack={() => setStep(3)}
                      onSuccess={(r) => setResult(r)}
                      onConflict={() => {
                        setSelected({ courtId: null, time: null })
                        setStep(2)
                      }}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
