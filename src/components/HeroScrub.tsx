import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

const CONFIG = {
  videoSrc: '/assets/video/hero-720.mp4',
  posterSrc: '/assets/img/hero-first-hq.webp',
  posterForegroundSrc: '/assets/img/c027dbb9-1c36-4784-92bd-bfa2337b1fe9.png',
  endFrameSrc: '/assets/img/hero-lastframe.webp',
  fps: 24,
  scrollLengthVh: 520,
}

const CAPTIONS = [
  { kicker: '01', line: 'Der Schlag', align: 'left' },
  { kicker: '02', line: 'Der Ballwechsel', align: 'right' },
  { kicker: '03', line: 'Der Blick', align: 'left' },
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

  // caption windows: three fades spread over the scroll
  const capWindow = (i: number) => {
    const start = 0.12 + i * 0.2
    const end = start + 0.16
    return clamp01((progress - start) / (end - start)) * clamp01((end + 0.06 - progress) / 0.06)
  }
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

        {/* wordmark */}
        <p aria-hidden="true" className="hero-wordmark-row">
          <span className="hero-wordmark">TENNIS</span>
          <span className="inline-block w-[10vw] md:w-[9vw]" />
          <span className="hero-wordmark" style={{ marginRight: '-0.14em' }}>
            HALLE
          </span>
        </p>

        {/* scroll hint arrow */}
        <div className="absolute bottom-6 left-0 right-0 z-10 flex justify-center" style={{ opacity: clamp01(1 - progress / 0.08) }}>
          <i className="ri-arrow-down-line text-xl text-foreground-700" />
        </div>

        {/* scroll captions */}
        {CAPTIONS.map((c, i) => {
          const o = capWindow(i)
          if (o <= 0.01) return null
          return (
            <div
              key={c.kicker}
              className={`absolute bottom-[18%] ${c.align === 'left' ? 'left-[8%]' : 'right-[8%]'} z-10`}
              style={{ opacity: o }}
            >
              <p className="ro-eyebrow text-foreground-600">{c.kicker}</p>
              <p className="ro-h2 text-foreground-950">{c.line}</p>
            </div>
          )
        })}

        {/* end overlay */}
        {endOverlay > 0.01 && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-6 bg-background-50/55 backdrop-blur-md px-4" style={{ opacity: endOverlay }}>
            <p className="ro-eyebrow text-foreground-600">TENNISHALLE</p>
            <h2 className="ro-h1 text-foreground-950 text-center">
              Dein Platz ist{' '}
              <span className="font-script text-primary-500">bereit</span>
            </h2>
            <p className="ro-body max-w-lg mx-auto text-center text-foreground-700">{summary}</p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link
                to="/book"
                className="inline-flex items-center gap-2 rounded-full bg-primary-500 px-6 py-3 text-sm font-bold text-background-950"
              >
                Platz buchen
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-background-950 text-primary-500">
                  <i className="ri-arrow-right-up-line text-xs" />
                </span>
              </Link>
              <a
                href="#court-list"
                className="inline-flex items-center gap-2 rounded-full border border-foreground-950/15 px-6 py-3 text-sm font-bold text-foreground-950"
              >
                Plätze entdecken
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground-950/10">
                  <i className="ri-arrow-down-line text-xs" />
                </span>
              </a>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
