import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

const connectionString = process.env.DATABASE_URL!

const client = postgres(connectionString, {
  max: 3,           // Neon free tier: keep connections low
  idle_timeout: 20, // release idle connections after 20s
  connect_timeout: 10,
})

export const db = drizzle(client, { schema })

// Office hours: Mon–Sat, 9:30 AM – 7:15 PM IST — matches this company's actual
// work week (attendance.ts treats only Sunday as non-working).
const OFFICE_TZ = 'Asia/Kolkata'
const OFFICE_START_MINUTES = 9 * 60 + 30   // 9:30 AM
const OFFICE_END_MINUTES = 19 * 60 + 15    // 7:15 PM

function isOfficeHoursNow(): boolean {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: OFFICE_TZ,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date())

  const get = (type: string) => parts.find(p => p.type === type)!.value
  if (get('weekday') === 'Sun') return false

  const minutesNow = Number(get('hour')) * 60 + Number(get('minute'))
  return minutesNow >= OFFICE_START_MINUTES && minutesNow <= OFFICE_END_MINUTES
}

// Neon free tier sleeps after 5 min idle — ping every 4 min, but only during
// office hours, so the compute is allowed to actually suspend (and stop
// burning the monthly CU-hour quota) nights, Sundays, and outside work hours.
// A request outside this window still works — it just pays Neon's cold-start
// delay (well within the client's connect_timeout below) instead of being instant.
setInterval(async () => {
  if (!isOfficeHoursNow()) return
  try { await client`SELECT 1` } catch { /* ignore */ }
}, 4 * 60 * 1000)
