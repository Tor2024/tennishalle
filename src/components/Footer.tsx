import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiData, apiAuth } from '../lib/api'

// structure and classes verbatim from the prod bundle (Ru footer component)
export function Footer() {
  const [settings, setSettings] = useState<{ address?: string; contact_phone?: string; contact_email?: string } | null>(null)
  const [authed, setAuthed] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    apiData<{ ok: boolean; settings?: { address?: string; contact_phone?: string; contact_email?: string } | null }>('bootstrap')
      .then((r) => setSettings(r.settings ?? null))
      .catch(() => {})
    apiAuth<{ ok: boolean }>('me')
      .then((r) => setAuthed(!!r?.ok))
      .catch(() => {})
  }, [])

  const signOut = () => {
    apiAuth('signout', {})
      .catch(() => {})
      .finally(() => {
        setAuthed(false)
        navigate('/sign-in')
      })
  }

  return (
    <footer className="bg-background-100 border-t border-background-300/50 text-foreground-800 overflow-hidden">
      <div className="px-4 md:px-10 pt-14 md:pt-20 grid grid-cols-1 md:grid-cols-12 gap-10">
        <div className="md:col-span-5">
          <p className="eyebrow text-primary-500">Besuch im Verein</p>
          <ul className="mt-5 space-y-2 text-sm text-foreground-700">
            {settings?.address && <li>{settings.address}</li>}
            {settings?.contact_phone && (
              <li>
                <a href={`tel:${settings.contact_phone}`} className="hover:text-foreground-950 cursor-pointer">
                  {settings.contact_phone}
                </a>
              </li>
            )}
            {settings?.contact_email && (
              <li>
                <a href={`mailto:${settings.contact_email}`} className="hover:text-foreground-950 cursor-pointer">
                  {settings.contact_email}
                </a>
              </li>
            )}
          </ul>
        </div>
        <nav className="md:col-span-4 grid grid-cols-2 gap-6 text-sm">
          <div className="flex flex-col">
            <p className="eyebrow text-primary-500 mb-3">Bereiche</p>
            <Link to="/#belegung" className="footer-link">
              Belegungsplan
            </Link>
            <Link to="/#aktuelles" className="footer-link">
              Aktuelles
            </Link>
            <Link to="/#partner" className="footer-link">
              Partner
            </Link>
            <Link to="/#court-list" className="footer-link">
              Plätze
            </Link>
            <Link to="/#kontakt" className="footer-link">
              Kontakt
            </Link>
          </div>
          <div className="flex flex-col">
            <p className="eyebrow text-primary-500 mb-3">Konto</p>
            <Link to="/book" className="footer-link">
              Platz buchen
            </Link>
            <Link to="/account" className="footer-link">
              Mein Konto
            </Link>
            {authed ? (
              <button type="button" onClick={signOut} className="footer-link text-left cursor-pointer">
                Abmelden
              </button>
            ) : (
              <Link to="/sign-in" className="footer-link">
                Anmelden
              </Link>
            )}
          </div>
        </nav>
        <div className="md:col-span-3 md:text-right">
          <p className="text-xs text-foreground-600">
            Alle Preise sind Platzgebühren.
            <br />
            Bezahlung direkt im Verein, nicht online.
          </p>
          <div className="mt-4 flex flex-wrap md:justify-end gap-x-4 gap-y-1 text-xs text-foreground-600">
            <Link to="/legal/agb" className="hover:text-primary-500">AGB</Link>
            <Link to="/legal/impressum" className="hover:text-primary-500">Impressum</Link>
            <Link to="/legal/datenschutz" className="hover:text-primary-500">Datenschutz</Link>
            <Link to="/legal/cookies" className="hover:text-primary-500">Cookies</Link>
          </div>
        </div>
      </div>
      {/* secret admin entrance — invisible link over the wordmark */}
      <div className="relative">
        <p aria-hidden="true" className="mt-10 md:mt-14 px-2 font-wordmark footer-wordmark text-background-200 select-none text-center">
          TENNISHALLE
        </p>
        <Link to="/admin" aria-label="Admin" className="absolute inset-x-0 -top-4 bottom-0 opacity-0" />
      </div>
      <div className="px-4 md:px-10 py-5 border-t border-background-300/50 flex flex-col sm:flex-row justify-between gap-2 text-xs text-foreground-600">
        <span>© 2026 TENNISHALLE</span>
        <span>Tennis Hallen</span>
      </div>
    </footer>
  )
}
