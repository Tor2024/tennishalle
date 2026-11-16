import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, getBootstrap, type Court, type DayOverview, type SlotInfo } from '../lib/api'

const TZ = 'Europe/Berlin'
const MAX_DAYS = 365
const WINDOW_SIZE = 14
const SLOT_MIN = 30

const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
const MONTH = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']
const MONTH_FULL = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']

function berlinToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date())
}

function addDays(dk: string, n: number): string {
  const d = new Date(`${dk}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function fmtDay(dk: string) {
  const d = new Date(`${dk}T12:00:00Z`)
  const today = berlinToday()
  const wd = dk === today ? 'Heute' : dk === addDays(today, 1) ? 'Morgen' : WD[d.getUTCDay()]
  return {
    wd,
    dayNum: d.getUTCDate(),
    month: MONTH[d.getUTCMonth()],
    year: d.getUTCFullYear(),
    full: `${dk === today ? 'Heute' : wd === 'Morgen' ? 'Morgen' : WD[d.getUTCDay()]}, ${d.getUTCDate()}. ${MONTH[d.getUTCMonth()]} ${d.getUTCFullYear()}`,
    monthYear: `${MONTH_FULL[d.getUTCMonth()]} ${d.getUTCFullYear()}`,
  }
}

function toMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function toHHMM(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}


type DetailsMap = Record<string, Record<string, SlotInfo[]>>

export function Belegungsplan() {
  const [selectedDate, setSelectedDate] = useState(berlinToday)
  const [windowStartDate, setWindowStartDate] = useState(berlinToday)
  const [viewMode, setViewMode] = useState<'cards' | 'matrix'>('cards')
  const [envFilter, setEnvFilter] = useState<'all' | 'indoor' | 'outdoor'>('all')
  const [courts, setCourts] = useState<Court[]>([])
  const [overviewMap, setOverviewMap] = useState<Record<string, DayOverview>>({})
  const [details, setDetails] = useState<DetailsMap>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const today = berlinToday()
  const maxDate = addDays(today, MAX_DAYS)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [ov, cv] = await Promise.all([
          api<{ ok: boolean; days?: DayOverview[] }>('month_overview', { from: today, days: MAX_DAYS }),
          getBootstrap(),
        ])
        if (!alive) return
        const map: Record<string, DayOverview> = {}
        for (const d of ov.days ?? []) map[d.date] = d
        setOverviewMap(map)
        setCourts(cv.courts)
      } catch {
        if (alive) setError('Belegungsdaten konnten nicht geladen werden.')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // preload availability for the next 7 days once courts are known
  useEffect(() => {
    if (courts.length === 0) return
    let alive = true
    ;(async () => {
      const days = Array.from({ length: 7 }, (_, i) => addDays(today, i))
      const results = await Promise.all(
        days.map(async (dk) => ({
          dk,
          per: await Promise.all(
            courts.map(async (c) => {
              try {
                const r = await api<{ ok: boolean; times?: SlotInfo[] }>('availability', { court_id: c.id, date: dk, duration: SLOT_MIN })
                return [c.id, r.times ?? []] as const
              } catch {
                return [c.id, []] as const
              }
            }),
          ),
        })),
      )
      if (!alive) return
      setDetails((prev) => {
        const next = { ...prev }
        for (const { dk, per } of results) {
          next[dk] = Object.fromEntries(per)
        }
        return next
      })
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courts])

  // load details for the selected day (with cache)
  useEffect(() => {
    if (courts.length === 0) return
    if (details[selectedDate]) return
    let alive = true
    ;(async () => {
      const per = await Promise.all(
        courts.map(async (c) => {
          try {
            const r = await api<{ ok: boolean; times?: SlotInfo[] }>('availability', { court_id: c.id, date: selectedDate, duration: SLOT_MIN })
            return [c.id, r.times ?? []] as const
          } catch {
            return [c.id, []] as const
          }
        }),
      )
      if (!alive) return
      setDetails((prev) => ({ ...prev, [selectedDate]: Object.fromEntries(per) }))
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, courts])

  const dayData = details[selectedDate]

  function selectDate(dk: string) {
    const clamped = dk < today ? today : dk > maxDate ? maxDate : dk
    setSelectedDate(clamped)
    setWindowStartDate((w) => {
      // keep selected day inside the 14-day window
      const winEnd = addDays(w, WINDOW_SIZE - 1)
      if (clamped < w) return clamped < today ? today : clamped
      if (clamped > winEnd) {
        const nw = addDays(clamped, -(WINDOW_SIZE - 1))
        return nw < today ? today : nw
      }
      return w
    })
  }

  function shiftWindow(n: number) {
    setWindowStartDate((w) => {
      const nw = addDays(w, n * 7)
      if (nw < today) return today
      if (addDays(nw, WINDOW_SIZE - 1) > maxDate) return addDays(maxDate, -(WINDOW_SIZE - 1))
      return nw
    })
  }

  function shiftMonth(n: number) {
    const d = new Date(`${selectedDate}T12:00:00Z`)
    const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1))
    let dk = target.toISOString().slice(0, 10)
    if (dk < today) dk = today
    if (dk > maxDate) dk = maxDate
    selectDate(dk)
  }

  const hasIndoor = courts.some((c) => c.environment !== 'Außenplatz')
  const hasOutdoor = courts.some((c) => c.environment === 'Außenplatz')

  const visibleCourts = useMemo(() => {
    if (envFilter === 'all') return courts
    if (envFilter === 'outdoor') return courts.filter((c) => c.environment === 'Außenplatz')
    return courts.filter((c) => c.environment !== 'Außenplatz')
  }, [courts, envFilter])

  const windowDays = useMemo(() => {
    const out: string[] = []
    let d = windowStartDate
    while (out.length < WINDOW_SIZE && d <= maxDate) {
      out.push(d)
      d = addDays(d, 1)
    }
    return out
  }, [windowStartDate, maxDate])

  const dayChipInfo = useMemo(() => {
    const map: Record<string, { cls: string; label: string }> = {}
    for (const dk of windowDays) {
      const dd = details[dk]
      let free: number | null = null
      let total: number | null = null
      if (dd) {
        total = 0
        free = 0
        for (const c of courts) {
          const slots = dd[c.id] ?? []
          total += slots.length
          free += slots.filter((s) => s.available).length
        }
      } else {
        const ov = overviewMap[dk]
        if (ov) {
          total = ov.total
          free = ov.free
        }
      }
      if (free === null || total === null || total === 0) {
        map[dk] = { cls: '', label: 'Plan prüfen' }
      } else if (free === total) {
        map[dk] = { cls: 'hm-badge-all', label: `${free} frei` }
      } else if (free > 0) {
        map[dk] = { cls: 'hm-badge-part', label: `${free} frei` }
      } else {
        map[dk] = { cls: 'hm-badge-busy', label: 'Ausgebucht' }
      }
    }
    return map
  }, [windowDays, details, courts, overviewMap])

  const sel = fmtDay(selectedDate)
  const selD = new Date(`${selectedDate}T12:00:00Z`)
  const isPrevMonthDisabled = `${selD.getUTCFullYear()}-${String(selD.getUTCMonth() + 1).padStart(2, '0')}` <= `${new Date(`${today}T12:00:00Z`).getUTCFullYear()}-${String(new Date(`${today}T12:00:00Z`).getUTCMonth() + 1).padStart(2, '0')}`

  function bookHref(courtId: string, time: string): string {
    return `/book?court=${courtId}&date=${selectedDate}&time=${time}&duration=${SLOT_MIN}`
  }

  return (
    <section id="belegung" className="hm-section hm-band scroll-mt-20">
      <a id="schnell" style={{ display: 'none' }} aria-hidden="true" />
      <div className="ro-container">
        <div className="hm-section-head">
          <div>
            <p className="ro-eyebrow">Live-Belegungsplan · Alle Plätze im 30-Minuten-Raster</p>
            <h2 className="hm-h2">
              Aktuelle <span className="hm-script">Platzbelegung</span>
            </h2>
            <p className="ro-body text-foreground-700 mt-2 max-w-2xl">
              Echtzeit-Übersicht aller Plätze: Welcher Court ist wann belegt oder frei? Wähle den Tag
              und sieh die Belegung jedes einzelnen Platzes auf einen Blick.
            </p>
          </div>
          <div className="hm-head-actions">
            <div className="hm-legend">
              <span className="hm-legend-item">
                <span className="hm-key hm-key-free" /> Frei (anklicken zum Buchen)
              </span>
              <span className="hm-legend-item">
                <span className="hm-key hm-key-busy" /> Belegt
              </span>
            </div>
            <div className="hm-view-switch" role="tablist">
              <button
                type="button"
                className={`hm-view-btn ${viewMode === 'cards' ? 'is-active' : ''}`}
                onClick={() => setViewMode('cards')}
              >
                <i className="ri-layout-grid-line" /> Nach Plätzen
              </button>
              <button
                type="button"
                className={`hm-view-btn ${viewMode === 'matrix' ? 'is-active' : ''}`}
                onClick={() => setViewMode('matrix')}
              >
                <i className="ri-table-line" /> Zeittabelle
              </button>
            </div>
          </div>
        </div>

        <div className="hm-flow-guide">
          {[
            ['Tag & Datum wählen', 'Beliebiges Datum im Kalender (bis 365 Tage im Voraus)'],
            ['Freie 30-Min-Slots wählen', 'Echtzeit-Verfügbarkeit aller Courts auf einen Blick'],
            ['Anmelden & Platz sichern', 'Mit Kundenkonto einloggen & sofort reservieren'],
          ].map(([title, desc], i) => (
            <div key={title} className="hm-flow-step">
              <span className="hm-flow-num">{i + 1}</span>
              <span className="hm-flow-text">
                <span className="hm-flow-title">{title}</span>
                <span className="hm-flow-desc">{desc}</span>
              </span>
              {i < 2 && <i className="ri-arrow-right-s-line hm-flow-arrow" />}
            </div>
          ))}
        </div>

        <div className="hm-date-toolbar">
          <div className="hm-month-nav">
            <button type="button" className="hm-month-btn" aria-label="Vorheriger Monat" onClick={() => shiftMonth(-1)} disabled={isPrevMonthDisabled}>
              <i className="ri-arrow-left-s-line" />
            </button>
            <span className="hm-month-label">{sel.monthYear}</span>
            <button type="button" className="hm-month-btn" aria-label="Nächster Monat" onClick={() => shiftMonth(1)}>
              <i className="ri-arrow-right-s-line" />
            </button>
          </div>
          <div className="hm-date-actions">
            <button type="button" className="hm-today-btn" onClick={() => selectDate(today)}>
              <i className="ri-calendar-check-line" /> Heute
            </button>
            <label className="hm-calendar-picker-btn">
              <i className="ri-calendar-event-line" />
              <span>{sel.full}</span>
              <input
                type="date"
                className="hm-native-date-input"
                value={selectedDate}
                min={today}
                max={maxDate}
                onChange={(e) => e.target.value && selectDate(e.target.value)}
              />
            </label>
          </div>
        </div>

        <div className="hm-days-bar-wrap">
          <button
            type="button"
            className="hm-days-nav-arrow"
            aria-label="7 Tage zurück"
            onClick={() => shiftWindow(-1)}
            disabled={windowStartDate <= today}
          >
            <i className="ri-arrow-left-s-line" />
          </button>
          <div className="hm-days-bar">
            {windowDays.map((dk) => {
              const f = fmtDay(dk)
              const badge = dayChipInfo[dk]
              return (
                <button
                  key={dk}
                  type="button"
                  className={`hm-day-chip ${dk === selectedDate ? 'is-active' : ''}`}
                  onClick={() => selectDate(dk)}
                >
                  <span className="hm-day-chip-wd">{f.wd}</span>
                  <span className="hm-day-chip-date">
                    {f.dayNum}. {f.month}
                  </span>
                  <span className={`hm-day-chip-badge ${badge?.cls}`}>{badge?.label}</span>
                </button>
              )
            })}
          </div>
          <button
            type="button"
            className="hm-days-nav-arrow"
            aria-label="7 Tage vor"
            onClick={() => shiftWindow(1)}
            disabled={addDays(windowStartDate, WINDOW_SIZE - 1) >= maxDate}
          >
            <i className="ri-arrow-right-s-line" />
          </button>
        </div>

        {hasIndoor && hasOutdoor && (
          <div className="hm-filter-bar">
            {(
              [
                ['all', `Alle Plätze (${courts.length})`],
                ['indoor', '🏢 Hallenplätze'],
                ['outdoor', '☀️ Außenplätze'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`hm-filter-chip ${envFilter === key ? 'is-active' : ''}`}
                onClick={() => setEnvFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <div className="hm-schedule-wrap" aria-live="polite">
          {loading ? (
            <div className="hm-grid-loading">
              <i className="ri-loader-4-line hm-spin" /> Belegungsdaten aller Plätze werden geladen …
            </div>
          ) : error ? (
            <div className="hm-empty">
              {error} <Link to="/book">Zum Buchen</Link>
            </div>
          ) : visibleCourts.length === 0 ? (
            <div className="hm-empty">Keine Plätze für diesen Filter gefunden.</div>
          ) : viewMode === 'matrix' ? (
            <MatrixView courts={visibleCourts} dayData={dayData} bookHref={bookHref} />
          ) : (
            <CardsView courts={visibleCourts} dayData={dayData} bookHref={bookHref} />
          )}
        </div>

        <div className="hm-grid-footer">
          <p className="hm-grid-note">
            <i className="ri-information-line" />
            <span>
              Klicke auf eine freie Spielzeit (30 Min.), um die Buchung für diesen Platz zu starten.{' '}
              <strong>Kostenloses Kundenkonto erforderlich.</strong>
            </span>
          </p>
        </div>
      </div>
    </section>
  )
}

function envLabel(c: Court): string {
  return c.environment === 'Außenplatz' ? 'Außenplatz' : 'Halle'
}

function priceLabel(c: Court): string | null {
  if (c.hourly_price == null) return null
  return `${c.hourly_price.toFixed(2).replace('.', ',')} € / Std.`
}

function CardsView({ courts, dayData, bookHref }: { courts: Court[]; dayData?: Record<string, SlotInfo[]>; bookHref: (c: string, t: string) => string }) {
  return (
    <div className="hm-court-cards">
      {courts.map((c) => {
        const slots = dayData?.[c.id]
        const free = slots ? slots.filter((s) => s.available).length : null
        return (
          <div key={c.id} className="hm-court-card">
            <div className="hm-court-header">
              <div className="hm-court-title-wrap">
                <span className="hm-court-icon">
                  <i className={c.environment === 'Außenplatz' ? 'ri-sun-line' : 'ri-building-line'} />
                </span>
                <div>
                  <h3 className="hm-court-name">{c.name}</h3>
                  <div className="hm-court-badges">
                    <span className="hm-court-pill">{envLabel(c)}</span>
                    <span className="hm-court-pill">{c.surface ? c.surface.charAt(0).toUpperCase() + c.surface.slice(1) : 'Hartplatz'}</span>
                    {priceLabel(c) && <span className="hm-court-pill hm-pill-price">{priceLabel(c)}</span>}
                  </div>
                </div>
              </div>
              <div className="hm-court-stats">
                {free === null ? (
                  <span className="hm-court-avail is-busy">
                    <i className="ri-loader-4-line hm-spin" /> Lade Zeiten …
                  </span>
                ) : free > 0 ? (
                  <span className="hm-court-avail is-free">
                    <i className="ri-checkbox-circle-fill" /> {free} von {slots?.length ?? 0} Slots frei
                  </span>
                ) : (
                  <span className="hm-court-avail is-busy">
                    <i className="ri-close-circle-fill" /> Heute belegt
                  </span>
                )}
              </div>
            </div>
            <div className="hm-court-slots-grid">
              {!slots || slots.length === 0 ? (
                <span className="hm-slots-loading">
                  <i className="ri-loader-4-line hm-spin" /> Lade Zeiten …
                </span>
              ) : (
                slots.map((s) =>
                  s.available ? (
                    <Link key={s.time} to={bookHref(c.id, s.time)} className="hm-slot is-free" title={`${s.time} – ${toHHMM(toMin(s.time) + SLOT_MIN)} Uhr frei auf ${c.name} — Klicken zum Buchen`}>
                      <span className="hm-slot-time">{s.time}</span>
                      <span className="hm-slot-status">Frei</span>
                    </Link>
                  ) : (
                    <span key={s.time} className="hm-slot is-busy">
                      <span className="hm-slot-time">{s.time}</span>
                      <span className="hm-slot-status">Belegt</span>
                    </span>
                  ),
                )
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function MatrixView({ courts, dayData, bookHref }: { courts: Court[]; dayData?: Record<string, SlotInfo[]>; bookHref: (c: string, t: string) => string }) {
  const allTimes = useMemo(() => {
    const set = new Set<string>()
    for (const c of courts) {
      for (const s of dayData?.[c.id] ?? []) set.add(s.time)
    }
    return Array.from(set).sort()
  }, [courts, dayData])

  if (allTimes.length === 0) {
    return <div className="hm-empty">Keine Zeiten für diesen Tag verfügbar.</div>
  }

  return (
    <div className="hm-matrix-wrap">
      <table className="hm-matrix-table">
        <thead>
          <tr>
            <th className="hm-matrix-th hm-col-time">Uhrzeit</th>
            {courts.map((c) => (
              <th key={c.id} className="hm-matrix-th">
                <div className="hm-th-court-name">{c.name}</div>
                <div className="hm-th-court-meta">
                  {c.environment === 'Außenplatz' ? 'Außen' : 'Halle'} · {c.surface ?? 'Hartplatz'}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {allTimes.map((t) => (
            <tr key={t}>
              <td className="hm-matrix-td hm-td-time">
                {t} <span className="hm-td-end">– {toHHMM(toMin(t) + SLOT_MIN)}</span>
              </td>
              {courts.map((c) => {
                const slot = (dayData?.[c.id] ?? []).find((s) => s.time === t)
                if (!slot) {
                  return (
                    <td key={c.id} className="hm-matrix-td">
                      <span className="hm-m-cell is-closed">—</span>
                    </td>
                  )
                }
                if (slot.available) {
                  return (
                    <td key={c.id} className="hm-matrix-td">
                      <Link to={bookHref(c.id, t)} className="hm-m-cell is-free" title={`${t}–${toHHMM(toMin(t) + SLOT_MIN)} frei auf ${c.name} — Jetzt buchen`}>
                        <i className="ri-check-line" /> Frei
                      </Link>
                    </td>
                  )
                }
                return (
                  <td key={c.id} className="hm-matrix-td">
                    <span className="hm-m-cell is-busy">
                      <i className="ri-close-line" /> Belegt
                    </span>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
