import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiData } from '../lib/api'
import { Reveal } from './Reveal'

interface NewsRow { id: string; title: string; slug: string; body: string | null; image_path: string | null; published_at: string | null; author_name?: string | null }
interface PromoRow { id: string; title: string; body: string | null; promo_expires_at: string | null; published_at?: string | null; author_name?: string | null }
interface EventRow { id: string; kind: string; title: string; participants: string | null; starts_at: string; description: string | null }

const MON = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']

// static fallback (original content from the prod bundle) — shown if DB is empty or unreachable
const FALLBACK_NEWS: NewsRow[] = [
  { id: 'fb-1', title: 'Winterhallen-Plan ist da', slug: 'winterhallen-plan', body: 'Ab sofort gelten die Winteröffnungszeiten in der Halle. Alle Zeiten findest du auf der Übersicht der Plätze.', image_path: null, published_at: null },
  { id: 'fb-2', title: 'Neue Kursgruppe Kinder', slug: 'kursgruppe-kinder', body: 'Ein neuer Kurs für Kinder von 6–9 Jahren startet im Dezember. Anmeldung jetzt möglich.', image_path: null, published_at: null },
]
const FALLBACK_PROMO: PromoRow = { id: 'fb-p', title: 'Montags bis freitags vor 12 Uhr: −20 % auf jede Hallenbuchung', body: 'Gilt für alle Hallenplätze bei Buchung über das System.', promo_expires_at: null }
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
  const [promo, setPromo] = useState<PromoRow | null>(null)
  const [events, setEvents] = useState<EventRow[] | null>(null)

  useEffect(() => {
    apiData<{ ok: boolean; news: NewsRow[]; promo: PromoRow | null; events: EventRow[] }>('news')
      .then((r) => {
        if (!r?.ok) throw new Error('bad response')
        setNews(r.news?.length ? r.news : FALLBACK_NEWS)
        setPromo(r.promo ?? FALLBACK_PROMO)
        setEvents(r.events ?? [])
      })
      .catch(() => {
        setNews(FALLBACK_NEWS)
        setPromo(FALLBACK_PROMO)
        setEvents(FALLBACK_EVENTS)
      })
  }, [])

  const newsList = news ?? []
  const eventList = events ?? []

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
                  {n.body && <p className="hm-news-text">{n.body}</p>}
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
            {promo && (
              <div className="hm-promo-card">
                <p className="hm-promo-pill">Angebot der Woche</p>
                <p className="hm-promo-title">{promo.title}</p>
                {promo.body && <p className="hm-promo-sub">{promo.body}</p>}
                {(() => {
                  const meta = [fmtDate(promo.published_at), promo.author_name].filter(Boolean).join(' · ')
                  return meta ? (
                    <p className="text-xs opacity-70 flex items-center gap-1.5">
                      <i className="ri-time-line text-[13px]" />
                      {meta}
                    </p>
                  ) : null
                })()}
                <Link to="/book" className="hm-btn hm-btn-lime">
                  Jetzt Slots sichern <i className="ri-arrow-right-up-line" />
                </Link>
              </div>
            )}
          </div>
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
