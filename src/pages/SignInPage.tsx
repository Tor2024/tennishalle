import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Nav } from '../components/Nav'
import { apiAuth, type AppUser } from '../lib/api'

// structure 1:1 from prod bundle (uf component in site.js)
const INPUT_CLS =
  'mt-2 w-full box-border bg-foreground-950/[0.04] border border-foreground-950/15 rounded-md px-4 py-3 text-[15px] text-foreground-950 placeholder:text-foreground-500 transition-colors focus:outline-none focus:bg-foreground-950/[0.06] focus:border-primary-500 focus:ring-4 focus:ring-primary-500/15'

export default function SignInPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const googlePending = params.get('google_pending')
  const googleError = params.get('google_error')
  const verified = params.get('verified')
  const verifyError = params.get('verify_error')
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null)
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // already signed in → redirect (admin/owner → /admin)
  useEffect(() => {
    apiAuth<{ ok: boolean; user?: AppUser }>('me').then((r) => {
      if (r?.ok && r.user) {
        navigate(r.user.role === 'admin' || r.user.role === 'owner' ? '/admin' : '/account')
      }
    })
  }, [navigate])

  const goGoogle = async () => {
    setError(null)
    setBusy(true)
    try {
      const r = await apiAuth<{ ok: boolean; url?: string; message?: string }>('google_url', { redirect: '/account' })
      if (!r.ok || !r.url) throw new Error(r.message ?? 'Google-Anmeldung nicht verfügbar.')
      window.location.href = r.url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google-Anmeldung fehlgeschlagen.')
      setBusy(false)
    }
  }

  // Google-вход: пользователь уже аутентифицирован Google, но у нас нет его телефона
  const completeGoogle = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const r = await apiAuth<{ ok: boolean; error?: string; message?: string }>('google_complete', {
        pending: googlePending,
        phone,
      })
      if (!r.ok) throw new Error(r.error ?? r.message ?? 'Telefonnummer konnte nicht gespeichert werden.')
      navigate('/account')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Anmeldung fehlgeschlagen.')
      setBusy(false)
    }
  }

  const resendVerification = async () => {
    if (!unverifiedEmail || busy) return
    setBusy(true)
    setError(null)
    try {
      const r = await apiAuth<{ ok: boolean; message?: string; error?: string }>('resend_verification', {
        email: unverifiedEmail,
      })
      if (!r.ok) throw new Error(r.error ?? r.message ?? 'E-Mail konnte nicht gesendet werden.')
      setSuccess(r.message ?? 'Bestätigungs-E-Mail gesendet. Bitte prüfe dein Postfach.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'E-Mail konnte nicht gesendet werden.')
    } finally {
      setBusy(false)
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    setSuccess(null)
    try {
      if (mode === 'up') {
        const r = await apiAuth<{ ok: boolean; user?: AppUser; error?: string; message?: string }>('signup', {
          email,
          password,
          full_name: fullName,
          phone,
        })
        if (!r.ok) throw new Error(r.error ?? r.message ?? 'Registrierung fehlgeschlagen.')
        if (!r.user) {
          setSuccess('Konto erfolgreich erstellt! Du kannst dich jetzt anmelden.')
          setMode('in')
        } else {
          navigate('/account')
        }
      } else {
        const r = await apiAuth<{ ok: boolean; user?: AppUser; error?: string; message?: string; code?: string }>('signin', {
          email,
          password,
        })
        if (!r.ok) {
          if (r.code === 'unverified') {
            setUnverifiedEmail(email)
            throw new Error(r.error ?? r.message ?? 'Bitte bestätige zuerst deine E-Mail-Adresse.')
          }
          throw new Error(r.error ?? r.message ?? 'Anmeldung fehlgeschlagen.')
        }
        navigate(r.user && (r.user.role === 'admin' || r.user.role === 'owner') ? '/admin' : '/account')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Anmeldung fehlgeschlagen.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="ro min-h-screen bg-background-50 text-foreground-950 flex flex-col">
      <Nav />
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] pt-16 md:pt-20">
        {/* left visual panel */}
        <div className="hidden lg:block relative overflow-hidden">
          <img
            src="/assets/img/gen-04-overhead-aerial-view-of-three-dark-green.webp"
            alt=""
            aria-hidden="true"
            className="ro-img-court absolute inset-0 w-full h-full object-cover object-top"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-background-50/10 to-background-50" />
          <div className="absolute inset-0 bg-gradient-to-t from-background-50/80 via-transparent to-transparent" />
          <div className="absolute bottom-10 left-10 max-w-sm">
            <p className="ro-eyebrow text-primary-500">Tennis Hallen</p>
            <p className="mt-3 ro-body text-foreground-800">
              Eine Anmeldung für Mitglieder und Vereinstruppe. Dein Kundenkonto öffnet den passenden Bereich.
            </p>
          </div>
        </div>

        {/* right form panel */}
        <div className="flex items-center justify-center px-4 md:px-10 py-14 md:py-20">
          <div className="w-full max-w-md">
            <Link to="/" className="text-[13px] text-foreground-600 hover:text-primary-500 transition-colors">
              ← Zurück zu den Plätzen
            </Link>
            <p className="mt-8 ro-eyebrow text-primary-500">Mitglieder &amp; Team</p>
            <h1 className="ro-h1 text-primary-500">
              <span className="ro-grad-text">Willkommen</span>
              <span className="font-script inline-block align-baseline mx-1 md:mx-2 -translate-y-[0.12em] ro-grad-lime text-[56px] md:text-[100px] leading-[1.1]">
                zurück
              </span>
            </h1>
            <p className="mt-3 ro-body text-foreground-700">
              Mitglieder verwalten ihre Buchungen online. Besitzer gelangen direkt zum Vereins-Dashboard.
            </p>

            <form
              onSubmit={googlePending ? completeGoogle : submit}
              data-no-motion
              className="ro-card mt-8 rounded-2xl p-6 md:p-8 border border-foreground-950/10"
            >
              {googlePending ? (
                <>
                  <p className="ro-eyebrow text-primary-500">Fast fertig</p>
                  <p className="mt-3 ro-body text-foreground-700">
                    Dein Google-Konto ist bestätigt. Für Buchungsbestätigungen benötigen wir noch deine Telefonnummer.
                  </p>
                  <label className="block mt-6">
                    <span className="ro-eyebrow text-foreground-600">Telefon</span>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+49 123 4567890"
                      autoComplete="tel"
                      required
                      className={INPUT_CLS}
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={busy}
                    className="group mt-8 box-border inline-flex w-full h-12 items-center justify-between gap-3 rounded-full border border-primary-500 bg-primary-500 hover:bg-primary-400 hover:border-primary-400 pl-5 pr-[5px] text-[15px] font-medium text-background-50 cursor-pointer transition-colors duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background-50 disabled:opacity-60"
                  >
                    {busy ? 'Bitte warten…' : 'Speichern & weiter'}
                    <span className="w-9 h-9 shrink-0 flex items-center justify-center rounded-full bg-background-50 text-primary-500">
                      <i className={`text-base leading-none ${busy ? 'ri-loader-4-line animate-spin' : 'ri-arrow-right-up-line'}`} />
                    </span>
                  </button>
                </>
              ) : (
                <>
                  {/* tab toggle */}
                  <div
                    role="tablist"
                    className="relative grid grid-cols-2 w-full max-w-[320px] border border-foreground-950/15 rounded-full px-1 py-1"
                  >
                    <span
                      aria-hidden="true"
                      className="absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] rounded-full bg-primary-500 -z-10 transition-transform duration-300 ease-[cubic-bezier(0.2,0.7,0.2,1)]"
                      style={{ transform: mode === 'in' ? 'translateX(0)' : 'translateX(100%)' }}
                    />
                    <button
                      type="button"
                      role="tab"
                      aria-selected={mode === 'in'}
                      onClick={() => setMode('in')}
                      className={`h-9 rounded-full text-[13px] font-semibold cursor-pointer transition-colors ${
                        mode === 'in' ? 'text-background-50' : 'text-foreground-700'
                      }`}
                    >
                      Anmelden
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={mode === 'up'}
                      onClick={() => setMode('up')}
                      className={`h-9 rounded-full text-[13px] font-semibold cursor-pointer transition-colors ${
                        mode === 'up' ? 'text-background-50' : 'text-foreground-700'
                      }`}
                    >
                      Konto erstellen
                    </button>
                  </div>

                  {googleError && (
                    <p className="mt-5 flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/40 text-[13px] text-red-300">
                      <i className="ri-error-warning-line mt-0.5" />
                      Google-Anmeldung fehlgeschlagen. Bitte versuche es erneut oder melde dich per E-Mail an.
                    </p>
                  )}

                  {verified && (
                    <p className="mt-5 flex items-start gap-2 p-3 rounded-lg bg-primary-500/15 border border-primary-500/40 text-[13px] text-primary-400">
                      <i className="ri-checkbox-circle-line mt-0.5" />
                      E-Mail bestätigt! Du kannst dich jetzt anmelden.
                    </p>
                  )}
                  {verifyError && (
                    <p className="mt-5 flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/40 text-[13px] text-red-300">
                      <i className="ri-error-warning-line mt-0.5" />
                      Link ungültig oder abgelaufen. Bitte fordere eine neue Bestätigungs-E-Mail an.
                    </p>
                  )}

                  {error && (
                    <p className="mt-5 flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/40 text-[13px] text-red-300">
                      <i className="ri-error-warning-line mt-0.5" />
                      {error}
                    </p>
                  )}
                  {unverifiedEmail && (
                    <button
                      type="button"
                      onClick={resendVerification}
                      disabled={busy}
                      className="mt-3 text-[13px] font-semibold text-primary-500 hover:text-primary-400 underline underline-offset-4 cursor-pointer disabled:opacity-60"
                    >
                      Bestätigungs-E-Mail erneut senden
                    </button>
                  )}
                  {success && (
                    <p className="mt-5 flex items-start gap-2 p-3 rounded-lg bg-primary-500/15 border border-primary-500/40 text-[13px] text-primary-400">
                      <i className="ri-checkbox-circle-line mt-0.5" />
                      {success}
                    </p>
                  )}

                  {mode === 'up' && (
                    <label className="block mt-6">
                      <span className="ro-eyebrow text-foreground-600">Vollständiger Name</span>
                      <input
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Vor- und Nachname"
                        autoComplete="name"
                        required
                        className={INPUT_CLS}
                      />
                    </label>
                  )}
                  <label className="block mt-6">
                    <span className="ro-eyebrow text-foreground-600">E-Mail</span>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@email.com"
                      autoComplete="username"
                      required
                      className={INPUT_CLS}
                    />
                  </label>
                  {mode === 'up' && (
                    <label className="block mt-6">
                      <span className="ro-eyebrow text-foreground-600">Telefon</span>
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+49 123 4567890"
                        autoComplete="tel"
                        required
                        className={INPUT_CLS}
                      />
                      <span className="mt-1.5 block text-[12px] text-foreground-500">Für Buchungsbestätigungen.</span>
                    </label>
                  )}
                  <label className="block mt-6">
                    <span className="ro-eyebrow text-foreground-600">Passwort</span>
                    <div className="relative">
                      <input
                        type={showPw ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={mode === 'up' ? 'Mindestens 6 Zeichen' : 'Passwort'}
                        minLength={mode === 'up' ? 6 : undefined}
                        autoComplete={mode === 'up' ? 'new-password' : 'current-password'}
                        required
                        className={INPUT_CLS + ' pr-12'}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPw(!showPw)}
                        aria-label={showPw ? 'Passwort verbergen' : 'Passwort anzeigen'}
                        className="absolute right-3 top-1/2 -translate-y-1/2 mt-1 text-foreground-500 hover:text-foreground-950 cursor-pointer"
                      >
                        <i className={`text-lg ${showPw ? 'ri-eye-off-line' : 'ri-eye-line'}`} />
                      </button>
                    </div>
                  </label>

                  <button
                    type="submit"
                    disabled={busy}
                    className="group mt-8 box-border inline-flex w-full h-12 items-center justify-between gap-3 rounded-full border border-primary-500 bg-primary-500 hover:bg-primary-400 hover:border-primary-400 pl-5 pr-[5px] text-[15px] font-medium text-background-50 cursor-pointer transition-colors duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background-50 disabled:opacity-60"
                  >
                    {busy ? 'Bitte warten…' : mode === 'in' ? 'Jetzt anmelden' : 'Konto erstellen'}
                    <span className="w-9 h-9 shrink-0 flex items-center justify-center rounded-full bg-background-50 text-primary-500">
                      <i className={`text-base leading-none ${busy ? 'ri-loader-4-line animate-spin' : 'ri-arrow-right-up-line'}`} />
                    </span>
                  </button>

                  {/* Google button */}
                  <div className="mt-3 flex items-center gap-4">
                    <span className="h-px flex-1 bg-foreground-950/10" />
                    <span className="text-[11px] tracking-[0.18em] uppercase text-foreground-500">oder</span>
                    <span className="h-px flex-1 bg-foreground-950/10" />
                  </div>
                  <button
                    type="button"
                    onClick={goGoogle}
                    disabled={busy}
                    className="group mt-3 box-border inline-flex w-full h-12 items-center justify-center gap-3 rounded-full border border-foreground-950/20 bg-foreground-950/[0.04] hover:bg-foreground-950/[0.08] hover:border-primary-500/60 px-5 text-[15px] font-medium text-foreground-950 cursor-pointer transition-colors duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background-50 disabled:opacity-60"
                  >
                    <i className="ri-google-fill text-lg text-primary-500" />
                    Mit Google anmelden
                  </button>

                  <div className="mt-6 flex gap-6">
                    <Link to="/book" className="text-[13px] text-foreground-600 hover:text-primary-500 transition-colors">
                      Zur Platzbuchung
                    </Link>
                  </div>
                </>
              )}
            </form>
          </div>
        </div>
      </main>
    </div>
  )
}
