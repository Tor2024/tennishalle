import { useState } from 'react'
import { Reveal } from './Reveal'

const PARTNERS = [
  { icon: 'ri-award-line', name: 'Partner Eins' },
  { icon: 'ri-shield-star-line', name: 'Partner Zwei' },
  { icon: 'ri-flashlight-line', name: 'Partner Drei' },
  { icon: 'ri-trophy-line', name: 'Partner Vier' },
  { icon: 'ri-star-smile-line', name: 'Partner Fünf' },
  { icon: 'ri-vip-crown-line', name: 'Partner Sechs' },
]

// structure verbatim from prod bundle home.js (#partner template), marquee pause on hover
export function Partner() {
  const [paused, setPaused] = useState(false)

  const chips = (ariaHidden: boolean) =>
    PARTNERS.map((p) => (
      <span key={(ariaHidden ? 'd-' : '') + p.name} className="hm-partner-chip" aria-hidden={ariaHidden || undefined}>
        <i className={`${p.icon} text-xl text-primary-500`} />
        <span>{p.name}</span>
      </span>
    ))

  return (
    <section id="partner" className="hm-section hm-partner-section scroll-mt-20" aria-labelledby="partner-title">
      <div className="ro-container">
        <Reveal>
          <p className="ro-eyebrow text-primary-500 text-center mb-2">Unser Dank an die Unterstützer</p>
          <h2 id="partner-title" className="hm-h2 text-center">
            Unsere <span className="hm-script">Partner</span>
          </h2>
        </Reveal>
      </div>
      <div className="hm-marquee-wrap">
        <div
          className={`hm-marquee${paused ? ' is-paused' : ''}`}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          <div className="hm-marquee-track">
            {chips(false)}
            {chips(true)}
          </div>
        </div>
      </div>
    </section>
  )
}
