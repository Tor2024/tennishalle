import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Nav } from '../components/Nav'
import { Footer } from '../components/Footer'
import { api, apiAuth, changePassword, formatPrice, getBootstrap, updateProfile, type Court, type ClubSettings, type Venue } from '../lib/api'

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

/* .ics calendar file for one booking (client-side, no backend) */
function icsForBooking(e: Reservation, courtName: string, venueName: string): string {
  const toICS = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TENNISHALLE//Buchung//DE',
    'BEGIN:VEVENT',
    `UID:${e.id}@tennishalle`,
    `DTSTAMP:${toICS(new Date().toISOString())}`,
    `DTSTART:${toICS(e.start_at)}`,
    `DTEND:${toICS(e.end_at)}`,
    `SUMMARY:Tennis — ${courtName}`,
    `LOCATION:${venueName}`,
    `DESCRIPTION:Referenz ${e.reference} — Zahlung direkt im Verein.`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.join('\r\n')
}

function downloadIcs(e: Reservation, courtName: string, venueName: string) {
  const blob = new Blob([icsForBooking(e, courtName, venueName)], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `TENNISHALLE-${e.reference}.ics`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function BookingsList({
  list, canCancel, emptyText, courts, venues, tz, cutoff, cancelling, onCancel, priceNotices,
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
  priceNotices: Record<string, { changed_at: string; old_price_cents: number | null; new_price_cents: number | null; zone_label?: string }>
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
        const notice = priceNotices[`${e.court_id}|${e.start_at.slice(0, 10)}`]
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
                {notice && (
                  <p className="mt-2 flex items-start gap-1.5 text-xs text-accent-300">
                    <i className="ri-information-line mt-0.5 shrink-0" />
                    <span>
                      Preise wurden nach deiner Buchung geändert ({fmt(notice.changed_at, tz)}) — dein Preis bleibt unverändert. Neue Buchungen gelten zu den neuen Preisen.
                    </span>
                  </p>
                )}
              </div>
            </div>
            <div className="col-span-12 md:col-span-5 flex flex-wrap items-center md:justify-end gap-3 pl-[16.66%] md:pl-0">
              <StatusChip status={e.status} />
              <button
                type="button"
                onClick={() => downloadIcs(e, c?.name ?? 'Platz', venueName(c?.venue_id) || 'Tennishalle')}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-background-300 px-4 text-[13px] font-semibold text-foreground-800 hover:border-primary-500/60 hover:text-foreground-950 cursor-pointer transition-colors whitespace-nowrap"
                aria-label={`Kalendereintrag für ${e.reference} herunterladen`}
              >
                <i className="ri-calendar-line" />Kalender
              </button>
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
  const [user, setUser] = useState<{ id: string; email: string; full_name: string; role: string; phone?: string | null } | null>(null)
  const [loading, setLoading] = useState(true)
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [priceNotices, setPriceNotices] = useState<Record<string, { changed_at: string; old_price_cents: number | null; new_price_cents: number | null; zone_label?: string }>>({})
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [courts, setCourts] = useState<Court[]>([])
  const [venues, setVenues] = useState<Venue[]>([])
  const [settings, setSettings] = useState<ClubSettings | null>(null)
  const [profileOpen, setProfileOpen] = useState(false)
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
      const r = await api<{ ok: boolean; reservations: Reservation[]; price_notices?: Record<string, { changed_at: string; old_price_cents: number | null; new_price_cents: number | null; zone_label?: string }> }>('my_bookings', {})
      if (!r.ok) throw new Error((r as { message?: string }).message)
      setReservations(r.reservations ?? [])
      setPriceNotices(r.price_notices ?? {})
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
    window.dispatchEvent(new Event('th-auth-change'))
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

  const played = past.filter((e) => e.status === 'completed' || (e.status === 'confirmed' && new Date(e.end_at).getTime() < now))
  const hoursPlayed = Math.round(played.reduce((a, e) => a + e.duration_minutes, 0) / 60)
  const euroSpent = played.reduce((a, e) => a + e.fee_cents, 0) / 100
  const favCourtId = (() => {
    const counts = new Map<string, number>()
    for (const e of played) counts.set(e.court_id, (counts.get(e.court_id) ?? 0) + 1)
    let best: string | null = null
    let bestN = 0
    counts.forEach((n, id) => {
      if (n > bestN) { best = id; bestN = n }
    })
    return best
  })()
  const favCourt = favCourtId ? courts.find((c) => c.id === favCourtId) : null

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
              <div className="mt-8 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-stretch">
                <div className="ro-card p-5 md:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="ro-eyebrow text-foreground-500">Dein Profil</p>
                    <p className="mt-2 font-heading text-2xl heading-tight">{user.full_name || user.email}</p>
                    <p className="mt-1 text-sm text-foreground-600 break-all">
                      {user.email}
                      {user.phone ? <span className="text-foreground-500"> · {user.phone}</span> : null}
                    </p>
                  </div>
                  <div className="flex flex-wrap sm:flex-col gap-2.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setProfileOpen(true)}
                      className="inline-flex h-10 items-center gap-2 rounded-full border border-background-300 px-5 text-[13px] font-semibold text-foreground-800 hover:border-primary-500/60 hover:text-foreground-950 cursor-pointer transition-colors whitespace-nowrap"
                    >
                      <i className="ri-user-settings-line" />Profil bearbeiten
                    </button>
                    <button
                      type="button"
                      onClick={signOut}
                      className="inline-flex h-10 items-center gap-2 rounded-full border border-background-300 px-5 text-[13px] font-semibold text-foreground-800 hover:border-secondary-400 hover:text-secondary-200 cursor-pointer transition-colors whitespace-nowrap"
                    >
                      <i className="ri-logout-box-r-line" />Abmelden
                    </button>
                  </div>
                </div>
                <Link
                  to="/book"
                  className="ro-card p-5 md:p-6 flex items-center justify-between gap-4 group hover:border-primary-500/40 transition-colors"
                >
                  <div>
                    <p className="ro-eyebrow text-primary-500">Nächster Schritt</p>
                    <p className="mt-2 font-heading text-2xl heading-tight">Platz buchen</p>
                  </div>
                  <span className="w-11 h-11 shrink-0 flex items-center justify-center rounded-full bg-primary-500 text-background-50 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5">
                    <i className="ri-arrow-right-up-line text-lg" />
                  </span>
                </Link>
              </div>
              {played.length > 0 && (
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="ro-card p-5">
                    <p className="ro-eyebrow text-foreground-500">Stunden gespielt</p>
                    <p className="mt-2 font-heading text-4xl heading-tight ro-grad-lime tabular-nums">{hoursPlayed}</p>
                  </div>
                  <div className="ro-card p-5">
                    <p className="ro-eyebrow text-foreground-500">Investiert</p>
                    <p className="mt-2 font-heading text-4xl heading-tight ro-grad-lime tabular-nums">{formatPrice(euroSpent)}</p>
                  </div>
                  <div className="ro-card p-5">
                    <p className="ro-eyebrow text-foreground-500">Lieblingsplatz</p>
                    <p className="mt-2 font-heading text-2xl heading-tight ro-grad-lime">{favCourt?.name ?? '—'}</p>
                  </div>
                </div>
              )}
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
                      cancelling={cancelling} onCancel={cancel} priceNotices={priceNotices}
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
                      cancelling={cancelling} onCancel={cancel} priceNotices={priceNotices}
                    />
                  </section>
                </div>
              )}
             </>
           )}
         </div>
       </main>
      {profileOpen && user && (
        <ProfileModal
          user={user}
          onClose={() => setProfileOpen(false)}
          onSaved={(u, msg) => {
            setUser((prev) => (prev ? { ...prev, ...u } : prev))
            setProfileOpen(false)
            setMessage(msg)
          }}
        />
      )}
       <Footer />
     </div>
   )
 }

