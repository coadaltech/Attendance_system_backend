import { Elysia } from 'elysia'
import { cors } from '@elysiajs/cors'
import { jwt } from '@elysiajs/jwt'
import { bearer } from '@elysiajs/bearer'
import { authRoutes } from './routes/auth'
import { attendanceRoutes, closeUnclosedAttendance } from './routes/attendance'
import { leaveRoutes } from './routes/leave'
import { employeeRoutes } from './routes/employees'
import { holidayRoutes } from './routes/holidays'
import { announcementRoutes } from './routes/announcements'
import { pushRoutes, sendPunchInReminder } from './routes/push'

const app = new Elysia()
  .use(cors({
    origin: ([
      'http://localhost:5173',
      'http://localhost:4173',
      process.env.FRONTEND_URL,
    ] as (string | undefined)[]).filter((x): x is string => Boolean(x)),
    credentials: true,
  }))
  // JWT and bearer must be at the root so derive({ as:'global' }) can see them
  .use(jwt({ name: 'jwt', secret: process.env.JWT_SECRET || 'secret' }))
  .use(bearer())
  // Resolve user for every request globally — null when unauthenticated
  .derive({ as: 'global' }, async ({ jwt, bearer }) => {
    if (!bearer) return { user: null as any }
    try {
      const payload = await jwt.verify(bearer)
      return {
        user: (payload || null) as {
          id: number; email: string; role: string; name: string
        } | null,
      }
    } catch {
      return { user: null as any }
    }
  })
  // onError must be before group() to catch errors thrown inside grouped routes
  .onError(({ error, set }) => {
    const message = error instanceof Error ? error.message : 'Internal server error'
    console.error('[API Error]', message)
    if (!set.status || set.status === 200) set.status = 500
    return { error: message }
  })
  .get('/health', () => ({ status: 'ok', app: 'Coadal Attendance API', time: new Date().toISOString() }))
  .group('/api', app => app
    .use(authRoutes)
    .use(attendanceRoutes)
    .use(leaveRoutes)
    .use(employeeRoutes)
    .use(holidayRoutes)
    .use(announcementRoutes)
    .use(pushRoutes)
  )
  .listen(process.env.PORT || 3000)

console.log(`Coadal Attendance API running at http://localhost:${app.server?.port}`)

// Nightly job: at 11:30 PM close all open attendance records from today
function scheduleNightlyClose() {
  const now = new Date()
  const next = new Date()
  next.setHours(23, 30, 0, 0)
  if (now >= next) next.setDate(next.getDate() + 1)
  const delay = next.getTime() - now.getTime()

  setTimeout(async () => {
    const today = new Date().toISOString().split('T')[0]
    console.log(`[Nightly] Closing unclosed attendance for ${today}`)
    await closeUnclosedAttendance(today)
    scheduleNightlyClose()
  }, delay)
}

// Punch-in reminder: at 10:00 AM every day except Sunday, push-notify all active employees
// TEMP (testing only): set to 3:45 PM — revert to setHours(10, 0, 0, 0) before real use
function schedulePunchInReminder() {
  const now = new Date()
  const next = new Date()
  next.setHours(15, 45, 0, 0)
  if (now >= next) next.setDate(next.getDate() + 1)
  const delay = next.getTime() - now.getTime()

  setTimeout(async () => {
    if (next.getDay() !== 0) {
      console.log(`[PunchIn Reminder] Sending for ${next.toISOString().split('T')[0]}`)
      await sendPunchInReminder()
    }
    schedulePunchInReminder()
  }, delay)
}

scheduleNightlyClose()
schedulePunchInReminder()
