import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiData, me, registerTournament } from '../lib/api'
import { Reveal } from './Reveal'
import { RichText } from '../lib/richText'

interface NewsRow { id: string; title: string; slug: string; lead: string | null; body: string | null; image_path: string | null; published_at: string | null; author_name?: string | null }
interface PromoRow { id: string; title: string; lead: string | null; body: string | null; image_path?: string | null; promo_expires_at: string | null; published_at?: string | null; author_name?: string | null; icon?: string | null; cta_label?: string | null; cta_link?: string | null }
interface EventRow { id: string; kind: string; title: string; participants: string | null; starts_at: string; description: string | null }
interface TournamentRow {
  id: string; title: string; description: string | null; format: 'single' | 'double'; fee_cents: number
  starts_at: string; registration_deadline: string | null; max_entries: number | null; status: 'announcement' | 'registration' | 'running' | 'finished'
  image_path: string | null; entry_count: number
}
interface OpenPost { title: string; lead: string | null; body: string | null; image_path: string | null; meta: string; cta_label?: string; cta_link?: string }

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

function newsMeta(n: NewsRow): string {
  return [fmtDate(n.published_at), n.author_name].filter(Boolean).join(' · ')
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
  const [openPost, setOpenPost] = useState<OpenPost | null>(null)

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

  useEffect(() => {
    if (!openPost) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenPost(null) }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [openPost])

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

  // featured = latest news with an image, else the latest one
  const featured = newsList.find((n) => n.image_path) ?? newsList[0]
  const restNews = featured ? newsList.filter((n) => n.id !== featured.id) : newsList

  const openNews = (n: NewsRow) =>
    setOpenPost({ title: n.title, lead: n.lead, body: n.body, image_path: n.image_path, meta: newsMeta(n) })
  const openPromo = (p: PromoRow) =>
    setOpenPost({
      title: p.title, lead: p.lead, body: p.body, image_path: p.image_path ?? null,
      meta: [fmtDate(p.published_at), p.author_name].filter(Boolean).join(' · '),
      cta_label: p.cta_label || 'Jetzt buchen', cta_link: p.cta_link || '/book',
    })
  const openTournament = (t: TournamentRow) =>
    setOpenPost({
      title: t.title, lead: null, body: t.description, image_path: t.image_path,
      meta: `${new Date(t.starts_at).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Berlin' })} Uhr${t.fee_cents > 0 ? ` · ${t.fee_cents / 100} € Startgebühr` : ''}`,
    })

  const media = (path: string | null, cls: string) =>
    path ? <img className={cls} src={path} alt="" loading="lazy" /> : (
      <span className="hm-news-ph"><i className="ri-tennis-line" aria-hidden="true" /></span>
    )

  const richCls = `hm-news-text [&_p+p]:mt-2 [&_ul]:mt-1 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mt-0.5 [&_strong]:text-foreground-950`

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

          {featured && (
            <article className="hm-feat-card">
              <button type="button" className="hm-feat-media" onClick={() => openNews(featured)} aria-label={`${featured.title} — weiterlesen`}>
                {media(featured.image_path, 'hm-feat-img')}
              </button>
              <div className="hm-feat-body">
                <p className="ro-eyebrow text-primary-500">{newsMeta(featured) || 'Aktuell'}</p>
                <h3 className="hm-feat-title">{featured.title}</h3>
                {featured.lead && <p className="hm-feat-lead">{featured.lead}</p>}
                <button type="button" onClick={() => openNews(featured)} className="hm-textlink mt-auto">
                  Weiterlesen <i className="ri-arrow-right-line" />
                </button>
              </div>
            </article>
          )}

          <div className="hm-news-grid3">
            {restNews.map((n) => (
              <article key={n.id} className="hm-news-mini">
                <button type="button" className="hm-mini-media" onClick={() => openNews(n)} aria-label={`${n.title} — weiterlesen`}>
                  {media(n.image_path, 'hm-mini-img')}
                </button>
                <div className="hm-mini-body">
                  <p className="hm-mini-meta">{newsMeta(n)}</p>
                  <h3 className="hm-mini-title">{n.title}</h3>
                  {n.lead && <p className="hm-mini-lead">{n.lead}</p>}
                  <button type="button" onClick={() => openNews(n)} className="hm-textlink mt-auto">
                    Weiterlesen <i className="ri-arrow-right-line" />
                  </button>
                </div>
              </article>
            ))}
          </div>

          {(promo ?? []).length > 0 && (
            <div className="mt-12">
              <div className="hm-events-head">
                <p className="ro-eyebrow text-primary-500">Angebote</p>
                <h3 className="hm-events-title">Aktuelle Angebote</h3>
              </div>
              <div className="hm-promo-strip">
                {(promo ?? []).slice(0, 3).map((p) => {
                  const ctaLabel = p.cta_label || 'Jetzt buchen'
                  const ctaTo = p.cta_link || '/book'
                  const ctaInner = <>{ctaLabel} <i className="ri-arrow-right-up-line" /></>
                  return (
                    <div key={p.id} className="hm-promo-card">
                      <div className="hm-promo-media">
                        {p.image_path
                          ? <img className="hm-promo-img" src={p.image_path} alt="" loading="lazy" />
                          : <span className="hm-promo-ph"><i className={p.icon || 'ri-gift-line'} aria-hidden="true" /></span>}
                        <span className="hm-promo-spin" aria-hidden="true">
                          <svg viewBox="0 0 100 100" className="hm-spin-svg">
                            <defs>
                              <path id={`spinOuter-${p.id}`} d="M 50,50 m -36,0 a 36,36 0 1,1 72,0 a 36,36 0 1,1 -72,0" />
                              <path id={`spinInner-${p.id}`} d="M 50,50 m -22,0 a 22,22 0 1,1 44,0 a 22,22 0 1,1 -44,0" />
                            </defs>
                            <g className="hm-spin-outer">
                              <text fontSize="10.5" letterSpacing="2.5">
                                <textPath href={`#spinOuter-${p.id}`}>AKTUELLES ANGEBOT · AKTUELLES ANGEBOT ·</textPath>
                              </text>
                            </g>
                            <g className="hm-spin-inner">
                              <text fontSize="10.5" letterSpacing="2.5">
                                <textPath href={`#spinInner-${p.id}`}>{`${(p.cta_label || 'JETZT BUCHEN').toUpperCase()} · ${(p.cta_label || 'JETZT BUCHEN').toUpperCase()} ·`}</textPath>
                              </text>
                            </g>
                          </svg>
                          <i className="ri-tennis-line" />
                        </span>
                      </div>
                      <p className="hm-promo-title">{p.title}</p>
                      {p.lead && <p className="hm-promo-sub line-clamp-2">{p.lead}</p>}
                      <div className="flex flex-wrap items-center gap-4 mt-auto pt-4">
                        {ctaTo.startsWith('/') || ctaTo.startsWith('#') ? (
                          <Link to={ctaTo} className="hm-cta">{ctaInner}</Link>
                        ) : (
                          <a href={ctaTo} target="_blank" rel="noreferrer" className="hm-cta">{ctaInner}</a>
                        )}
                        {p.body && (
                          <button type="button" onClick={() => openPromo(p)} className="hm-textlink">
                            Details <i className="ri-arrow-right-line" />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {tournamentList.length > 0 && (
            <div className="mt-12">
              <div className="hm-events-head">
                <p className="ro-eyebrow text-primary-500">Turniere</p>
                <h3 className="hm-events-title">Vereinsturniere</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-4">
                {tournamentList.map((t) => {
                  const reg = canRegister(t)
                  const full = t.max_entries != null && t.entry_count >= t.max_entries
                  const dm = dayMon(t.starts_at)
                  return (
                    <div key={t.id} className="hm-tour-card">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="ro-eyebrow text-primary-500">{t.format === 'double' ? 'Doppel' : 'Einzel'}</p>
                          <h3 className="hm-tour-title">{t.title}</h3>
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
                      {regMsg && regMsg.id === t.id && (
                        <p className={`mt-3 text-[13px] ${regMsg.ok ? 'text-primary-400' : 'text-red-300'}`}>{regMsg.text}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-5 mt-auto pt-4">
                        {reg && (
                          user ? (
                            <button
                              onClick={() => doRegister(t)}
                              disabled={regBusy === t.id || full}
                              className={`hm-cta ${full ? 'opacity-50 pointer-events-none' : ''}`}
                            >
                              {full ? 'Ausgebucht' : 'Melden'} <i className="ri-arrow-right-up-line" />
                            </button>
                          ) : (
                            <Link to="/sign-in" className="hm-textlink">Zum Melden anmelden <i className="ri-arrow-right-line" /></Link>
                          )
                        )}
                        {t.description && (
                          <button type="button" onClick={() => openTournament(t)} className="hm-textlink">
                            Details <i className="ri-arrow-right-line" />
                          </button>
                        )}
                      </div>
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

      {openPost && (
        <div className="hm-modal-overlay" onClick={() => setOpenPost(null)} role="presentation">
          <div className="hm-modal" role="dialog" aria-modal="true" aria-label={openPost.title} onClick={(e) => e.stopPropagation()}>
            {openPost.image_path && <img className="hm-modal-img" src={openPost.image_path} alt="" />}
            <button type="button" className="hm-modal-close" onClick={() => setOpenPost(null)} aria-label="Schließen">
              <i className="ri-close-line" />
            </button>
            <div className="hm-modal-body">
              {openPost.meta && (
                <p className="hm-mini-meta flex items-center gap-1.5">
                  <i className="ri-time-line text-[13px]" />
                  {openPost.meta}
                </p>
              )}
              <h3 className="hm-feat-title !text-[24px] mt-2">{openPost.title}</h3>
              {openPost.lead && <p className="hm-feat-lead !text-primary-400 font-medium mt-2">{openPost.lead}</p>}
              {openPost.body && <RichText body={openPost.body} className={`${richCls} mt-3`} />}
              <div className="flex flex-wrap items-center gap-4 mt-5">
                {openPost.cta_link && (
                  openPost.cta_link.startsWith('/') || openPost.cta_link.startsWith('#') ? (
                    <Link to={openPost.cta_link} className="hm-btn hm-btn-lime">{openPost.cta_label} <i className="ri-arrow-right-up-line" /></Link>
                  ) : (
                    <a href={openPost.cta_link} target="_blank" rel="noreferrer" className="hm-btn hm-btn-lime">{openPost.cta_label} <i className="ri-arrow-right-up-line" /></a>
                  )
                )}
                <button type="button" onClick={() => setOpenPost(null)} className="hm-textlink">Schließen <i className="ri-arrow-right-line" /></button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
