import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'

export function Pill({
  label,
  to,
  href,
  onClick,
  variant = 'lime',
  full = false,
  ariaLabel,
  children,
}: {
  label?: string
  to?: string
  href?: string
  onClick?: () => void
  variant?: 'lime' | 'dark' | 'outline'
  full?: boolean
  ariaLabel?: string
  children?: ReactNode
}) {
  const cls = [
    'inline-flex items-center justify-center gap-2 rounded-full font-bold whitespace-nowrap transition-transform duration-300 cursor-pointer',
    full ? 'w-full' : '',
    variant === 'lime' ? 'bg-primary-500 text-background-950 hover:brightness-105' : '',
    variant === 'dark' ? 'bg-foreground-950 text-background-50' : '',
    variant === 'outline' ? 'border border-foreground-950/20 text-foreground-950 hover:border-foreground-950/40' : '',
  ].join(' ')

  const inner = (
    <>
      <span className="px-5 py-2.5 text-sm">{label}</span>
      {children}
    </>
  )

  if (to) {
    return (
      <Link to={to} aria-label={ariaLabel} className={cls}>
        {inner}
      </Link>
    )
  }
  if (href) {
    return (
      <a href={href} aria-label={ariaLabel} className={cls}>
        {inner}
      </a>
    )
  }
  return (
    <button type="button" onClick={onClick} aria-label={ariaLabel} className={cls}>
      {inner}
    </button>
  )
}

export function PillArrow() {
  return (
    <span className="ml-1 mr-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-background-950 text-primary-500">
      <i className="ri-arrow-right-up-line text-sm" />
    </span>
  )
}
