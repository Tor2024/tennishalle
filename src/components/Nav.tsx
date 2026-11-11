import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export function Nav() {
  const [solid, setSolid] = useState(false)
  const [open, setOpen] = useState(false)
  const [authed, setAuthed] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAuthed(!!data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setAuthed(!!s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => setOpen(false), [location])

  const signOut = async () => {
    await supabase.auth.signOut()
    navigate('/')
  }

  const links = [{ to: '/courts', label: 'Plätze' }]

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
        solid || open ? 'bg-background-50/85 backdrop-blur-md border-b border-foreground-950/10' : 'border-b border-transparent'
      }`}
    >
      <div className="ro-container flex h-16 items-center justify-between gap-4">
        <Link to="/" className="hero-serif th-tracking text-[22px] md:text-[26px] text-foreground-950" aria-label="TENNISHALLE Startseite">
          TENNISHALLE
        </Link>

        <nav className="hidden md:flex items-center gap-6">
          {links.map((l) => (
            <Link key={l.to} to={l.to} className="ro-eyebrow text-foreground-700 hover:text-foreground-950 transition-colors">
              {l.label}
            </Link>
          ))}
          {authed ? (
            <>
              <Link to="/account" className="ro-eyebrow text-foreground-700 hover:text-foreground-950 transition-colors">
                Mein Konto
              </Link>
              <button type="button" onClick={signOut} className="ro-eyebrow text-foreground-700 hover:text-foreground-950 transition-colors cursor-pointer">
                Abmelden
              </button>
            </>
          ) : (
            <Link to="/sign-in" className="ro-eyebrow text-foreground-700 hover:text-foreground-950 transition-colors">
              Anmelden
            </Link>
          )}
          <Link
            to="/book"
            className="inline-flex items-center gap-2 rounded-full bg-primary-500 px-5 py-2.5 text-sm font-bold text-background-950 whitespace-nowrap"
          >
            Platz buchen
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-background-950 text-primary-500">
              <i className="ri-arrow-right-up-line text-xs" />
            </span>
          </Link>
        </nav>

        <button type="button" className="md:hidden text-foreground-950 text-2xl cursor-pointer" onClick={() => setOpen(!open)} aria-label="Menü">
          <i className={open ? 'ri-close-line' : 'ri-menu-line'} />
        </button>
      </div>

      {open && (
        <div className="md:hidden bg-background-50/95 backdrop-blur-md border-b border-foreground-950/10 px-4 pb-4 flex flex-col gap-3">
          {links.map((l) => (
            <Link key={l.to} to={l.to} className="ro-eyebrow text-foreground-800 py-1">
              {l.label}
            </Link>
          ))}
          {authed ? (
            <>
              <Link to="/account" className="ro-eyebrow text-foreground-800 py-1">
                Mein Konto
              </Link>
              <button type="button" onClick={signOut} className="ro-eyebrow text-foreground-800 py-1 text-left cursor-pointer">
                Abmelden
              </button>
            </>
          ) : (
            <Link to="/sign-in" className="ro-eyebrow text-foreground-800 py-1">
              Anmelden
            </Link>
          )}
          <Link to="/book" className="inline-flex items-center justify-center gap-2 rounded-full bg-primary-500 px-5 py-2.5 text-sm font-bold text-background-950">
            Platz buchen
          </Link>
        </div>
      )}
    </header>
  )
}
