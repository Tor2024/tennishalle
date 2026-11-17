import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiData, me, registerTournament } from '../lib/api'
import { Reveal } from './Reveal'
import { RichText } from '../lib/richText'

interface NewsRow { id: string; title: string; slug: string; lead: string | null; body: string | null; image_path: string | null; published_at: string | null; author_name?: string | null }
interface PromoRow { id: string; title: string; lead: string | null; body: string | null; promo_expires_at: string | null; published_at?: string | null; author_name?: string | null; icon?: string | null; cta_label?: string | null; cta_link?: string | null }
interface EventRow { id: string; kind: string; title: string; participants: string | null; starts_at: string; description: string | null }
interface TournamentRow {
  id: string; title: string; description: string | null; format: 'single' | 'double'; fee_cents: number
  starts_at: string; registration_deadline: string | null; max_entries: number | null; status: 'announcement' | 'registration' | 'running' | 'finished'
  image_path: string | null; entry_count: number
}

const STATUS_LABEL: Record<TournamentRow['status'], string> = {
  announcement: 'Angekündigt',
  registration: 'Anmeldung läuft',
  running: 'Läuft gerade',
  finished: 'Beendet',
}
const STATUS_CLS: Record<TournamentRow['status'], string> = {
  announcement: 'border-foreground-950/20 text-foreground-600',
  registration: 'border-primary-500/60 text-primary-500',
  running: 'border-primary-500/60 text-primary-500',
  finished: 'border-foreground-950/20 text-foreground-500',
}

const MON = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']

// static fallback (original content from the prod bundle) — shown if DB is empty or unreachable
const FALLBACK_NEWS: NewsRow[] = [
  { id: 'fb-1', title: 'Winterhallen-Plan ist da', slug: 'winterhallen-plan', lead: null, body: 'Ab sofort gelten die Winteröffnungszeiten in der Halle. Alle Zeiten findest du auf der Übersicht der Plätze.', image_path: null, published_at: null },
  { id: 'fb-2', title: 'Neue Kursgruppe Kinder', slug: 'kursgruppe-kinder', lead: null, body: 'Ein neuer Kurs für Kinder von 6–9 Jahren startet im Dezember. Anmeldung jetzt möglich.', image_path: null, published_at: null },
]
const FALLBACK_PROMO: PromoRow[] = [{ id: 'fb-p', title: 'Montags bis freitags vor 12 Uhr: −20 % auf jede Hallenbuchung', lead: null, body: 'Gilt für alle Hallenplätze bei Buchung über das System.', promo_expires_at: null }]
const FALLBACK_EVENTS: EventRow[] = [
  { id: 'fb-e1', kind: 'match', title: 'Game: Müller vs. Schmidt', participants: 'Freundschaftsspiel · Halle, Platz 1 · 18:00', starts_at: '2026-11-22T18:00:00Z', description: null },
  { id: 'fb-e2', kind: 'tournament', title: 'Vereinsmeisterschaft — Vorrunde', participants: 'Turnier · Halle, Platz 1 & 2 · ab 10:00', starts_at: '2026-11-29T10:00:00Z', description: null },
  { id: 'fb-e3', kind: 'training', title: 'Game: Jugend U12 vs. U14', participants: 'Trainingsspiel · Halle, Platz 2 · 15:00', starts_at: '2026-12-06T15:00:00Z', description: null },
  { id: 'fb-e4', kind: 'other', title: 'Winterfeier des Vereins', participants: 'Vereinsleben · Clubheim · 19:00', starts_at: '2026-12-13T19:00:00Z', description: null },
]

function dayMon(iso: string): { day: string; mon: string } {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return { day: '–', mon: '' }
  return { day: String(d.getUTCDate()).padStart(2, '0'), mon: MON[d.getUTCMonth()] ?? '' }
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Europe/Berlin' })
}

