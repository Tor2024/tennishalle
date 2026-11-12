import { Link } from 'react-router-dom'
import { Reveal } from './Reveal'

// structure and classes verbatim from the prod bundle (ud / cd / Bu components)
export function CtaBand() {
  return (
    <section
      className="relative overflow-hidden bg-black pt-24 md:pt-[140px] pb-24 md:pb-[140px]"
      aria-labelledby="cta-title"
    >
      <div className="absolute right-2 md:right-[6%] top-1/2 -translate-y-1/2 w-[200px] h-[320px] md:w-[380px] md:h-[560px] pointer-events-none select-none opacity-50 md:opacity-100">
        <img
          loading="lazy"
          decoding="async"
          src="/assets/img/gen-03-one-complete-tennis-racket-shown-entirel.webp"
          alt=""
          aria-hidden="true"
          className="w-full h-full object-contain object-center mix-blend-lighten"
        />
      </div>
      <div className="ro-container relative">
        <Reveal>
          <div id="cta-title">
            <h2 className="ro-h2 text-primary-500">
              <span className="ro-grad-text">Finde</span>
              <span className="font-script inline-block align-baseline mx-1 md:mx-2 -translate-y-[0.12em] ro-grad-lime text-[52px] md:text-[80px] leading-[1.1]">
                deinen Platz
              </span>
              <span className="ro-grad-text">heute Abend</span>
            </h2>
          </div>
          <p className="mt-4 ro-body text-foreground-900 max-w-[640px]">
            Live-Verfügbarkeit in 30-Minuten-Schritten. Platz, Datum und Dauer wählen — die
            Buchungsreferenz kommt sofort.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/book"
              className="group box-border inline-flex h-12 items-center gap-3 rounded-full border pl-5 pr-[5px] whitespace-nowrap cursor-pointer transition-colors duration-300 text-[15px] leading-none font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background-50 justify-center bg-primary-500 border-primary-500 hover:bg-primary-400 hover:border-primary-400 text-background-50"
            >
              Platz buchen
              <span className="w-9 h-9 shrink-0 flex items-center justify-center rounded-full transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 bg-background-50 text-primary-500">
                <i className="ri-arrow-right-up-line text-base leading-none" />
              </span>
            </Link>
            <Link
              to="/account"
              className="group box-border inline-flex h-12 items-center gap-3 rounded-full border pl-5 pr-[5px] whitespace-nowrap cursor-pointer transition-colors duration-300 text-[15px] leading-none font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background-50 justify-center bg-foreground-950/[0.05] border-foreground-950/20 hover:bg-foreground-950/[0.1] hover:border-primary-500/60 text-foreground-950"
            >
              Meine Buchungen
              <span className="w-9 h-9 shrink-0 flex items-center justify-center rounded-full transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 bg-primary-500 text-background-50">
                <i className="ri-arrow-right-up-line text-base leading-none" />
              </span>
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
