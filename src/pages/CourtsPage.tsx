import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Nav } from '../components/Nav'
import { Footer } from '../components/Footer'
import { HeroScrub } from '../components/HeroScrub'
import { Reveal } from '../components/Reveal'
import { CtaBand } from '../components/CtaBand'
import { Belegungsplan } from '../components/Belegungsplan'
import { Aktuelles } from '../components/Aktuelles'
import { Partner } from '../components/Partner'
import { Kontakt } from '../components/Kontakt'
import { getBootstrap, type Court, type Venue } from '../lib/api'

function Price({ court }: { court: Court }) {
  return (
    <p className="text-foreground-700 text-[13px] whitespace-nowrap">
      <span className="text-[26px] md:text-[28px] leading-none font-bold ro-grad-text-soft">
        {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(court.hourly_price ?? 0)}
      </span>{' '}
      / Stunde
    </p>
  )
}

function BookPill({ court }: { court: Court }) {
  return (
    <Link
      aria-label={`Buchen: ${court.name}`}
      className="group box-border inline-flex h-12 items-center gap-3 rounded-full border pl-5 pr-[5px] whitespace-nowrap cursor-pointer transition-colors duration-300 text-[15px] leading-none font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background-50 justify-center bg-primary-500 border-primary-500 hover:bg-primary-400 hover:border-primary-400 text-background-50"
      to={`/book?court=${court.id}`}
    >
      Platz buchen
      <span className="w-9 h-9 shrink-0 flex items-center justify-center rounded-full transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 bg-background-50 text-primary-500">
        <i className="ri-arrow-right-up-line text-base leading-none" />
      </span>
    </Link>
  )
}

function AvailabilityPill({ court }: { court: Court }) {
  return (
    <Link
      aria-label={`Verfügbarkeit prüfen: ${court.name}`}
      className="group box-border inline-flex h-12 items-center gap-3 rounded-full border pl-5 pr-[5px] whitespace-nowrap cursor-pointer transition-colors duration-300 text-[15px] leading-none font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background-50 justify-center bg-foreground-950/[0.05] border-foreground-950/20 hover:bg-foreground-950/[0.1] hover:border-primary-500/60 text-foreground-950"
      to={`/book?court=${court.id}`}
    >
      Verfügbarkeit
      <span className="w-9 h-9 shrink-0 flex items-center justify-center rounded-full transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 bg-primary-500 text-background-50">
        <i className="ri-arrow-right-up-line text-base leading-none" />
      </span>
    </Link>
  )
}

function Chips({ court }: { court: Court }) {
  return (
    <div className="flex flex-wrap gap-2">
      {court.environment && (
        <span className="h-7 px-3 inline-flex items-center rounded-full ro-chip text-[12px] font-medium text-primary-500 capitalize">
          {court.environment}
        </span>
      )}
      {court.surface && (
        <span className="h-7 px-3 inline-flex items-center rounded-full ro-chip text-[12px] font-medium text-foreground-900 capitalize">
          {court.surface}
        </span>
      )}
    </div>
  )
}

/* small card: image on top, body below (like prod card 1) */
function SmallCard({ court }: { court: Court }) {
  return (
    <Reveal className="h-full">
      <article className="h-full flex flex-col rounded-[20px] ro-card p-4 md:p-6">
        <div className="w-full h-[200px] md:h-[153px] rounded-2xl overflow-hidden ro-frame">
          {court.image_url && (
            <img
              loading="lazy"
              decoding="async"
              alt={`${court.name} Rebound Ace Tennisplatz`}
              title={`${court.name} – ${court.surface}`}
              className="ro-img-court w-full h-full object-cover object-center transition-transform duration-700 hover:scale-105"
              src={court.image_url}
            />
          )}
        </div>
        <div className="mt-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-2">
              <p className="ro-eyebrow text-foreground-700">Tennishalle</p>
              {court.court_number && (
                <span className="text-[11px] tracking-[0.18em] uppercase font-semibold text-foreground-500">
                  Platz {court.court_number}
                </span>
              )}
            </div>
            <h3 className="mt-2 ro-card-title ro-grad-lime">{court.name}</h3>
          </div>
        </div>
        <div className="mt-5">
          <Chips court={court} />
        </div>
        <div className="mt-auto pt-6 flex flex-wrap items-center justify-between gap-4 border-t border-foreground-950/10">
          <Price court={court} />
          <BookPill court={court} />
        </div>
      </article>
    </Reveal>
  )
}

