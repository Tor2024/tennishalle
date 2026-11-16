import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiData } from '../lib/api'
import { Nav } from '../components/Nav'
import { Footer } from '../components/Footer'

const IDS = ['agb', 'impressum', 'datenschutz', 'cookies'] as const
const LABELS: Record<string, string> = {
  agb: 'AGB',
  impressum: 'Impressum',
  datenschutz: 'Datenschutz',
  cookies: 'Cookies',
}

interface LegalPage { id: string; title: string; body: string; updated_at: string }

export function LegalPageView() {
  const { page } = useParams()
  const [doc, setDoc] = useState<LegalPage | null>(null)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    if (!IDS.includes((page ?? '') as never)) {
      setMissing(true)
      return
    }
    apiData<{ ok: boolean; pages: LegalPage[] }>('legal')
      .then((r) => {
        const found = r?.pages?.find((p) => p.id === page) ?? null
        if (!found) throw new Error('missing')
        setDoc(found)
      })
      .catch(() => setMissing(true))
  }, [page])

  if (missing) {
    return (
      <div className="ro min-h-screen bg-background-50 text-foreground-950 flex flex-col">
        <Nav />
        <main className="flex-1 flex items-center justify-center px-4">
          <div className="text-center">
            <h1 className="ro-h1">404</h1>
            <p className="ro-body mt-4 text-foreground-700">Diese Seite existiert nicht.</p>
            <Link to="/" className="hm-textlink mt-6 inline-flex">
              Zu den Plätzen <i className="ri-arrow-right-line" />
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    )
  }

  return (
    <div className="ro min-h-screen bg-background-50 text-foreground-950 flex flex-col">
      <Nav />
      <main className="flex-1 pt-28 md:pt-40 pb-20 px-4 md:px-10">
        <div className="max-w-3xl mx-auto">
          <p className="eyebrow text-primary-500">Rechtliches</p>
          <h1 className="mt-5 font-heading font-light display-tight text-[44px] md:text-[72px]">
            {doc?.title ?? '…'}
          </h1>
          {doc?.updated_at && (
            <p className="mt-3 text-xs text-foreground-500">
              Stand: {new Date(doc.updated_at).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Europe/Berlin' })}
            </p>
          )}
          <div className="mt-10 ro-card p-6 md:p-10">
            {doc ? (
              <div className="ro-body text-foreground-800 whitespace-pre-line">{doc.body}</div>
            ) : (
              <p className="ro-body text-foreground-600">Wird geladen …</p>
            )}
          </div>
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2">
            {IDS.filter((i) => i !== page).map((i) => (
              <Link key={i} to={`/legal/${i}`} className="text-[13px] text-foreground-600 hover:text-primary-500 transition-colors">
                {LABELS[i]}
              </Link>
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
