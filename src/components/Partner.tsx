import { useEffect, useState } from 'react'
import { apiData } from '../lib/api'

const FALLBACK = [
  { icon: 'ri-award-line', name: 'Partner Eins' },
  { icon: 'ri-shield-star-line', name: 'Partner Zwei' },
  { icon: 'ri-flashlight-line', name: 'Partner Drei' },
  { icon: 'ri-trophy-line', name: 'Partner Vier' },
  { icon: 'ri-star-smile-line', name: 'Partner Fünf' },
  { icon: 'ri-vip-crown-line', name: 'Partner Sechs' },
]

interface DbPartner { id: string; name: string; link: string | null; logo_path: string | null; is_active: boolean }

function domainOf(link: string | null | undefined): string {
  if (!link) return ''
  try {
    return new URL(link).hostname.replace(/^www\./, '')
  } catch {
    return link.replace(/^https?:\/\//, '').split('/')[0]
  }
}

// marquee of business-card style cards (Visitenkarten): light card, logo, name, domain, link
// pause on hover; duplicated track for seamless loop (aria-hidden on the copy)
// data from DB (admin-managed); icon fallback while DB has no logo
export function Partner() {
  const [paused, setPaused] = useState(false)
  const [partners, setPartners] = useState<DbPartner[] | null>(null)

  useEffect(() => {
    apiData<{ ok: boolean; partners?: DbPartner[] }>('partners')
      .then((r) => setPartners(r.ok && r.partners?.length ? r.partners : null))
      .catch(() => {})
  }, [])

  const items: { key: string; icon: string; name: string; link?: string | null; logo?: string | null }[] = partners
    ? partners.map((p) => ({ key: p.id, icon: 'ri-award-line', name: p.name, link: p.link, logo: p.logo_path }))
    : FALLBACK.map((p) => ({ key: p.name, icon: p.icon, name: p.name }))

  const card = (p: { key: string; icon: string; name: string; link?: string | null; logo?: string | null }) => (
    <>
      <div className="hm-visitenkarte-top">
        {p.logo ? (
          <img src={p.logo} alt="" loading="lazy" className="hm-visitenkarte-logo" />
        ) : (
          <span className="hm-visitenkarte-badge"><i className={`${p.icon} text-2xl`} /></span>
        )}
        <span className="hm-visitenkarte-name">{p.name}</span>
      </div>
      <div className="hm-visitenkarte-foot">
        <span className="hm-visitenkarte-domain">{p.link ? domainOf(p.link) : 'Vereinssponsor'}</span>
        {p.link && <i className="ri-arrow-right-up-line" />}
      </div>
    </>
  )

  const tile = (p: { key: string; icon: string; name: string; link?: string | null; logo?: string | null }, ariaHidden: boolean) => {
    const cls = 'hm-visitenkarte'
    return p.link ? (
      <a key={(ariaHidden ? 'd-' : '') + p.key} href={p.link} target="_blank" rel="noreferrer" className={cls} aria-hidden={ariaHidden || undefined} tabIndex={ariaHidden ? -1 : undefined}>
        {card(p)}
      </a>
    ) : (
      <div key={(ariaHidden ? 'd-' : '') + p.key} className={cls} aria-hidden={ariaHidden || undefined}>
        {card(p)}
      </div>
    )
  }

  return (
    <section id="partner" className="hm-section scroll-mt-20" aria-labelledby="partner-title">
      <div className="ro-container">
        <p className="ro-eyebrow text-primary-500 text-center mb-2">Unser Dank an die Unterstützer</p>
        <h2 id="partner-title" className="hm-h2 text-center">
          Unsere <span className="hm-script">Partner</span>
        </h2>
      </div>
      <div
        className="hm-marquee mt-10"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <div className={`hm-marquee-track${paused ? ' is-paused' : ''}`}>
          {items.map((p) => tile(p, false))}
          {items.map((p) => tile(p, true))}
        </div>
      </div>
    </section>
  )
}