/* big card: header row (title + price), two images 3fr/1fr, chips + pills (like prod card 2) */
function BigCard({ court, detail, delay }: { court: Court; detail: string; delay: number }) {
  return (
    <Reveal className="h-full" delay={delay}>
      <article className="h-full flex flex-col rounded-[20px] ro-card ro-card-live p-4 md:p-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-2">
              <p className="ro-eyebrow text-foreground-700">Tennishalle</p>
              {court.court_number && (
                <span className="text-[11px] tracking-[0.18em] uppercase font-semibold text-foreground-500">
                  Platz {court.court_number}
                </span>
              )}
            </div>
            <h3 className="mt-2 ro-card-title ro-grad-lime">{court.name}</h3>
          </div>
          <Price court={court} />
        </div>
        <div className="mt-5 grid grid-cols-[3fr_1fr] gap-2 h-[180px] md:h-[215px]">
          <div className="rounded-2xl overflow-hidden ro-frame">
            {court.image_url && (
              <img
                loading="lazy"
                decoding="async"
                alt={`${court.name} Rebound Ace Tennisplatz`}
                title={`${court.name} – ${court.surface}`}
                className="ro-img-court w-full h-full object-cover object-center transition-transform duration-700 hover:scale-105"
                src={court.image_url}
              />
            )}
          </div>
          <div className="rounded-2xl overflow-hidden ro-frame">
            <img
              loading="lazy"
              decoding="async"
              alt="Besaitung im Detail"
              title="Schläger-Detail"
              className="ro-img-detail w-full h-full object-cover object-center"
              src={detail}
            />
          </div>
        </div>
        <div className="mt-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <Chips court={court} />
          <div className="flex flex-wrap gap-2">
            <AvailabilityPill court={court} />
            <BookPill court={court} />
          </div>
        </div>
      </article>
    </Reveal>
  )
}

const DETAILS = [
  '/assets/img/gen-00-moody-black-and-white-close-up-photograp.webp',
  '/assets/img/gen-03-one-complete-tennis-racket-shown-entirel.webp',
  '/assets/img/gen-01-moody-close-up-photograph-of-a-fluoresce.webp',
  '/assets/img/gen-02-moody-editorial-close-up-of-a-fluorescen.webp',
]

