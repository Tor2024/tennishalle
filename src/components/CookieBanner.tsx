import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

const KEY = 'th-cookie-consent'

// functional-cookies-only notice: one local flag, no tracking — matches /legal/cookies
export function CookieBanner() {
  const [visible, setVisible] = useState(false)

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
      className="fixed inset-x-3 bottom-3 md:inset-x-auto md:right-6 md:bottom-6 md:max-w-md z-[70] ro-card p-5 shadow-2xl"
    >
      <p className="ro-eyebrow text-primary-500">Cookies</p>
      <p className="ro-body mt-2 text-sm text-foreground-800">
        Wir verwenden nur funktionale Cookies: für die Anmeldung und deine Einwilligung. Kein Tracking, keine Werbung.{' '}
        <Link to="/legal/cookies" className="hm-textlink !text-[13px]">
          Mehr erfahren
        </Link>
      </p>
      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={() => decide('all')}
          className="h-10 px-5 rounded-full bg-primary-500 text-background-50 text-[13px] font-semibold cursor-pointer hover:bg-primary-400 transition-colors"
        >
          Verstanden
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