/* profile modal: edit name/phone + change password (Google accounts: password section hidden by server rejection) */
function ProfileModal({
  user,
  onClose,
  onSaved,
}: {
  user: { id: string; email: string; full_name: string; role: string; phone?: string | null; has_password?: boolean }
  onClose: () => void
  onSaved: (user: { full_name: string; phone: string | null }, msg: string) => void
}) {
  const [name, setName] = useState(user.full_name ?? '')
  const [phone, setPhone] = useState(user.phone ?? '')
  const [pwCurrent, setPwCurrent] = useState('')
  const [pwNext, setPwNext] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [pwMsg, setPwMsg] = useState<string | null>(null)
  const [pwErr, setPwErr] = useState<string | null>(null)

  const saveProfile = async () => {
    setSaving(true)
    setErr(null)
    try {
      const r = await updateProfile({ full_name: name, phone })
      if (!r.ok) throw new Error(r.message ?? 'Speichern fehlgeschlagen.')
      onSaved({ full_name: name, phone }, r.message ?? 'Profil gespeichert.')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Speichern fehlgeschlagen.')
    } finally {
      setSaving(false)
    }
  }

  const savePassword = async () => {
    setSaving(true)
    setPwErr(null)
    setPwMsg(null)
    try {
      const r = await changePassword({ current: pwCurrent, next: pwNext })
      if (!r.ok) throw new Error(r.message ?? 'Änderung fehlgeschlagen.')
      setPwMsg('Passwort geändert.')
      setPwCurrent('')
      setPwNext('')
    } catch (e) {
      setPwErr(e instanceof Error ? e.message : 'Änderung fehlgeschlagen.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <button type="button" aria-label="Schließen" onClick={onClose} className="absolute inset-0 bg-background-950/70 cursor-default" />
      <div className="relative w-full max-w-md ro-card p-6 md:p-8">
        <p className="ro-eyebrow text-foreground-500">Profil bearbeiten</p>
        <h3 className="mt-2 font-heading text-3xl heading-tight ro-grad-lime">Deine Daten</h3>

        <div className="mt-6 space-y-4">
          <label className="block">
            <span className="ro-eyebrow text-foreground-600">Vollständiger Name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1.5 w-full rounded-md border border-background-300 bg-background-100 px-3.5 py-2.5 text-[15px] text-foreground-950 placeholder:text-foreground-500/60 focus:border-primary-500 focus:outline-none"
              placeholder="Vor- und Nachname"
            />
          </label>
          <label className="block">
            <span className="ro-eyebrow text-foreground-600">Telefon</span>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1.5 w-full rounded-md border border-background-300 bg-background-100 px-3.5 py-2.5 text-[15px] text-foreground-950 placeholder:text-foreground-500/60 focus:border-primary-500 focus:outline-none"
              placeholder="+49 123 4567890"
            />
          </label>
          <label className="block">
            <span className="ro-eyebrow text-foreground-600">E-Mail</span>
            <input
              type="email"
              value={user.email}
              disabled
              className="mt-1.5 w-full rounded-md border border-background-300/60 bg-background-200/60 px-3.5 py-2.5 text-[15px] text-foreground-500 cursor-not-allowed"
            />
          </label>
        </div>
        {err && <p className="mt-3 text-[13px] text-secondary-300">{err}</p>}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="h-10 px-5 rounded-full border border-background-300 text-[13px] font-semibold text-foreground-800 hover:border-secondary-400 cursor-pointer"
          >
            Abbrechen
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={saveProfile}
            className="h-10 px-5 rounded-full bg-primary-500 text-background-50 text-[13px] font-semibold hover:bg-primary-400 cursor-pointer disabled:opacity-50 whitespace-nowrap"
          >
            Speichern
          </button>
        </div>

        <div className="mt-7 pt-6 border-t border-background-300/50">
          <p className="ro-eyebrow text-foreground-500">Passwort ändern</p>
          {user.has_password === false ? (
            <p className="mt-3 flex items-start gap-2 text-[13px] leading-relaxed text-foreground-600">
              <i className="ri-google-fill mt-0.5 shrink-0 text-foreground-500" />
              <span>
                Dein Konto nutzt die Google-Anmeldung — ein eigenes Passwort ist nicht nötig. Die Anmeldung läuft über Google.
              </span>
            </p>
          ) : (
            <>
              <div className="mt-3 space-y-4">
            <label className="block">
              <span className="ro-eyebrow text-foreground-600">Aktuelles Passwort</span>
              <div className="relative mt-1.5">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={pwCurrent}
                  onChange={(e) => setPwCurrent(e.target.value)}
                  className="w-full rounded-md border border-background-300 bg-background-100 px-3.5 py-2.5 pr-10 text-[15px] text-foreground-950 focus:border-primary-500 focus:outline-none"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground-500 hover:text-foreground-800 cursor-pointer"
                  aria-label={showPw ? 'Passwort verbergen' : 'Passwort anzeigen'}
                >
                  <i className={showPw ? 'ri-eye-off-line' : 'ri-eye-line'} />
                </button>
              </div>
            </label>
            <label className="block">
              <span className="ro-eyebrow text-foreground-600">Neues Passwort</span>
              <input
                type={showPw ? 'text' : 'password'}
                value={pwNext}
                onChange={(e) => setPwNext(e.target.value)}
                className="mt-1.5 w-full rounded-md border border-background-300 bg-background-100 px-3.5 py-2.5 text-[15px] text-foreground-950 focus:border-primary-500 focus:outline-none"
                autoComplete="new-password"
                placeholder="min. 6 Zeichen"
              />
            </label>
          </div>
          {pwErr && <p className="mt-3 text-[13px] text-secondary-300">{pwErr}</p>}
          {pwMsg && <p className="mt-3 text-[13px] text-primary-400">{pwMsg}</p>}
          <div className="mt-5 flex justify-end">
            <button
              type="button"
              disabled={saving || !pwCurrent || !pwNext}
              onClick={savePassword}
              className="h-10 px-5 rounded-full border border-background-300 text-[13px] font-semibold text-foreground-800 hover:border-primary-500/60 hover:text-foreground-950 cursor-pointer disabled:opacity-50"
            >
              Passwort ändern
            </button>
          </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
