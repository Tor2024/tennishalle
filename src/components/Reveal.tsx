import { useEffect, useRef, type ReactNode } from 'react'

export function Reveal({ children, className = '', as: Tag = 'div', delay = 0, threshold = 0.15 }: { children: ReactNode; className?: string; as?: 'div' | 'section' | 'p' | 'h1' | 'h2'; delay?: number; threshold?: number }) {
  const ref = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('is-in')
            io.unobserve(e.target)
          }
        }
      },
      { threshold },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [threshold])

  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <Tag ref={ref as never} className={`reveal ${className}`} style={delay ? { transitionDelay: `${delay}ms` } : undefined}>
      {children}
    </Tag>
  )
}
