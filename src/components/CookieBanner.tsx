import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

const KEY = 'th-cookie-consent'

// functional-cookies-only notice: one local flag, no tracking — matches /legal/cookies
// glass card, TTDSG-style: equally prominent accept / reject, details section
export function CookieBanner() {
  const [visible, setVisible] = useState(false)
  const [details, setDetails] = useState(false)

  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) setVisible(true)
    } catch {
      /* storage unavailable — don't nag */
    }
  }, [])

  if (!visible) return null

  const decide = (v: string) => {
    try {
      localStorage.setItem(KEY, v)
    } catch {
      /* ignore */
    }
    setVisible(false)
  }

  return (
    <div
      role="dialog"
      aria-label="Cookie-Hinweis"
      className="fixed inset-x-3 bottom-3 md:inset-x-auto md:right-6 md:bottom-6 md:max-w-md z-[70] rounded-2xl border border-white/10 bg-background-50/70 backdrop-blur-xl shadow-2xl p-5 text-foreground-950"
    >
      <p className="ro-eyebrow text-primary-500">Cookies</p>
      <p className="mt-2 text-sm text-foreground-700">
        Wir verwenden nur funktionale Cookies: für die Anmeldung und deine Einwilligung. Kein Tracking, keine Werbung, keine
        Weitergabe an Dritte.
      </p>
      <button
        onClick={() => setDetails((d) => !d)}
        className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-primary-500 cursor-pointer hover:text-primary-400 transition-colors"
      >
        <i className={`ri-${details ? 'subtract' : 'add'}-line`} /> Details
      </button>
      {details && (
        <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.06] p-4 text-[13px] text-foreground-700 space-y-2.5">
          <p className="flex items-start gap-2">
            <i className="ri-shield-check-line text-primary-500 mt-0.5" />
            <span><strong className="text-foreground-950">Notwendig (immer aktiv):</strong> Sitzung (Anmeldung, Admin-Bereich) und dieser Einwilligungshinweis. Ohne sie funktioniert die Seite nicht.</span>
          </p>
          <p className="flex items-start gap-2">
            <i className="ri-close-circle-line text-foreground-500 mt-0.5" />
            <span><strong className="text-foreground-950">Statistik &amp; Marketing:</strong> nicht im Einsatz — es existiert kein entsprechender Code auf dieser Seite.</span>
          </p>
          <p className="flex items-start gap-2">
            <i className="ri-article-line text-foreground-500 mt-0.5" />
            <span>
              Einzelheiten:{' '}
              <Link to="/legal/cookies" className="text-primary-500 hover:text-primary-400 underline underline-offset-2">
                Cookie-Richtlinie
              </Link>{' '}
              ·{' '}
              <Link to="/legal/datenschutz" className="text-primary-500 hover:text-primary-400 underline underline-offset-2">
                Datenschutzerklärung
              </Link>
            </span>
          </p>
        </div>
      )}
      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={() => decide('all')}
          className="h-10 px-5 rounded-full bg-primary-500 text-background-50 text-[13px] font-semibold cursor-pointer hover:bg-primary-400 transition-colors"
        >
          Alle akzeptieren
        </button>
        <button
          onClick={() => decide('functional')}
          className="h-10 px-5 rounded-full border border-foreground-950/15 text-[13px] font-medium text-foreground-800 cursor-pointer hover:border-primary-500/60 transition-colors"
        >
          Nur notwendige
        </button>
      </div>
    </div>
  )
}
