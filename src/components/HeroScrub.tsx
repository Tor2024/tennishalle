import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

const CONFIG = {
  videoSrc: '/assets/video/hero-720.mp4',
  posterSrc: '/assets/img/hero-first-hq.webp',
  posterForegroundSrc: '/assets/img/c027dbb9-ea25-4d38-8980-0c5c33e58092.png',
  endFrameSrc: '/assets/img/hero-lastframe.webp',
  fps: 24,
  scrollLengthVh: 520,
}

const CAPTIONS = [
  { a: 0.1, b: 0.22, kicker: '01 — Der Schlag', line: 'Jeder gute Abend beginnt mit einem sauberen Schlag.', align: 'left' },
  { a: 0.3, b: 0.5, kicker: '02 — Der Ballwechsel', line: 'Plätze für lange Ballwechsel und späte Endsiege.', align: 'right' },
  { a: 0.62, b: 0.8, kicker: '03 — Der Blick', line: 'Live-Verfügbarkeit in 30-Minuten-Schritten.', align: 'left' },
] as const

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() => (typeof window !== 'undefined' ? window.innerWidth >= 1024 : true))
  useEffect(() => {
    const onResize = () => setIsDesktop(window.innerWidth >= 1024)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return isDesktop
}

export function HeroScrub({ summary }: { summary: string }) {
  const sectionRef = useRef<HTMLElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [progress, setProgress] = useState(0)
  const [videoReady, setVideoReady] = useState(false)
  const isDesktop = useIsDesktop()
  const reducedMotion =
    typeof window !== 'undefined' && 'matchMedia' in window && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const scrubActive = isDesktop && !loadFailed && !reducedMotion

  // scroll -> progress
  useEffect(() => {
    const onScroll = () => {
      const section = sectionRef.current
      if (!section) return
      const rect = section.getBoundingClientRect()
      const total = section.offsetHeight - window.innerHeight
      if (total <= 0) return
      setProgress(clamp01(-rect.top / total))
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  // scrub video
  useEffect(() => {
    if (!scrubActive) return
    const video = videoRef.current
    if (!video) return
    let last = 0
    let raf = 0
    const tick = (t: number) => {
      raf = 0
      if (t - last < 1000 / CONFIG.fps) return
      last = t
      if (video.duration && Number.isFinite(video.duration)) {
        video.currentTime = progress * video.duration
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [progress, scrubActive, videoReady])

  // end overlay progress
  const endOverlay = clamp01((progress - 0.82) / 0.12)

  return (
    <section id="hero" ref={sectionRef as never} style={{ height: `${CONFIG.scrollLengthVh}vh` }} className="relative">
      <div className="sticky top-0 h-screen overflow-hidden">
        {/* video / poster */}
        {scrubActive ? (
          <video
            ref={videoRef}
            src={CONFIG.videoSrc}
            poster={CONFIG.posterSrc}
            muted
            playsInline
            preload="auto"
            className="absolute inset-0 h-full w-full object-cover ro-img-hero"
            onCanPlay={() => setVideoReady(true)}
            onError={() => setLoadFailed(true)}
          />
        ) : (
          <img src={CONFIG.posterSrc} alt="" className="absolute inset-0 h-full w-full object-cover ro-img-hero" />
        )}

        {/* dark tint for readability */}
        <div className="absolute inset-0 bg-background-50/30" />

        {/* ball cutout foreground — only pre-scrub */}
        {scrubActive && progress < 0.05 && (
          <img
            src={CONFIG.posterForegroundSrc}
            alt=""
            className="absolute inset-0 h-full w-full object-cover pointer-events-none"
            style={{ opacity: 1 - progress / 0.05 }}
          />
        )}
        {!scrubActive && (
          <img
            src={CONFIG.posterForegroundSrc}
            alt=""
            className="absolute inset-0 h-full w-full object-cover pointer-events-none"
          />
        )}

        {/* wordmark — fades out together with the intro poster layer (as in prod) */}
        <p
          aria-hidden="true"
          className="hero-wordmark-row"
          style={scrubActive ? { opacity: clamp01(1 - progress / 0.05) } : undefined}
        >
          <span className="hero-wordmark hero-wordmark-full">TENNISHALLE</span>
        </p>

        {/* scroll hint arrow */}
        <div className="absolute bottom-6 left-0 right-0 z-10 flex justify-center" style={{ opacity: clamp01(1 - progress / 0.08) }}>
          <i className="ri-arrow-down-line text-xl text-foreground-700" />
        </div>

        {/* scroll captions */}
        {scrubActive &&
          CAPTIONS.map((c) => {
            const t = Math.min(clamp01((progress - c.a) / 0.035), clamp01((c.b - progress) / 0.035))
            if (t <= 0) return null
            const right = c.align === 'right'
            return (
              <div
                key={c.kicker}
                className={`absolute bottom-[14%] z-30 max-w-[420px] px-4 md:px-0 pointer-events-none ${
                  right ? 'right-0 md:right-14 text-right' : 'left-0 md:left-14'
                }`}
                style={{ opacity: t, transform: `translateY(${(1 - t) * 18}px)` }}
              >
                <p className="text-[11px] tracking-[0.18em] uppercase font-semibold text-primary-500">{c.kicker}</p>
                <p className="mt-3 font-heading italic text-3xl md:text-[44px] leading-[1.05] text-foreground-950">{c.line}</p>
              </div>
            )
          })}

        {/* end overlay — structure and classes verbatim from the prod bundle */}
        {endOverlay > 0.01 && (
          <div
            className="absolute inset-0 z-30 flex items-center justify-center px-4"
            style={{ opacity: endOverlay, pointerEvents: endOverlay > 0.6 ? 'auto' : 'none' }}
          >
            <div className="absolute inset-0 bg-background-50/55" />
            <div className="relative w-full max-w-2xl text-center" style={{ transform: `translateY(${(1 - endOverlay) * 24}px)` }}>
              <p className="text-[11px] tracking-[0.18em] uppercase font-semibold text-primary-500">TENNISHALLE</p>
              <h2 className="mt-4 font-heading text-4xl md:text-6xl leading-[1.02] text-foreground-950">
                Dein Platz ist{' '}
                <span className="font-script text-primary-500 text-5xl md:text-7xl">bereit</span>
              </h2>
              <p className="mt-5 text-[15px] leading-relaxed text-foreground-800 max-w-lg mx-auto">
                {summary} Buche als Gast oder mit deinem Mitgliederkonto — die Buchungsreferenz kommt sofort.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link
                  to="/book"
                  className="group box-border inline-flex h-12 items-center gap-3 rounded-full border pl-5 pr-[5px] whitespace-nowrap cursor-pointer transition-colors duration-300 text-[15px] leading-none font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background-50 justify-center bg-primary-500 border-primary-500 hover:bg-primary-400 hover:border-primary-400 text-background-50"
                >
                  Platz buchen
                  <span className="w-9 h-9 shrink-0 flex items-center justify-center rounded-full transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 bg-background-50 text-primary-500">
                    <i className="ri-arrow-right-up-line text-base leading-none" />
                  </span>
                </Link>
                <a
                  href="#court-list"
                  className="group box-border inline-flex h-12 items-center gap-3 rounded-full border pl-5 pr-[5px] whitespace-nowrap cursor-pointer transition-colors duration-300 text-[15px] leading-none font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background-50 justify-center bg-foreground-950 border-transparent hover:bg-foreground-900 text-background-50"
                >
                  Plätze entdecken
                  <span className="w-9 h-9 shrink-0 flex items-center justify-center rounded-full transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 bg-primary-500 text-background-50">
                    <i className="ri-arrow-down-line text-base leading-none" />
                  </span>
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
