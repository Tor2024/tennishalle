import { Link } from 'react-router-dom'

export function Footer() {
  return (
    <footer className="bg-background-100 border-t border-foreground-950/10">
      <div className="ro-container py-14 grid grid-cols-1 md:grid-cols-12 gap-10 text-foreground-700">
        <div className="md:col-span-5">
          <p className="ro-body">Musterstrasse 1, 12345 Musterstadt</p>
          <p className="ro-body mt-1.5">02733 000000</p>
          <p className="ro-body mt-1.5">info@tennishalle.de</p>
        </div>
        <div className="md:col-span-4">
          <div className="flex flex-col gap-2">
            <Link to="/book" className="ro-body hover:text-foreground-950 transition-colors w-fit">
              Platz buchen
            </Link>
            <Link to="/courts" className="ro-body hover:text-foreground-950 transition-colors w-fit">
              Plätze
            </Link>
            <Link to="/account" className="ro-body hover:text-foreground-950 transition-colors w-fit">
              Meine Buchungen
            </Link>
          </div>
        </div>
        <div className="md:col-span-3">
          <div className="flex flex-col gap-2">
            <Link to="/" className="ro-body hover:text-foreground-950 transition-colors w-fit">
              Start
            </Link>
            <Link to="/sign-in" className="ro-body hover:text-foreground-950 transition-colors w-fit">
              Anmelden
            </Link>
          </div>
        </div>
      </div>

      <div className="text-foreground-200">
        <p className="footer-wordmark font-wordmark text-background-200 select-none text-center" aria-hidden="true">
          TENNISHALLE
        </p>
      </div>

      <div className="ro-container py-6 flex flex-col md:flex-row items-center justify-between gap-2 text-[13px] text-foreground-500">
        <span>© 2026 TENNISHALLE</span>
        <span>Tennis Hallen</span>
      </div>
    </footer>
  )
}
