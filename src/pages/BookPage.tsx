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
import { addDays, dateParts, dateShort, todayInTz } from '../lib/dates'

const STEPS = ['Anlage', 'Platz', 'Datum', 'Zeit', 'Angaben', 'Prüfen']
const TITLES = ['Anlage wählen', 'Platz wählen', 'Datum & Dauer', 'Startzeit wählen', 'Deine Angaben', 'Prüfen & absenden']

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

/* ---------- step 1: court (_d) ---------- */

function CourtStep({
  courts,
  currency,
  selected,
  onSelect,
}: {
  courts: Court[]
  currency: string
  selected: string | null
  onSelect: (id: string) => void
}) {
  if (courts.length === 0)
    return <p className="ro-body text-foreground-700">Auf dieser Anlage ist aktuell kein Platz frei.</p>
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {courts.map((c) => {
        const sel = selected === c.id
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(c.id)}
            aria-pressed={sel}
            className={`group text-left rounded-lg overflow-hidden border transition-colors duration-300 cursor-pointer bg-foreground-950/[0.03] ${
              sel ? 'border-primary-500' : 'border-foreground-950/10 hover:border-foreground-950/30'
            }`}
          >
            <div className="relative w-full h-40 overflow-hidden bg-background-100">
              {c.image_url && (
                <img
                  src={c.image_url}
                  alt={`${c.name} Tennisplatz`}
                  title={c.name}
                  className="ro-img-court w-full h-full object-cover object-top transition-transform duration-700 group-hover:scale-[1.04]"
                />
              )}
              <span className="absolute bottom-2 left-3 font-wordmark text-4xl leading-none text-foreground-950/90">
                {String(c.court_number ?? 1).padStart(2, '0')}
              </span>
              {sel && (
                <span className="absolute top-3 right-3 w-8 h-8 rounded-full bg-primary-500 text-background-50 flex items-center justify-center">
                  <i className="ri-check-line text-base" />
                </span>
              )}
            </div>
            <div className="p-4 md:p-5">
              <div className="flex items-start justify-between gap-3">
                <p className="ro-card-title ro-grad-lime">{c.name}</p>
                <p className="whitespace-nowrap pt-1">
                  <strong className="text-[18px] text-foreground-950">{formatPrice(c.hourly_price, currency)}</strong>
                  <span className="text-[13px] text-foreground-600"> /Std.</span>
                </p>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {c.surface && (
                  <span className="ro-chip rounded-full px-2.5 py-0.5 text-[12px] text-foreground-800 capitalize">
                    {c.surface}
                  </span>
                )}
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
  duration: number
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
        {settings.allowed_durations.map((d) => {
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

      <StepFooter onBack={onBack} onNext={onNext} nextLabel="Zeiten ansehen" nextDisabled={!date || !settings.allowed_durations.includes(duration)} />
    </div>
  )
}

/* ---------- step 3: time list (bd) ---------- */

function TimeStep({
  court,
  date,
  duration,
  currency,
  selected,
  onSelect,
  onBack,
  onNext,
}: {
  court: Court
  date: string
  duration: number
  currency: string
  selected: string | null
  onSelect: (t: string | null) => void
  onBack: () => void
  onNext: () => void
}) {
  const [resp, setResp] = useState<AvailabilityResp | null>(null)
  const [loading, setLoading] = useState(true)
  const [spin, setSpin] = useState(false)

  const load = async (showSpin: boolean) => {
    if (showSpin) setSpin(true)
    setLoading(true)
    const r = await api<AvailabilityResp>('availability', { court_id: court.id, date, duration })
    setResp(r)
    setLoading(false)
    setSpin(false)
  }

  useEffect(() => {
    load(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [court.id, date, duration])

  const times = resp?.times ?? []
  const available = times.filter((t) => t.available)
  const sel = resp?.times?.find((t) => t.time === selected)

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="ro-chip rounded-full px-3 py-1.5 text-[13px] text-foreground-800">{dateShort(date)}</span>
        <span className="ro-chip rounded-full px-3 py-1.5 text-[13px] text-foreground-800">{duration} min</span>
        {sel && sel.price !== undefined && sel.price !== null && (
          <span className="rounded-full bg-primary-500/10 border border-primary-500/40 px-3 py-1.5 text-[13px] font-bold text-primary-500">
            {formatPrice(sel.price, currency)}
          </span>
        )}
        <button
          type="button"
          onClick={() => load(true)}
          className="ml-auto inline-flex items-center gap-2 h-9 px-4 rounded-full border border-foreground-950/15 text-[13px] font-semibold text-foreground-800 cursor-pointer hover:border-foreground-950/40 transition-colors"
        >
          <i className={`ri-refresh-line ${spin ? 'animate-spin' : ''}`} />
          Aktualisieren
        </button>
      </div>

      {loading ? (
        <div className="mt-5 grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-6 gap-2">
          {Array.from({ length: 18 }).map((_, i) => (
            <div key={i} className="h-12 rounded-md bg-foreground-950/[0.06] animate-pulse" />
          ))}
        </div>
      ) : available.length === 0 ? (
        <p className="ro-body text-foreground-700 pb-4 mt-5">
          Keine freien Startzeiten mehr für {duration} Minuten an diesem Tag. Wähle eine kürzere Dauer oder ein anderes
          Datum.
        </p>
      ) : (
        <div className="mt-5 grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-6 gap-2">
          {available.map((t) => {
            const isSel = selected === t.time
            return (
              <button
                key={t.time}
                type="button"
                disabled={!t.available}
                onClick={() => onSelect(isSel ? null : t.time)}
                aria-pressed={isSel}
                aria-label={`${t.time} ${t.available ? 'verfügbar' : 'belegt'}`}
                className={`h-12 rounded-md text-[15px] tabular-nums border transition-colors cursor-pointer ${
                  isSel
                    ? 'bg-primary-500 text-background-50 border-primary-500 font-bold'
                    : 'bg-foreground-950/[0.04] border-foreground-950/15 text-foreground-950 font-medium hover:border-primary-500/70'
                }`}
              >
                {t.time}
              </button>
            )
          })}
        </div>
      )}

      <StepFooter onBack={onBack} onNext={onNext} nextLabel="Weiter" nextDisabled={!selected} />
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
  duration: number
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

export default function BookPage() {
  const [params] = useSearchParams()

  const [venues, setVenues] = useState<Venue[]>([])
  const [courts, setCourts] = useState<Court[]>([])
  const [settings, setSettings] = useState<ClubSettings | null>(null)
  const [overview, setOverview] = useState<DayOverview[]>([])
  const [loading, setLoading] = useState(true)

  const [step, setStep] = useState(0)
  const [venueId, setVenueId] = useState<string | null>(null)
  const [courtId, setCourtId] = useState<string | null>(null)
  const [date, setDate] = useState('')
  const [duration, setDuration] = useState(90)
  const [, setSelectedSlots] = useState('')
  const [selectedTime, setSelectedTime] = useState<string | null>(null)
  const [details, setDetails] = useState({ name: '', email: '', phone: '', notes: '' })
  const [result, setResult] = useState<NonNullable<CreateResp['reservation']> | null>(null)

  useEffect(() => {
    Promise.all([getCourts(), getClubSettings()]).then(([cv, s]) => {
      setVenues(cv.venues)
      setCourts(cv.courts)
      setSettings(s)
      setLoading(false)
      // URL prefill
      const pCourt = params.get('court')
      const pDate = params.get('date')
      const pDur = Number(params.get('duration'))
      let target = 0
      const court = pCourt ? cv.courts.find((c) => c.id === pCourt && c.is_active) : undefined
      if (court) {
        setVenueId(court.venue_id)
        setCourtId(court.id)
        target = 1
      }
      const tz = s?.timezone ?? 'Europe/Berlin'
      const today = todayInTz(tz)
      if (s && pDate && /^\d{4}-\d{2}-\d{2}$/.test(pDate) && pDate >= today && pDate <= addDays(today, s.booking_window_days)) {
        setDate(pDate)
        if (s.allowed_durations.includes(pDur)) {
          setDuration(pDur)
          target = court ? 3 : 2
        } else {
          target = court ? 2 : 2
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
  const court = courts.find((c) => c.id === courtId) ?? null
  const venueCourts = useMemo(() => courts.filter((c) => c.venue_id === venueId), [courts, venueId])

  const sidebarImage =
    court?.image_url ?? venueCourts.find((c) => c.image_url)?.image_url ?? courts.find((c) => c.image_url)?.image_url ?? '/assets/img/gen-02.webp'
  const sidebarNumber = court ? String(court.court_number ?? 1).padStart(2, '0') : null
  const fee = court ? Math.round((court.hourly_price ?? 0) * duration * 100 / 60) / 100 : null

  const slotSummary: [string, string | null][] = [
    ['Anlage', venue?.name ?? null],
    ['Platz', court ? `${court.name}${court.surface ? ` · ${court.surface}` : ''}` : null],
    ['Datum', step >= 2 && date ? dateShort(date) : null],
    ['Zeit', selectedTime ? `1x30 min – ${selectedTime} – ${minToHHMM(hhmmToMin(selectedTime) + 30)}` : step >= 2 ? `${duration} min` : null],
  ]

  const jump = (i: number) => {
    if (i < step) {
      setResult(null)
      setStep(i)
    }
  }

  const reset = () => {
    setResult(null)
    setStep(0)
    setVenueId(null)
    setCourtId(null)
    setDate('')
    setDuration(90)
    setSelectedSlots('')
    setSelectedTime(null)
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
                        setCourtId(null)
                        setStep(1)
                      }}
                    />
                  </div>
                )}

                {step === 1 && venue && (
                  <div className="mt-5">
                    <CourtStep
                      courts={venueCourts}
                      currency={settings?.currency ?? 'EUR'}
                      selected={courtId}
                      onSelect={(id) => {
                        setCourtId(id)
                        setStep(2)
                      }}
                    />
                  </div>
                )}

                {step === 2 && settings && (
                  <div className="mt-5">
                    <DateStep
                      settings={settings}
                      date={date}
                      duration={duration}
                      overview={overview}
                      onChange={(p) => {
                        if (p.date !== undefined) setDate(p.date)
                        if (p.duration !== undefined) setDuration(p.duration)
                      }}
                      onBack={() => setStep(1)}
                      onNext={() => setStep(3)}
                    />
                  </div>
                )}

                {step === 3 && court && settings && (
                  <div className="mt-5">
                    <TimeStep
                      court={court}
                      date={date}
                      duration={duration}
                      currency={settings.currency}
                      selected={selectedTime}
                      onSelect={(t) => {
                        setSelectedTime(t)
                        setSelectedSlots(t ? `${court.id}|${t}` : '')
                      }}
                      onBack={() => setStep(2)}
                      onNext={() => setStep(4)}
                    />
                  </div>
                )}

                {step === 4 && (
                  <div className="mt-5">
                    <DetailsStep
                      details={details}
                      onPatch={(p) => setDetails((d) => ({ ...d, ...p }))}
                      onBack={() => setStep(3)}
                      onNext={() => setStep(5)}
                    />
                  </div>
                )}

                {step === 5 && court && settings && (
                  <div className="mt-5">
                    <ReviewStep
                      court={court}
                      venue={venue}
                      settings={settings}
                      date={date}
                      duration={duration}
                      time={selectedTime ?? ''}
                      details={details}
                      onBack={() => setStep(4)}
                      onSuccess={(r) => setResult(r)}
                      onConflict={() => {
                        setSelectedSlots('')
                        setSelectedTime(null)
                        setStep(3)
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
