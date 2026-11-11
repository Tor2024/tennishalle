import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Nav } from '../components/Nav'
import { Footer } from '../components/Footer'
import { HeroScrub } from '../components/HeroScrub'
import { SectionHeading } from '../components/SectionHeading'
import { Reveal } from '../components/Reveal'
import { CtaBand } from '../components/CtaBand'
import { formatPrice, getCourts, type Court, type Venue } from '../lib/supabase'

function CourtCard({ court, big, small }: { court: Court; big: boolean; small: boolean }) {
  return (
    <Link
      to={`/book?court=${court.id}`}
      className={`group text-left rounded-lg overflow-hidden border border-foreground-950/10 hover:border-foreground-950/30 transition-colors duration-300 ${big ? 'lg:col-span-8' : 'lg:col-span-4'}`}
    >
      <div className={`relative w-full overflow-hidden bg-background-100 ${small ? 'h-56' : 'h-72 md:h-96'}`}>
        {court.image_url && (
          <img
            loading="lazy"
            decoding="async"
            src={court.image_url}
            alt={`${court.name} Tennisplatz`}
            title={court.name}
            className="ro-img-court w-full h-full object-cover object-top transition-transform duration-700 group-hover:scale-[1.04]"
          />
        )}
        <span className="absolute bottom-2 left-3 font-wordmark text-4xl leading-none text-foreground-950/90">
          {String(court.court_number ?? 1).padStart(2, '0')}
        </span>
      </div>
      <div className="p-4 md:p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="ro-card-title ro-grad-lime">{court.name}</p>
          <p className="whitespace-nowrap pt-1">
            <strong className="text-[18px] text-foreground-950">{formatPrice(court.hourly_price)}</strong>
            <span className="text-[13px] text-foreground-600"> /Std.</span>
          </p>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {court.surface && (
            <span className="ro-chip rounded-full px-2.5 py-0.5 text-[12px] text-foreground-800 capitalize">{court.surface}</span>
          )}
          <span className="ro-chip rounded-full px-2.5 py-0.5 text-[12px] text-foreground-800">Halle</span>
        </div>
      </div>
    </Link>
  )
}

function CourtsPage() {
  const [courts, setCourts] = useState<Court[]>([])
  const [venues, setVenues] = useState<Venue[]>([])
  const [filter, setFilter] = useState<string | null>(null)
  const [outdoor, setOutdoor] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    getCourts()
      .then((r) => {
        setCourts(r.courts)
        setVenues(r.venues)
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [])

  const summary = useMemo(() => {
    const n = courts.length
    const v = venues.length
    return `${n} ${n === 1 ? 'Platz' : 'Plätze'} in ${v} ${v === 1 ? 'Anlage' : 'Anlagen'}. Belag wählen, Live-Verfügbarkeit prüfen und mit wenigen Klicks reservieren.`
  }, [courts, venues])

  const filtered = useMemo(() => {
    if (!filter) return courts
    return courts.filter((c) => c.venue_id === filter)
  }, [courts, filter])

  // alternating pairs: 842fr/406fr
  const pairs: Array<{ court: Court; big: boolean; small: boolean }[]> = []
  for (let i = 0; i < filtered.length; i += 2) {
    if (i + 1 < filtered.length) {
      pairs.push([{ court: filtered[i], big: true, small: false }, { court: filtered[i + 1], big: false, small: true }])
    } else {
      pairs.push([{ court: filtered[i], big: true, small: false }])
    }
  }

  return (
    <div className="ro min-h-screen">
      <Nav />
      <main>
        <HeroScrub summary={summary} />

        <section id="court-list" className="ro-band-list ro-spot relative">
          <div className="ro-container py-16 md:py-24">
            <SectionHeading lead="Wähle" script="deinen Belag" id="court-list-heading" />
            <Reveal className="mt-4" as="p">
              <span className="ro-body text-foreground-700 max-w-xl block">
                Alle Plätze sind live im Buchungssystem. Nach Anlage filtern und einen Platz öffnen, um die freien Zeiten zu sehen.
              </span>
            </Reveal>

            {/* filter chips */}
            <div className="mt-8 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setFilter(null)
                  setOutdoor(false)
                }}
                className={`ro-chip rounded-full px-4 py-2 text-[13px] font-bold cursor-pointer transition-colors ${!filter && !outdoor ? 'bg-primary-500 text-background-950 border-primary-500' : 'text-foreground-800'}`}
              >
                Alle Anlagen
              </button>
              {venues.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => {
                    setFilter(v.id)
                    setOutdoor(false)
                  }}
                  className={`ro-chip rounded-full px-4 py-2 text-[13px] font-bold cursor-pointer transition-colors ${filter === v.id ? 'bg-primary-500 text-background-950 border-primary-500' : 'text-foreground-800'}`}
                >
                  {v.name}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setOutdoor(true)
                }}
                className={`ro-chip rounded-full px-4 py-2 text-[13px] font-bold cursor-pointer transition-colors ${outdoor ? 'bg-primary-500 text-background-950 border-primary-500' : 'text-foreground-800'}`}
              >
                Outdoor – bald
              </button>
            </div>

            {/* court cards */}
            {loaded && filtered.length === 0 && !outdoor && (
              <p className="ro-body text-foreground-700 mt-10">Auf dieser Anlage ist aktuell kein Platz frei.</p>
            )}

            {outdoor ? (
              <div className="mt-10 grid gap-6 lg:grid-cols-[842fr_406fr]">
                <div className="ro-card overflow-hidden rounded-lg">
                  <div className="relative w-full h-72 md:h-96 overflow-hidden">
                    <img src="/assets/img/gen-04-outdoor.jpg" alt="Outdoor-Sandplatz" className="ro-img-court w-full h-full object-cover" />
                    <span className="absolute bottom-2 left-3 font-wordmark text-4xl leading-none text-foreground-950/90">03</span>
                  </div>
                  <div className="p-4 md:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <p className="ro-card-title ro-grad-lime">Outdoor-Sandplatz</p>
                      <p className="ro-eyebrow text-foreground-600 pt-1.5">In Planung</p>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <span className="ro-chip rounded-full px-2.5 py-0.5 text-[12px] text-foreground-800">Bald</span>
                      <span className="ro-chip rounded-full px-2.5 py-0.5 text-[12px] text-foreground-800">Sand</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-10 flex flex-col gap-6">
                {pairs.map((pair, i) => (
                  <div key={i} className="grid gap-6 lg:grid-cols-[842fr_406fr]">
                    {pair.map((p) => (
                      <CourtCard key={p.court.id} court={p.court} big={p.big} small={p.small} />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <CtaBand />
      </main>
      <Footer />
    </div>
  )
}

export default CourtsPage
