import { Elysia } from 'elysia'
import { cors } from '@elysiajs/cors'
import { jwt } from '@elysiajs/jwt'
import { bearer } from '@elysiajs/bearer'
import { authRoutes } from './routes/auth'
import { attendanceRoutes } from './routes/attendance'
import { leaveRoutes } from './routes/leave'
import { employeeRoutes } from './routes/employees'
import { holidayRoutes } from './routes/holidays'

const app = new Elysia()
  .use(cors({
    origin: (req) => {
      const allowed = [
        'http://localhost:5173',
        'http://localhost:4173',
        process.env.FRONTEND_URL,
      ].filter(Boolean)
      return allowed.includes(req) ? req : false
    },
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
  )
  .listen(process.env.PORT || 3000)

console.log(`Coadal Attendance API running at http://localhost:${app.server?.port}`)
