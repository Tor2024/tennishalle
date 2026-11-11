import { Link } from 'react-router-dom'

export function CtaBand() {
  return (
    <section className="bg-[oklch(13%_0.012_160)] relative overflow-hidden">
      <div className="ro-container py-14 md:py-16 relative">
        <div className="max-w-[720px]">
          <p className="ro-body !text-[17px] md:!text-[19px] font-bold text-foreground-950 leading-snug">
            Live-Verfügbarkeit in 30-Minuten-Schritten. Platz, Datum und Dauer
            wählen — die Buchungsreferenz kommt sofort.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              to="/book"
              className="group inline-flex h-12 items-center gap-3 rounded-full bg-primary-500 pl-5 pr-[5px] text-[15px] font-medium text-background-950"
            >
              Platz buchen
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-background-950 text-primary-500 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5">
                <i className="ri-arrow-right-up-line text-base" />
              </span>
            </Link>
            <Link
              to="/account"
              className="group inline-flex h-12 items-center gap-3 rounded-full border border-foreground-950/20 bg-foreground-950/[0.05] pl-5 pr-[5px] text-[15px] font-medium text-foreground-950 hover:border-primary-500/60"
            >
              Meine Buchungen
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-500 text-background-950 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5">
                <i className="ri-arrow-right-up-line text-base" />
              </span>
            </Link>
          </div>
        </div>
        <img
          src="/assets/img/gen-03-one-complete-tennis-racket-shown-entirel.webp"
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute right-4 bottom-0 h-[92%] w-auto object-contain opacity-90 hidden md:block"
          loading="lazy"
          decoding="async"
        />
      </div>
      <p className="relative z-10 pb-3 pr-5 md:pr-12 text-right text-[12px] text-foreground-500">
        Bezahlung direkt im Verein, nicht online.
      </p>
    </section>
  )
}
