import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Nav } from '../components/Nav'
import { Footer } from '../components/Footer'
import { api, apiAuth, formatPrice, getBootstrap, type Court, type ClubSettings, type Venue } from '../lib/api'

// structure verbatim from prod bundle sf() component
interface Reservation {
  id: string
  reference: string
  court_id: string
  venue_id?: string
  start_at: string
  end_at: string
  duration_minutes: number
  fee_cents: number
  status: string
}

const STATUS_CLS: Record<string, string> = {
  pending: 'bg-accent-500/15 text-accent-300 border-accent-500/40',
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

function StatusChip({ status }: { status: string }) {
  return (
    <span
      className={`inline-block font-label text-[10px] uppercase tracking-widest px-2 py-1 rounded-full border whitespace-nowrap ${STATUS_CLS[status] ?? STATUS_CLS.pending}`}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}

function fmt(start: string, tz: string): string {
  return new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: tz }).format(new Date(start))
}
function fmtTime(start: string, tz: string): string {
  return new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: tz }).format(new Date(start))
}

function BookingsList({
  list, canCancel, emptyText, courts, venues, tz, cutoff, cancelling, onCancel,
}: {
  list: Reservation[]
  canCancel: boolean
  emptyText: string
  courts: Court[]
  venues: Venue[]
  tz: string
  cutoff: number
  cancelling: string | null
  onCancel: (id: string) => void
}) {
  const now = Date.now()
  const court = (id: string) => courts.find((c) => c.id === id)
  const venueName = (id?: string) => venues.find((v) => v.id === id)?.name ?? ''
  return (
    <ul className="border-t border-background-300/50">
      {list.length === 0 && <li className="py-8 text-sm text-foreground-500">{emptyText}</li>}
      {list.map((e) => {
        const c = court(e.court_id)
        const cancellable =
          canCancel && ['pending', 'confirmed'].includes(e.status) &&
          new Date(e.start_at).getTime() - now >= cutoff * 3600000
        return (
          <li key={e.id} className="py-5 border-b border-background-300/50 grid grid-cols-12 gap-3 md:gap-6 items-center">
            <span className="col-span-2 md:col-span-1 font-wordmark text-3xl md:text-4xl text-foreground-400">
              {c?.court_number ? String(c.court_number).padStart(2, '0') : '—'}
            </span>
            <div className="col-span-10 md:col-span-6 min-w-0 flex items-center gap-4">
              {c?.image_url && (
                <img
                  src={c.image_url}
                  alt={c?.name ?? 'Platz'}
                  className="hidden sm:block h-14 md:h-16 w-20 md:w-24 object-cover object-center rounded-md border border-background-300/50 shrink-0"
                  loading="lazy"
                />
              )}
              <div className="min-w-0">
                <p className="font-heading text-xl md:text-2xl heading-tight">
                  {c?.name ?? 'Platz'}{' '}
                  <span className="text-foreground-500 text-base">· {venueName(c?.venue_id)}</span>
                </p>
                <p className="mt-1 text-sm text-foreground-600">
                  {fmt(e.start_at, tz)} · {fmtTime(e.start_at, tz)} – {fmtTime(e.end_at, tz)}
                </p>
                <p className="mt-1 text-xs text-foreground-500 tabular-nums">
                  Ref. {e.reference} · {formatPrice(e.fee_cents / 100)} — Zahlung direkt im Verein
                </p>
              </div>
            </div>
            <div className="col-span-12 md:col-span-5 flex flex-wrap items-center md:justify-end gap-3 pl-[16.66%] md:pl-0">
              <StatusChip status={e.status} />
              {cancellable && (
                <CancelButton
                  disabled={cancelling === e.id}
                  onConfirm={() => onCancel(e.id)}
                  label={cancelling === e.id ? 'Wird storniert…' : 'Buchung stornieren'}
                />
              )}
              {canCancel && !cancellable && ['pending', 'confirmed'].includes(e.status) && (
                <span className="text-xs text-foreground-500">
                  Innerhalb von {cutoff}h — bitte kontaktiere den Verein
                </span>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/* double-confirm cancel: click 1 arms (red, 'Wirklich stornieren?'), click 2 within 4s cancels; avoids accidental clicks */
function CancelButton({ disabled, onConfirm, label }: { disabled: boolean; onConfirm: () => void; label: string }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 4000)
    return () => clearTimeout(t)
  }, [armed])
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        if (armed) {
          setArmed(false)
          onConfirm()
        } else {
          setArmed(true)
        }
      }}
      className={
        armed
          ? 'text-[13px] font-semibold border border-red-500/70 bg-red-500/20 text-red-300 px-4 py-2 rounded-full whitespace-nowrap cursor-pointer disabled:opacity-50'
          : 'text-[13px] font-semibold border border-background-300 hover:border-secondary-400 hover:text-secondary-200 px-4 py-2 rounded-full whitespace-nowrap cursor-pointer disabled:opacity-50'
      }
    >
      {armed ? 'Wirklich stornieren?' : label}
    </button>
  )
}

export function AccountPage() {
  const [user, setUser] = useState<{ id: string; email: string; full_name: string; role: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [courts, setCourts] = useState<Court[]>([])
  const [venues, setVenues] = useState<Venue[]>([])
  const [settings, setSettings] = useState<ClubSettings | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    getBootstrap().then((r) => {
      setCourts(r.courts)
      setVenues(r.venues)
      setSettings(r.settings)
    })
    apiAuth<{ ok: boolean; user: typeof user }>('me').then((r) => {
      setUser(r?.ok && r.user ? r.user : null)
      setLoading(false)
    }).catch(() => { setLoading(false) })
  }, [])

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setError(null)
    try {
      const r = await api<{ ok: boolean; reservations: Reservation[] }>('my_bookings', {})
      if (!r.ok) throw new Error((r as { message?: string }).message)
      setReservations(r.reservations ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Buchungen konnten nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => { load() }, [load])

  const cancel = async (id: string) => {
    setCancelling(null)
    setMessage(null)
    setCancelling(id)
    const r = await api<{ ok: boolean; message?: string }>('member_cancel', { id })
    setCancelling(null)
    setMessage(r.ok ? 'Buchung storniert. Die Zeit ist wieder frei.' : r.message ?? 'Stornieren nicht möglich.')
    load()
  }

  const signOut = async () => {
    await apiAuth('signout', {})
    navigate('/')
  }

  if (!loading && !user) return <Navigate to="/sign-in" replace />

  const now = Date.now()
  const upcoming = reservations
    .filter((e) => new Date(e.end_at).getTime() >= now && e.status !== 'cancelled')
    .reverse()
  const past = reservations.filter((e) => !upcoming.includes(e))
  const tz = settings?.timezone ?? 'Europe/Berlin'
  const cutoff = settings?.member_cancel_cutoff_hours ?? 24

  return (
    <div className="ro min-h-screen bg-background-50 flex flex-col">
      <Nav />
      <main className="flex-1 pt-28 md:pt-40 pb-20 px-4 md:px-10">
        <div className="max-w-6xl mx-auto">
          <p className="eyebrow text-primary-500">{user ? 'Mitglied' : 'Account'}</p>
          <h1 className="mt-5 font-heading font-light display-tight text-[56px] md:text-[96px]">
            {user ? (
              <>Deine Platzzeit <span className="font-accent italic text-primary-500">wartet.</span></>
            ) : (
              <>Willkommen <span className="font-accent italic text-primary-500">zurück.</span></>
            )}
          </h1>
          {loading && <p className="mt-10 text-sm text-foreground-600">Wird geladen…</p>}
          {user && (
            <>
              <div className="mt-8 flex flex-col sm:flex-row sm:items-center gap-4 text-sm text-foreground-600">
                <span className="break-all">{user.email}</span>
                <button
                  type="button"
                  onClick={signOut}
                  className="self-start text-foreground-800 hover:text-foreground-950 underline underline-offset-4 cursor-pointer whitespace-nowrap"
                >
                  Abmelden
                </button>
                <Link
                  to="/book"
                  className="sm:ml-auto self-start bg-primary-500 hover:bg-primary-400 text-background-50 text-sm font-bold px-6 py-3 rounded-full whitespace-nowrap cursor-pointer"
                >
                  Platz buchen
                </Link>
              </div>
              {(user.role === 'admin' || user.role === 'owner') && (
                <div className="mt-8 p-5 rounded-lg border border-primary-500/40 bg-background-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <p className="text-sm text-foreground-800">
                    Du bist angemeldet als <strong className="text-primary-500">Vereins-Besitzer</strong>. Vereinsbuchungen werden im Dashboard verwaltet.
                  </p>
                  <Link
                    to="/admin"
                    className="self-start bg-foreground-950 text-background-50 text-sm font-bold px-5 py-2.5 rounded-full whitespace-nowrap cursor-pointer"
                  >
                    Dashboard öffnen
                  </Link>
                </div>
              )}
              {message && <p className="mt-6 text-sm text-primary-400">{message}</p>}
              {error && (
                <p className="mt-6 text-sm text-secondary-300">
                  {error}{' '}
                  <button type="button" onClick={load} className="underline cursor-pointer">Erneut versuchen</button>
                </p>
              )}
              {loading ? (
                <p className="mt-12 text-sm text-foreground-600">Buchungen werden geladen…</p>
              ) : (
                <div className="mt-14 grid grid-cols-1 gap-16">
                  <section>
                    <div className="flex items-baseline justify-between mb-4">
                      <h2 className="font-heading text-3xl md:text-[40px] heading-tight">Kommend</h2>
                      <span className="eyebrow text-foreground-500">{upcoming.length}</span>
                    </div>
                    <BookingsList
                      list={upcoming} canCancel emptyText="Noch keine kommenden Buchungen."
                      courts={courts} venues={venues} tz={tz} cutoff={cutoff}
                      cancelling={cancelling} onCancel={cancel}
                    />
                  </section>
                  <section>
                    <div className="flex items-baseline justify-between mb-4">
                      <h2 className="font-heading text-3xl md:text-[40px] heading-tight text-foreground-700">Vergangene & stornierte</h2>
                      <span className="eyebrow text-foreground-500">{past.length}</span>
                    </div>
                    <BookingsList
                      list={past} canCancel={false} emptyText="Noch nichts hier."
                      courts={courts} venues={venues} tz={tz} cutoff={cutoff}
                      cancelling={cancelling} onCancel={cancel}
                    />
                  </section>
                </div>
              )}
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  )
}
