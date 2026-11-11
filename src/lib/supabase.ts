import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL = 'https://uodkheklpjutryghvqnc.supabase.co'
export const SUPABASE_KEY = 'sb_publishable_GFzhL2uJiyzgGAdCRPZZ3w_PrnKN5Xs'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

export interface Venue {
  id: string
  name: string
  sort_order: number
  is_active: boolean
}

export interface Court {
  id: string
  venue_id: string
  name: string
  surface: string | null
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
}

export async function getCourts(): Promise<{ courts: Court[]; venues: Venue[] }> {
  const [courtsRes, venuesRes] = await Promise.all([
    supabase.from('courts').select('*').eq('is_active', true).order('sort_order'),
    supabase.from('venues').select('*').eq('is_active', true).order('sort_order'),
  ])
  if (courtsRes.error) throw courtsRes.error
  if (venuesRes.error) throw venuesRes.error
  return { courts: courtsRes.data as Court[], venues: venuesRes.data as Venue[] }
}

export async function getClubSettings(): Promise<ClubSettings | null> {
  const res = await supabase.from('club_settings').select('*').eq('id', 1).single()
  if (res.error) return null
  return res.data as ClubSettings
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

export async function api<T>(action: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/booking-api`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
    body: JSON.stringify({ action, ...body }),
  })
  return (await res.json()) as T
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
