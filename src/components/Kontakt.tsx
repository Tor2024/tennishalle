import { useEffect, useState, type FormEvent } from 'react'
import { apiData } from '../lib/api'

interface Settings {
  address?: string
  contact_phone?: string
  contact_email?: string
  hall_name?: string
}

type Status = 'idle' | 'sending' | 'ok' | 'error'

// Контакты: реквизиты из club_settings + карта Google (embed, без ключа) + форма обратной связи
export function Kontakt() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '' })
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [status, setStatus] = useState<Status>('idle')
  const [serverMsg, setServerMsg] = useState('')

  useEffect(() => {
    apiData<{ ok: boolean; settings?: Settings | null }>('bootstrap')
      .then((r) => setSettings(r.settings ?? null))
      .catch(() => {})
  }, [])

  // honeypot против спама (как в booking-api)
  const [honey, setHoney] = useState('')

  const errors = {
    name: form.name.trim().length < 2 ? 'Bitte gib deinen Namen an.' : '',
    email: !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim()) ? 'Bitte gib eine gültige E-Mail-Adresse an.' : '',
    phone: form.phone.trim() !== '' && !/^[+\d][\d\s\-()]{5,19}$/.test(form.phone.trim()) ? 'Bitte gib eine gültige Telefonnummer an.' : '',
    message: form.message.trim().length < 10 ? 'Bitte schreibe mindestens 10 Zeichen.' : '',
  }
  const hasErrors = Object.values(errors).some(Boolean)

  const show = (k: keyof typeof errors) => (touched[k] ? errors[k] : '')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setTouched({ name: true, email: true, phone: true, message: true })
    if (hasErrors) return
    setStatus('sending')
    try {
      const r = await apiData<{ ok: boolean; message?: string }>('contact', {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || null,
        message: form.message.trim(),
        website_alt: honey,
      })
      if (r.ok) {
        setStatus('ok')
        setServerMsg('Nachricht gesendet. Wir melden uns bald.')
        setForm({ name: '', email: '', phone: '', message: '' })
        setTouched({})
      } else {
        setStatus('error')
        setServerMsg(r.message ?? 'Senden fehlgeschlagen. Bitte erneut versuchen.')
      }
    } catch {
      setStatus('error')
      setServerMsg('Netzwerkfehler. Bitte erneut versuchen.')
    }
  }

  const mapQuery = encodeURIComponent(settings?.address ?? 'Musterstrasse 1, 12345 Musterstadt')

  const inputCls =
    'mt-2 w-full box-border bg-foreground-950/[0.04] border border-foreground-950/15 rounded-md px-4 py-3 text-[15px] text-foreground-950 placeholder:text-foreground-500 transition-colors focus:outline-none focus:bg-foreground-950/[0.06] focus:border-primary-500 focus:ring-4 focus:ring-primary-500/15'
  const hintCls = 'mt-1.5 text-xs text-foreground-600'
  const errCls = 'mt-1.5 text-xs text-secondary-300'

  return (
    <section id="kontakt" className="hm-section scroll-mt-20" aria-labelledby="kontakt-title">
      <div className="ro-container">
        <div className="hm-section-head">
          <div>
            <p className="ro-eyebrow text-primary-500 mb-2">Wir sind für dich da</p>
            <h2 id="kontakt-title" className="hm-h2">
              Kontakt <span className="hm-script">&amp; Anfahrt</span>
            </h2>
            <p className="mt-2 ro-body text-foreground-700 max-w-2xl">
              Fragen zur Buchung, zum Verein oder zur Halle? Schreib uns — oder schau direkt vorbei. Die Karte zeigt dir, wo du uns findest.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
          {/* левая колонка: реквизиты + карта */}
          <div className="flex flex-col gap-6">
            <div className="ro-card p-6 md:p-8">
              <p className="ro-eyebrow text-primary-500">Besuch im Verein</p>
              <ul className="mt-5 space-y-3 text-sm text-foreground-700">
                {settings?.address && (
                  <li className="flex items-start gap-3">
                    <i className="ri-map-pin-line text-primary-500 text-lg leading-none mt-0.5" aria-hidden="true" />
                    <span>{settings.address}</span>
                  </li>
                )}
                {settings?.contact_phone && (
                  <li className="flex items-start gap-3">
                    <i className="ri-phone-line text-primary-500 text-lg leading-none mt-0.5" aria-hidden="true" />
                    <a href={`tel:${settings.contact_phone}`} className="hover:text-foreground-950 cursor-pointer">
                      {settings.contact_phone}
                    </a>
                  </li>
                )}
                {settings?.contact_email && (
                  <li>
                    <span className="flex items-start gap-3">
                      <i className="ri-mail-line text-primary-500 text-lg leading-none mt-0.5" aria-hidden="true" />
                      <a href={`mailto:${settings.contact_email}`} className="hover:text-foreground-950 cursor-pointer">
                        {settings.contact_email}
                      </a>
                    </span>
                  </li>
                )}
              </ul>
            </div>
            <div className="ro-card p-2 overflow-hidden">
              <iframe
                title={`Karte: ${settings?.hall_name ?? 'TENNISHALLE'}`}
                src={`https://www.google.com/maps?q=${mapQuery}&output=embed`}
                className="w-full h-[280px] md:h-[320px] rounded-xl border-0"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          </div>

          {/* правая колонка: форма */}
          <form className="ro-card p-6 md:p-8" onSubmit={submit} noValidate>
            <p className="ro-eyebrow text-primary-500">Schreib uns</p>
            <p className="mt-3 ro-body text-foreground-700">
              Wir antworten in der Regel innerhalb eines Werktags.
            </p>

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-x-4">
              <label className="block">
                <span className="ro-eyebrow text-foreground-600">Vollständiger Name *</span>
                <input
                  className={inputCls}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                  placeholder="Vor- und Nachname"
                  autoComplete="name"
                />
                {show('name') ? <p className={errCls}>{errors.name}</p> : <p className={hintCls}>Wie du im Verein bekannt bist.</p>}
              </label>
              <label className="block">
                <span className="ro-eyebrow text-foreground-600">E-Mail *</span>
                <input
                  type="email"
                  className={inputCls}
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  onBlur={() => setTouched((t) => ({ ...t, phone: true, email: true }))}
                  placeholder="you@email.com"
                  autoComplete="email"
                />
                {show('email') ? <p className={errCls}>{errors.email}</p> : <p className={hintCls}>Darauf antworten wir dir.</p>}
              </label>
            </div>

            <label className="block mt-5">
              <span className="ro-eyebrow text-foreground-600">Telefon (optional)</span>
              <input
                type="tel"
                className={inputCls}
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                onBlur={() => setTouched((t) => ({ ...t, phone: true }))}
                placeholder="+49 2733 000000"
                autoComplete="tel"
              />
              {show('phone') ? <p className={errCls}>{errors.phone}</p> : <p className={hintCls}>Nur wenn du einen Rückruf möchtest.</p>}
            </label>

            <label className="block mt-5">
              <span className="ro-eyebrow text-foreground-600">Nachricht *</span>
              <textarea
                rows={5}
                className={inputCls + ' resize-y'}
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                onBlur={() => setTouched((t) => ({ ...t, message: true }))}
                placeholder="Worum geht es?"
              />
              <div className="flex justify-between mt-1.5">
                {show('message') ? <p className={errCls}>{errors.message}</p> : <p className={hintCls}>Mindestens 10 Zeichen.</p>}
                <span className={`text-xs tabular-nums ${form.message.trim().length < 10 ? 'text-foreground-500' : 'text-primary-500'}`}>
                  {form.message.trim().length}/10
</span>
              </div>
            </label>

            {/* honeypot — спрятанное поле */}
            <input
              type="text"
              value={honey}
              onChange={(e) => setHoney(e.target.value)}
              className="hidden"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
            />

            {status === 'error' && (
              <p className="mt-5 flex items-start gap-2 p-3 rounded-lg bg-secondary-950/80 border border-secondary-700 text-[13px] text-secondary-200">
                <i className="ri-error-warning-line mt-0.5" aria-hidden="true" />
                {serverMsg}
              </p>
            )}
            {status === 'ok' && (
              <p className="mt-5 flex items-start gap-2 p-3 rounded-lg bg-primary-500/15 border border-primary-500/40 text-[13px] text-primary-400">
                <i className="ri-checkbox-circle-line mt-0.5" aria-hidden="true" />
                {serverMsg}
              </p>
            )}

            <button
              type="submit"
              disabled={status === 'sending'}
              className="group box-border mt-7 inline-flex h-12 w-full items-center justify-between gap-3 rounded-full border pl-5 pr-[5px] whitespace-nowrap cursor-pointer transition-colors duration-300 text-[15px] leading-none font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background-50 bg-primary-500 border-primary-500 hover:bg-primary-400 hover:border-primary-400 text-background-50 disabled:opacity-60"
            >
              {status === 'sending' ? 'Wird gesendet …' : 'Nachricht senden'}
              <span className="w-9 h-9 shrink-0 flex items-center justify-center rounded-full transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 bg-background-50 text-primary-500">
                <i className={status === 'sending' ? 'ri-loader-4-line text-base leading-none animate-spin' : 'ri-arrow-right-up-line text-base leading-none'} />
              </span>
            </button>
          </form>
        </div>
      </div>
    </section>
  )
}
