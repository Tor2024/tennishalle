// Frontend API client — talks to own Vercel Functions (/api/booking, /api/auth, /api/data).
// Cookie-based auth (th_session), same-origin only.

export interface Venue {
  id: string
  name: string
  address?: string | null
  sort_order: number
  is_active: boolean
}

export interface Court {
  id: string
  venue_id: string
  name: string
  surface: string | null
  environment?: string | null
  is_active: boolean
  sort_order: number
  image_url: string | null
  hourly_price: number | null
  court_number?: number
}

export interface ClubSettings {
  timezone: string
  booking_window_days: number
  allowed_durations: number[]
  currency: string
  address: string
  contact_phone: string
  contact_email: string
  member_cancel_cutoff_hours?: number
}

export interface AppUser {
  id: string
  email: string
  full_name: string | null
  role: 'member' | 'owner' | 'admin'
  phone?: string | null
}

export interface DayOverview {
  date: string
  total: number
  free: number
}

export interface SlotInfo {
  time: string
  available: boolean
  price: number | null
}

export interface CourtBlock {
  court_id: string
  starts_at: string
  ends_at: string
  reason: string
}

export interface CourtPriceInfo {
  hourly_price: number | null
  min_hourly: number | null
  max_hourly: number | null
  zone_count: number
}

async function post<T>(url: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  })
  return (await res.json()) as T
}

/** booking-api actions: month_overview, availability, create, member_cancel */
export function api<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  return post<T>('/api/booking', { action, ...body })
}

/** auth actions: signup, signin, signout, me */
export function apiAuth<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  return post<T>('/api/auth', { action, ...body })
}

/** data actions: bootstrap, court_blocks */
export function apiData<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  return post<T>('/api/data', { action, ...body })
}

/** admin actions: me, stats, bookings, create_block, delete_block, day_data */
export function apiAdmin<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  return post<T>('/api/admin', { action, ...body })
}

/** venues + courts + club_settings in one call */
export async function getBootstrap(): Promise<{ venues: Venue[]; courts: Court[]; settings: ClubSettings | null }> {
  const r = await apiData<{ ok: boolean; venues: Venue[]; courts: Court[]; settings: ClubSettings | null }>('bootstrap')
  return { venues: r.venues ?? [], courts: r.courts ?? [], settings: r.settings ?? null }
}

export async function getCourtBlocks(date: string): Promise<CourtBlock[]> {
  const r = await apiData<{ ok: boolean; blocks: CourtBlock[] }>('court_blocks', { date })
  return r.blocks ?? []
}

/** Обзор цен по кортам (hourly_price + min/max из ценовых зон). */
export async function getPriceOverview(): Promise<Record<string, CourtPriceInfo>> {
  try {
    const r = await apiData<{ ok: boolean; prices: Record<string, CourtPriceInfo> }>('price_overview')
    return r.prices ?? {}
  } catch {
    return {}
  }
}

export async function me(): Promise<AppUser | null> {
  try {
    const r = await apiAuth<{ ok: boolean; user?: AppUser }>('me')
    return r.ok && r.user ? r.user : null
  } catch {
    return null
  }
}

export function formatPrice(value: number | null | undefined, currency = 'EUR'): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(Number(value ?? 0))
}

export function hhmmToMin(hhmm: string): number {
  if (!hhmm || !hhmm.includes(':')) return 0
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export function minToHHMM(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
