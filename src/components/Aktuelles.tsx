import { Link } from 'react-router-dom'
import { Reveal } from './Reveal'

// structure verbatim from prod bundle home.js (#aktuelles template)
export function Aktuelles() {
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
              <article className="ro-card hm-news-card">
                <p className="ro-eyebrow text-primary-500">Verein</p>
                <h3 className="ro-card-title ro-grad-lime mt-2">Winterhallen-Plan ist da</h3>
                <p className="hm-news-text">
                  Ab sofort gelten die Winteröffnungszeiten in der Halle. Alle Zeiten findest du auf der
                  Übersicht der Plätze.
                </p>
                <a href="#court-list" className="hm-textlink">
                  Zu den Plätzen <i className="ri-arrow-right-line" />
                </a>
              </article>
              <article className="ro-card hm-news-card">
                <p className="ro-eyebrow text-primary-500">Training</p>
                <h3 className="ro-card-title ro-grad-lime mt-2">Neue Kursgruppe Kinder</h3>
                <p className="hm-news-text">
                  Ein neuer Kurs für Kinder von 6–9 Jahren startet im Dezember. Anmeldung jetzt möglich.
                </p>
                <a href="#court-list" className="hm-textlink">
                  Mehr erfahren <i className="ri-arrow-right-line" />
                </a>
              </article>
            </div>
            <div className="hm-promo-card">
              <p className="hm-promo-pill">Angebot der Woche</p>
              <p className="hm-promo-title">
                Montags bis freitags vor 12 Uhr: <strong>−20 %</strong> auf jede Hallenbuchung
              </p>
              <p className="hm-promo-sub">Gilt für alle Hallenplätze bei Buchung über das System.</p>
              <Link to="/book" className="hm-btn hm-btn-lime">
                Jetzt Slots sichern <i className="ri-arrow-right-up-line" />
              </Link>
            </div>
          </div>
          <div className="hm-events mt-6">
            <div className="hm-events-head">
              <p className="ro-eyebrow text-primary-500">Terminkalender</p>
              <h3 className="hm-events-title">Nächste Termine</h3>
            </div>
            <div className="hm-events-list">
              {[
                { day: '22', mon: 'Nov', title: 'Game: Müller vs. Schmidt', meta: 'Freundschaftsspiel · Halle, Platz 1 · 18:00' },
                { day: '29', mon: 'Nov', title: 'Vereinsmeisterschaft — Vorrunde', meta: 'Turnier · Halle, Platz 1 & 2 · ab 10:00' },
                { day: '06', mon: 'Dez', title: 'Game: Jugend U12 vs. U14', meta: 'Trainingsspiel · Halle, Platz 2 · 15:00' },
                { day: '13', mon: 'Dez', title: 'Winterfeier des Vereins', meta: 'Vereinsleben · Clubheim · 19:00' },
              ].map((e) => (
                <div key={e.day + e.title} className="hm-event-item">
                  <div className="hm-event-date">
                    <b className="hm-event-day">{e.day}</b>
                    <span className="hm-event-mon">{e.mon}</span>
                  </div>
                  <div className="hm-event-body">
                    <p className="hm-event-title">{e.title}</p>
                    <p className="hm-event-meta">{e.meta}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="hm-events-note">
              Spiele und Turniere werden von der Verwaltung geplant und erscheinen automatisch im Spielplan.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