// structure verbatim from prod bundle home.js (#aktuelles template); data from DB with static fallback
export function Aktuelles() {
  const [news, setNews] = useState<NewsRow[] | null>(null)
  const [promo, setPromo] = useState<PromoRow[] | null>(null)
  const [events, setEvents] = useState<EventRow[] | null>(null)
  const [tournaments, setTournaments] = useState<TournamentRow[]>([])
  const [user, setUser] = useState<Awaited<ReturnType<typeof me>>>(null)
  const [regMsg, setRegMsg] = useState<{ id: string; text: string; ok: boolean } | null>(null)
  const [regBusy, setRegBusy] = useState<string | null>(null)

  useEffect(() => {
    me().then(setUser)
    apiData<{ ok: boolean; news: NewsRow[]; promo: PromoRow[]; events: EventRow[] }>('news')
      .then((r) => {
        if (!r?.ok) throw new Error('bad response')
        setNews(r.news?.length ? r.news : FALLBACK_NEWS)
        setPromo(r.promo?.length ? r.promo : FALLBACK_PROMO)
        setEvents(r.events ?? [])
      })
      .catch(() => {
        setNews(FALLBACK_NEWS)
        setPromo(FALLBACK_PROMO)
        setEvents(FALLBACK_EVENTS)
      })
  }, [])

  useEffect(() => {
    apiData<{ ok: boolean; tournaments: TournamentRow[] }>('tournaments')
      .then((r) => { if (r?.ok) setTournaments(r.tournaments ?? []) })
      .catch(() => {})
  }, [])

  const doRegister = async (t: TournamentRow) => {
    if (!user) return
    setRegBusy(t.id)
    setRegMsg(null)
    try {
      const r = await registerTournament(t.id)
      setRegMsg({ id: t.id, text: r.message ?? (r.ok ? 'Anmeldung erfolgreich.' : 'Fehler'), ok: r.ok })
      if (r.ok && typeof r.entry_count === 'number') {
        setTournaments((ts) => ts.map((x) => (x.id === t.id ? { ...x, entry_count: r.entry_count! } : x)))
      }
    } catch {
      setRegMsg({ id: t.id, text: 'Netzwerkfehler.', ok: false })
    }
    setRegBusy(null)
  }

  const canRegister = (t: TournamentRow) => t.status === 'announcement' || t.status === 'registration'
  const eventList = events ?? []
  const tournamentList = tournaments
  const newsList = news ?? []

  return (
    <section id="aktuelles" className="hm-section scroll-mt-20" aria-labelledby="aktuelles-title">
      <div className="ro-container">
        <Reveal>
          <div className="hm-section-head">
            <div>
              <p className="ro-eyebrow text-primary-500 mb-2">News, Angebote &amp; Termine</p>
              <h2 id="aktuelles-title" className="hm-h2">
                Aktuelles <span className="hm-script">im Verein</span>
              </h2>
            </div>
          </div>
          <div className="hm-news-layout">
            <div className="hm-news-cards">
              {newsList.map((n) => {
                const meta = [fmtDate(n.published_at), n.author_name].filter(Boolean).join(' · ')
                return (
                <article key={n.id} className="ro-card hm-news-card">
                  <p className="ro-eyebrow text-primary-500">Verein</p>
                  <h3 className="ro-card-title ro-grad-lime mt-2">{n.title}</h3>
                  {n.lead && <p className="hm-news-text !text-primary-400 font-medium">{n.lead}</p>}
                  {n.body && <RichText body={n.body} className="hm-news-text [&_p+p]:mt-2 [&_ul]:mt-1 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mt-0.5 [&_strong]:text-foreground-950" />}
                  {meta && (
                    <p className="mt-3 text-xs text-foreground-600 flex items-center gap-1.5">
                      <i className="ri-time-line text-[13px]" />
                      {meta}
                    </p>
                  )}
                  <a href="#court-list" className="hm-textlink">
                    Zu den Plätzen <i className="ri-arrow-right-line" />
                  </a>
                </article>
                )
              })}
            </div>
            <div className="hm-promo-col">
            {(promo ?? []).slice(0, 3).map((p) => {
              const ctaLabel = p.cta_label || 'Jetzt buchen'
              const ctaTo = p.cta_link || '/book'
              const ctaInner = <>{ctaLabel} <i className="ri-arrow-right-up-line" /></>
              const ctaCls = 'hm-btn hm-btn-lime mt-auto self-start'
              return (
                <div key={p.id} className="hm-promo-card flex flex-col">
                  <p className="hm-promo-pill">Angebot</p>
                  {p.icon && <i className={`${p.icon} text-[26px] text-primary-500 mt-3`} />}
                  <p className="hm-promo-title">{p.title}</p>
                  {p.lead && <p className="hm-promo-sub !text-primary-400 font-medium">{p.lead}</p>}
                  {p.body && <RichText body={p.body} className="hm-promo-sub [&_p+p]:mt-2 [&_ul]:mt-1 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mt-0.5" />}
                  {(() => {
                    const meta = [fmtDate(p.published_at), p.author_name].filter(Boolean).join(' · ')
                    return meta ? (
                      <p className="text-xs opacity-70 flex items-center gap-1.5 mt-4">
                        <i className="ri-time-line text-[13px]" />
                        {meta}
                      </p>
                    ) : null
                  })()}
                  {ctaTo.startsWith('/') || ctaTo.startsWith('#') ? (
                    <Link to={ctaTo} className={ctaCls}>{ctaInner}</Link>
                  ) : (
                    <a href={ctaTo} target="_blank" rel="noreferrer" className={ctaCls}>{ctaInner}</a>
                  )}
                </div>
              )
            })}
            </div>
          </div>
          {tournamentList.length > 0 && (
            <div className="hm-events mt-10">
              <div className="hm-events-head">
                <p className="ro-eyebrow text-primary-500">Turniere</p>
                <h3 className="hm-events-title">Vereinsturniere</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                {tournamentList.map((t) => {
                  const reg = canRegister(t)
                  const full = t.max_entries != null && t.entry_count >= t.max_entries
                  const dm = dayMon(t.starts_at)
                  return (
                    <div key={t.id} className="ro-card p-5 flex flex-col">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="ro-eyebrow text-primary-500">{t.format === 'double' ? 'Doppel' : 'Einzel'}</p>
                          <h3 className="ro-card-title !text-[18px] mt-1">{t.title}</h3>
                        </div>
                        <div className="hm-event-date shrink-0">
                          <b className="hm-event-day">{dm.day}</b>
                          <span className="hm-event-mon">{dm.mon}</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-2 text-[12px] text-foreground-600">
                        <span className={`rounded-full border px-2.5 py-0.5 font-medium ${STATUS_CLS[t.status]}`}>{STATUS_LABEL[t.status]}</span>
                        <span>{new Date(t.starts_at).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Berlin' })} Uhr</span>
                        {t.fee_cents > 0 && <span>· {t.fee_cents / 100} € Startgebühr</span>}
                      </div>
                      {t.registration_deadline && reg && (
                        <p className="text-[12px] text-foreground-500 mt-1.5">Anmeldung bis {fmtDate(t.registration_deadline)}{t.max_entries != null ? ` · ${t.entry_count}/${t.max_entries} gemeldet` : ` · ${t.entry_count} gemeldet`}</p>
                      )}
                      {t.description && <RichText body={t.description} className="hm-news-text mt-3 [&_p+p]:mt-2 [&_ul]:mt-1 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mt-0.5" />}
                      {regMsg && regMsg.id === t.id && (
                        <p className={`mt-3 text-[13px] ${regMsg.ok ? 'text-primary-400' : 'text-red-300'}`}>{regMsg.text}</p>
                      )}
                      {reg && (
                        user ? (
                          <button
                            onClick={() => doRegister(t)}
                            disabled={regBusy === t.id || full}
                            className={`hm-btn hm-btn-lime mt-4 self-start ${full ? 'opacity-50 pointer-events-none' : ''}`}
                          >
                            {full ? 'Ausgebucht' : 'Melden'} <i className="ri-arrow-right-up-line" />
                          </button>
                        ) : (
                          <Link to="/sign-in" className="hm-textlink mt-4 self-start">Zum Melden anmelden <i className="ri-arrow-right-line" /></Link>
                        )
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          {eventList.length > 0 && (
            <div className="hm-events mt-6">
              <div className="hm-events-head">
                <p className="ro-eyebrow text-primary-500">Terminkalender</p>
                <h3 className="hm-events-title">Nächste Termine</h3>
              </div>
              <div className="hm-events-list">
                {eventList.map((e) => {
                  const dm = dayMon(e.starts_at)
                  return (
                    <div key={e.id} className="hm-event-item">
                      <div className="hm-event-date">
                        <b className="hm-event-day">{dm.day}</b>
                        <span className="hm-event-mon">{dm.mon}</span>
                      </div>
                      <div className="hm-event-body">
                        <p className="hm-event-title">{e.title}</p>
                        <p className="hm-event-meta">{e.participants ?? ''}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
              <p className="hm-events-note">
                Spiele und Turniere werden von der Verwaltung geplant und erscheinen automatisch im Spielplan.
              </p>
            </div>
          )}
          {news === null && (
            <div className="hm-events mt-6">
              <p className="hm-events-note">Aktuelles werden geladen …</p>
            </div>
          )}
        </Reveal>
      </div>
    </section>
  )
}
