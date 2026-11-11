import { Link } from 'react-router-dom'

export function CtaBand() {
  return (
    <section className="ro-band-cta">
      <div className="ro-container py-16 md:py-20 flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
        <div>
          <p className="ro-eyebrow text-foreground-600 mb-3">Reservieren</p>
          <h2 className="ro-h2 text-foreground-950">
            Finde deinen Platz{' '}
            <span className="font-script text-primary-500">heute Abend</span>
          </h2>
        </div>
        <Link
          to="/book"
          className="inline-flex items-center gap-2 rounded-full bg-foreground-950 px-6 py-3 text-sm font-bold text-background-50"
        >
          Platz buchen
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-500 text-background-950">
            <i className="ri-arrow-right-up-line text-xs" />
          </span>
        </Link>
      </div>
    </section>
  )
}
