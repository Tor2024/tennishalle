export function todayInTz(tz: string): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: tz })
}

export function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T12:00:00`)
  d.setDate(d.getDate() + n)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function dateShort(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString('de-DE', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

export function dateParts(dateStr: string): { wd: string; day: number; mon: string } {
  const d = new Date(`${dateStr}T12:00:00`)
  return {
    wd: d.toLocaleDateString('de-DE', { weekday: 'short' }),
    day: d.getDate(),
    mon: d.toLocaleDateString('de-DE', { month: 'short' }),
  }
}

export function datetimeShort(iso: string, tz: string): string {
  return new Date(iso).toLocaleDateString('de-DE', {
    timeZone: tz,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}
