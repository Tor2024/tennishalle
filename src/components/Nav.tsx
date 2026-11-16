import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { apiAuth } from '../lib/api'

function NavLink({ to, active, children }: { to: string; active: boolean; children: ReactNode }) {
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

export function Nav() {
  const [solid, setSolid] = useState(false)
  const [open, setOpen] = useState(false)
  const [authed, setAuthed] = useState(false)
  const [userName, setUserName] = useState('')
  const [activeSection, setActiveSection] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    if (!menuOpen) return
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [menuOpen])

  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    apiAuth<{ ok: boolean; user?: { full_name?: string } | null }>('me').then((r) => {
      setAuthed(!!r?.ok)
      setUserName(r?.user?.full_name ?? '')
    })
  }, [location])

  useEffect(() => setOpen(false), [location])

  // scrollspy: underline the nav item of the section currently in view (homepage only)
  useEffect(() => {
    if (location.pathname !== '/') {
      setActiveSection('')
      return
    }
    const ids = ['belegung', 'aktuelles', 'partner', 'court-list', 'kontakt']
    const compute = () => {
      let current = ''
      const line = window.innerHeight * 0.35
      for (const id of ids) {
        const el = document.getElementById(id)
        if (!el) continue
        if (el.getBoundingClientRect().top <= line) current = id
      }
      setActiveSection(current)
    }
    // no throttle: compute is cheap (5 getElementById), and timers get throttled in hidden tabs
    const onScroll = () => compute()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    compute()
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [location.pathname])

  const signOut = async () => {
    await apiAuth('signout')
    setAuthed(false)
    setUserName('')
    navigate('/')
  }

  const links = [
    { to: '/#belegung', label: 'Belegungsplan' },
    { to: '/#aktuelles', label: 'Aktuelles' },
    { to: '/#partner', label: 'Partner' },
    { to: '/#court-list', label: 'Plätze' },
    { to: '/#kontakt', label: 'Kontakt' },
  ]

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
              <NavLink key={l.to} to={l.to} active={location.pathname === '/' && (activeSection === hash || (location.hash === `#${hash}` && activeSection === ''))}>
                {l.label}
              </NavLink>
            )
          })}
          {authed ? (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen(!menuOpen)}
                aria-expanded={menuOpen}
                className="flex items-center gap-2 text-[11px] font-medium tracking-[0.22em] uppercase whitespace-nowrap cursor-pointer transition-colors text-foreground-800 hover:text-primary-500"
              >
                <span className="w-7 h-7 flex items-center justify-center rounded-full bg-primary-500/15 text-primary-500">
                  <i className="ri-user-3-line text-sm leading-none" />
                </span>
                {userName || 'Mein Konto'}
                <i className={`text-base leading-none transition-transform duration-200 ${menuOpen ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'}`} />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-3 min-w-[200px] rounded-xl border border-foreground-950/10 bg-background-50 shadow-xl shadow-foreground-950/10 py-2 z-50">
                  <Link
                    to="/account"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 text-[13px] font-medium text-foreground-800 hover:text-primary-500 hover:bg-foreground-950/[0.04] cursor-pointer transition-colors"
                  >
                    <i className="ri-user-3-line text-base leading-none" />
                    Mein Konto
                  </Link>
                  <button
                    type="button"
                    onClick={() => { setMenuOpen(false); signOut() }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] font-medium text-foreground-800 hover:text-secondary-300 hover:bg-foreground-950/[0.04] cursor-pointer transition-colors"
                  >
                    <i className="ri-logout-box-r-line text-base leading-none" />
                    Abmelden
                  </button>
                </div>
              )}
            </div>
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
              <Link to="/account" className="ro-eyebrow flex items-center gap-2 text-foreground-800 py-1">
                <span className="w-6 h-6 flex items-center justify-center rounded-full bg-primary-500/15 text-primary-500">
                  <i className="ri-user-3-line text-xs leading-none" />
                </span>
                {userName || 'Mein Konto'}
              </Link>
              <button type="button" onClick={signOut} className="ro-eyebrow flex items-center gap-1.5 text-foreground-800 py-1 text-left cursor-pointer">
                <i className="ri-logout-box-r-line text-sm leading-none" />
                Abmelden
              </button>
            </>
          ) : (
            <Link to="/sign-in" className="ro-eyebrow text-foreground-800 py-1">
              Anmelden
            </Link>
          )}
          <Link to="/book" className="inline-flex items-center justify-center gap-2 rounded-full bg-primary-500 px-5 py-2.5 text-sm font-bold text-background-50">
            Platz buchen
          </Link>
        </div>
      )}
    </header>
  )
}