function CourtsPage() {
  const [courts, setCourts] = useState<Court[]>([])
  const [venues, setVenues] = useState<Venue[]>([])
  const [filter, setFilter] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    getBootstrap()
      .then((r) => {
        setCourts(r.courts)
        setVenues(r.venues)
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [])

  // hash navigation from Nav links (#belegung, #aktuelles, #partner, #court-list)
  const location = useLocation()
  useEffect(() => {
    const hash = location.hash
    if (!hash) return
    const id = hash.slice(1)
    const jump = () => {
      const el = document.getElementById(id)
      if (el) el.scrollIntoView({ behavior: 'auto' })
    }
    jump()
    // sections load async (images, availability data) — layout shifts push the
    // target down after the first jump; re-jump until the position settles
    const iv = setInterval(jump, 250)
    const stop = setTimeout(() => clearInterval(iv), 3000)
    const onHash = () => {
      const el = document.getElementById(location.hash.slice(1))
      if (el) el.scrollIntoView({ behavior: 'smooth' })
    }
    window.addEventListener('hashchange', onHash)
    return () => {
      clearInterval(iv)
      clearTimeout(stop)
      window.removeEventListener('hashchange', onHash)
    }
  }, [location.hash, loaded])

  const summary = useMemo(() => {
    const n = courts.length
    const v = venues.length
    return `${n} ${n === 1 ? 'Platz' : 'Plätze'} in ${v} ${v === 1 ? 'Anlage' : 'Anlagen'}. Platz wählen, Live-Verfügbarkeit prüfen und mit wenigen Klicks reservieren.`
  }, [courts, venues])

  const filtered = useMemo(() => {
    if (!filter || filter === 'all') return courts
    if (filter === 'outdoor') return courts.filter((c) => c.environment === 'Außenplatz')
    return courts.filter((c) => c.venue_id === filter && c.environment !== 'Außenplatz')
  }, [courts, filter])

  // alternating pairs: [406fr, 842fr] — small first, big second (matches prod)
  const pairs: Array<{ court: Court; big: boolean }[]> = []
  for (let i = 0; i < filtered.length; i += 2) {
    if (i + 1 < filtered.length) {
      pairs.push([
        { court: filtered[i], big: false },
        { court: filtered[i + 1], big: true },
      ])
    } else {
      pairs.push([{ court: filtered[i], big: true }])
    }
  }

  const tabCls = (active: boolean) =>
    `h-10 md:h-12 px-4 md:px-5 rounded-full text-[14px] md:text-base font-medium whitespace-nowrap cursor-pointer transition-colors ${
      active
        ? 'bg-background-50 text-primary-500 ring-1 ring-primary-500/30'
        : 'text-foreground-800 hover:text-foreground-950 hover:bg-foreground-950/5'
    }`

  return (
    <div className="ro min-h-screen">
      <Nav />
      <main>
        <HeroScrub summary={summary} />

        <Belegungsplan />
        <Aktuelles />
        <Partner />

        <section id="court-list" className="ro-band-list ro-spot pt-16 md:pt-[100px] pb-4 scroll-mt-24" aria-labelledby="list-title">
          <div className="ro-container">
            <Reveal>
              <div id="list-title">
                <h2 className="ro-h2 text-primary-500">
                  <span className="ro-grad-text">Wähle</span>
                  <span className="font-script inline-block align-baseline mx-1 md:mx-2 -translate-y-[0.12em] ro-grad-lime text-[52px] md:text-[80px] leading-[1.1]">
                    deinen Platz
                  </span>
                </h2>
              </div>
              <p className="mt-3 ro-body text-foreground-700 max-w-[560px]">
                Alle Plätze sind live im Buchungssystem. Nach Anlage filtern und einen Platz öffnen, um die freien Zeiten zu sehen.
              </p>
            </Reveal>
          </div>

          {/* sticky filter tabs */}
          <div className="mt-8">
            <div className="sticky top-20 md:top-24 z-30 flex justify-center pointer-events-none">
              <div
                role="tablist"
                aria-label="Nach Anlage filtern"
                className="pointer-events-auto max-w-full overflow-x-auto inline-flex gap-1 p-1.5 rounded-full bg-background-200/95 backdrop-blur border border-foreground-950/10"
              >
                <button type="button" role="tab" aria-selected={!filter} onClick={() => setFilter(null)} className={tabCls(!filter)}>
                  Alle Anlagen
                </button>
                {venues.map((v) => (
                  <button key={v.id} type="button" role="tab" aria-selected={filter === v.id} onClick={() => setFilter(v.id)} className={tabCls(filter === v.id)}>
                    {v.name}
                  </button>
                ))}
                <button key="outdoor" type="button" role="tab" aria-selected={filter === 'outdoor'} onClick={() => setFilter('outdoor')} className={tabCls(filter === 'outdoor')}>
                  Outdoor
                </button>
              </div>
            </div>
          </div>

          {/* cards */}
          <div className="ro-container mt-8 md:mt-10 space-y-4 md:space-y-8">
            {loaded && filtered.length === 0 && <p className="ro-body text-foreground-700">Auf dieser Anlage ist aktuell kein Platz frei.</p>}
            {pairs.map((pair, i) => (
              <div key={i} className="grid grid-cols-1 gap-4 md:gap-8 lg:grid-cols-[406fr_842fr]">
                {pair.map((p, j) =>
                  p.big ? (
                    <BigCard key={p.court.id} court={p.court} detail={DETAILS[i % DETAILS.length]} delay={j * 100} />
                  ) : (
                    <SmallCard key={p.court.id} court={p.court} />
                  ),
                )}
              </div>
            ))}
          </div>
        </section>

        <Kontakt />
        <CtaBand />
      </main>
      <Footer />
    </div>
  )
}

export default CourtsPage
