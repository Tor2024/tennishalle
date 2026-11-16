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

  const links = [
    { to: '/#belegung', label: 'Belegungsplan' },
    { to: '/#aktuelles', label: 'Aktuelles' },
    { to: '/#partner', label: 'Partner' },
    { to: '/#court-list', label: 'Plätze' },
  ]

function NavLink({ to, active, children }: { to: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className={`relative py-2 text-[11px] font-medium tracking-[0.22em] uppercase whitespace-nowrap cursor-pointer transition-colors after:absolute after:left-0 after:right-[0.22em] after:-bottom-0.5 after:h-px after:bg-primary-500 after:transition-transform after:origin-left ${
        active ? 'text-foreground-950 after:scale-x-100' : 'text-foreground-800 hover:text-foreground-950 after:scale-x-0 hover:after:scale-x-100'
      }`}
    >
      {children}
    </Link>
  )
}

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-500 ${
        solid || open ? 'bg-background-50/85 backdrop-blur-md border-b border-foreground-950/10' : 'bg-transparent border-b border-transparent'
      }`}
    >
      <nav className="w-full px-5 md:px-12 h-16 md:h-20 flex items-center justify-between gap-6">
        <Link
          to="/"
          aria-label="TENNISHALLE Start"
          className="hero-serif text-[22px] md:text-[26px] font-medium tracking-[0.32em] text-foreground-950 leading-none cursor-pointer whitespace-nowrap"
        >
          TENNISHALLE
        </Link>

        <div className="hidden md:flex items-center gap-10">
          {links.map((l) => {
            const hash = l.to.split('#')[1] ?? ''
            return (
              <NavLink key={l.to} to={l.to} active={location.pathname === '/' && location.hash === `#${hash}`}>
                {l.label}
              </NavLink>
            )
          })}
          {authed ? (
            <>
              <NavLink to="/account" active={location.pathname === '/account'}>
                Mein Konto
              </NavLink>
              <button
                type="button"
                onClick={signOut}
                className="relative py-2 text-[11px] font-medium tracking-[0.22em] uppercase whitespace-nowrap cursor-pointer transition-colors text-foreground-800 hover:text-foreground-950"
              >
                Abmelden
              </button>
            </>
          ) : (
            <NavLink to="/sign-in" active={false}>
              Anmelden
            </NavLink>
          )}
          <Link
            to="/book"
            className="ml-2 inline-flex items-center h-10 px-6 rounded-full border border-foreground-950/70 hover:border-primary-500 hover:bg-primary-500 hover:text-background-50 text-foreground-950 text-[11px] font-medium tracking-[0.22em] uppercase whitespace-nowrap cursor-pointer transition-colors"
          >
            Platz buchen
          </Link>
        </div>

        <button
          type="button"
          className="md:hidden w-10 h-10 flex items-center justify-center text-foreground-950 cursor-pointer"
          onClick={() => setOpen(!open)}
          aria-label="Menü"
          aria-expanded={open}
        >
          <i className={`text-2xl ${open ? 'ri-close-line' : 'ri-menu-line'}`} />
        </button>
      </nav>

      {open && (
        <div className="md:hidden bg-background-50/95 backdrop-blur-md border-b border-foreground-950/10 px-5 pb-4 flex flex-col gap-3">
          {links.map((l) => (
            <Link key={l.to} to={l.to} className="ro-eyebrow text-foreground-800 py-1">
              {l.label}
            </Link>
          ))}          {authed ? (
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
