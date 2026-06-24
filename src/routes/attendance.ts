import { Elysia, t } from 'elysia'
import { authMiddleware } from '../middleware/auth'
import { db } from '../db'
import { attendance, holidays } from '../db/schema'
import { eq, and, gte, lte, desc, lt, isNull, isNotNull } from 'drizzle-orm'

function calcWorkingHours(punchIn: Date, punchOut: Date): number {
  return Number(((punchOut.getTime() - punchIn.getTime()) / 3600000).toFixed(2))
}

function determineStatus(hours: number): 'full_day' | 'half_day' | 'overtime' | 'absent' {
  if (hours >= 9) return 'overtime'
  if (hours >= 7) return 'full_day'
  if (hours >= 4) return 'half_day'
  return 'absent'
}

// Haversine formula — returns distance in meters between two GPS coordinates
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const toRad = (deg: number) => deg * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function getOfficeConfig() {
  return {
    lat: parseFloat(process.env.OFFICE_LAT || '0'),
    lng: parseFloat(process.env.OFFICE_LNG || '0'),
    radius: parseInt(process.env.OFFICE_RADIUS_METERS || '200'),
    name: process.env.OFFICE_NAME || 'Office',
  }
}

// Closes all attendance records where employee punched in but never punched out
// before 'beforeDate'. Called on every punch-in and from the nightly scheduler.
export async function closeUnclosedAttendance(beforeDate: string, employeeId?: number) {
  const filters = [
    lt(attendance.date, beforeDate),
    isNotNull(attendance.punchIn),
    isNull(attendance.punchOut),
  ]
  if (employeeId !== undefined) filters.push(eq(attendance.employeeId, employeeId))

  const open = await db.select().from(attendance).where(and(...filters))
  for (const rec of open) {
    await db.update(attendance)
      .set({
        status: 'half_day',
        workingHours: '4',
        notes: 'Auto-marked half day: punch out missing',
        updatedAt: new Date(),
      })
      .where(eq(attendance.id, rec.id))
  }
}

export const attendanceRoutes = new Elysia({ prefix: '/attendance' })
  .use(authMiddleware)
  // Returns office geofence config so the frontend can show distance info
  .get('/office-config', () => {
    const { lat, lng, radius, name } = getOfficeConfig()
    return { lat, lng, radius, name }
  })
  .get('/today', async ({ user }) => {
    const today = new Date().toISOString().split('T')[0]
    const [record] = await db.select().from(attendance)
      .where(and(eq(attendance.employeeId, user.id), eq(attendance.date, today)))
    return record || null
  })
  // Admin: all employees with today's attendance status
  .get('/today-all', async ({ user, set }) => {
    if (user.role !== 'admin') { set.status = 403; return { error: 'Forbidden' } }
    const today = new Date().toISOString().split('T')[0]
    const { employees } = await import('../db/schema')
    const allEmps = await db.select({
      id: employees.id, name: employees.name, department: employees.department,
      designation: employees.designation, employeeCode: employees.employeeCode,
      createdAt: employees.createdAt,
    }).from(employees).where(and(eq(employees.isActive, true), eq(employees.role, 'employee')))

    const todayRecords = await db.select().from(attendance).where(eq(attendance.date, today))
    const attMap: Record<number, any> = Object.fromEntries(todayRecords.map(r => [r.employeeId, r]))

    return allEmps.map(emp => ({ ...emp, todayAttendance: attMap[emp.id] || null }))
  })
  .post('/punch-in', async ({ user, body, set }) => {
    const { latitude, longitude } = body
    const office = getOfficeConfig()

    // Validate geofence
    if (office.lat && office.lng) {
      const distance = Math.round(haversineDistance(latitude, longitude, office.lat, office.lng))
      if (distance > office.radius) {
        set.status = 403
        return {
          error: `You must be at ${office.name} to punch in.`,
          detail: `You are ${distance}m away. Allowed radius: ${office.radius}m.`,
          distance,
          allowed: false,
        }
      }
    }

    const today = new Date().toISOString().split('T')[0]

    // Auto-close any previous days where this employee forgot to punch out
    await closeUnclosedAttendance(today, user.id)

    const [existing] = await db.select().from(attendance)
      .where(and(eq(attendance.employeeId, user.id), eq(attendance.date, today)))

    if (existing?.punchIn) {
      set.status = 400
      return { error: 'Already punched in today' }
    }

    const now = new Date()
    if (existing) {
      const [updated] = await db.update(attendance)
        .set({ punchIn: now, status: 'full_day', punchInLat: String(latitude), punchInLng: String(longitude), updatedAt: now })
        .where(eq(attendance.id, existing.id)).returning()
      return updated
    }

    const [record] = await db.insert(attendance).values({
      employeeId: user.id,
      date: today,
      punchIn: now,
      status: 'full_day',
      punchInLat: String(latitude),
      punchInLng: String(longitude),
    }).returning()
    return record
  }, {
    body: t.Object({ latitude: t.Number(), longitude: t.Number() }),
  })
  .post('/punch-out', async ({ user, set }) => {
    const today = new Date().toISOString().split('T')[0]
    const [existing] = await db.select().from(attendance)
      .where(and(eq(attendance.employeeId, user.id), eq(attendance.date, today)))

    if (!existing?.punchIn) {
      set.status = 400
      return { error: 'You have not punched in yet' }
    }
    if (existing.punchOut) {
      set.status = 400
      return { error: 'Already punched out today' }
    }

    const now = new Date()
    const hours = calcWorkingHours(new Date(existing.punchIn), now)
    const status = determineStatus(hours)

    const [updated] = await db.update(attendance)
      .set({ punchOut: now, workingHours: String(hours), status, updatedAt: now })
      .where(eq(attendance.id, existing.id)).returning()
    return updated
  })
  .get('/history', async ({ user, query }) => {
    const { month, year } = query
    const y = Number(year) || new Date().getFullYear()
    const m = Number(month) || new Date().getMonth() + 1
    const startDate = `${y}-${String(m).padStart(2, '0')}-01`
    const lastDay = new Date(y, m, 0).getDate()
    const endDate = `${y}-${String(m).padStart(2, '0')}-${lastDay}`

    const records = await db.select().from(attendance)
      .where(and(
        eq(attendance.employeeId, user.id),
        gte(attendance.date, startDate),
        lte(attendance.date, endDate),
      )).orderBy(desc(attendance.date))
    return records
  }, { query: t.Object({ month: t.Optional(t.String()), year: t.Optional(t.String()) }) })
  .get('/employee/:id', async ({ params, query, user, set }) => {
    if (user.role !== 'admin' && user.id !== Number(params.id)) {
      set.status = 403; return { error: 'Forbidden' }
    }
    const { month, year } = query
    const y = Number(year) || new Date().getFullYear()
    const m = Number(month) || new Date().getMonth() + 1
    const startDate = `${y}-${String(m).padStart(2, '0')}-01`
    const lastDay = new Date(y, m, 0).getDate()
    const endDate = `${y}-${String(m).padStart(2, '0')}-${lastDay}`

    const records = await db.select().from(attendance)
      .where(and(
        eq(attendance.employeeId, Number(params.id)),
        gte(attendance.date, startDate),
        lte(attendance.date, endDate),
      )).orderBy(desc(attendance.date))
    return records
  }, {
    params: t.Object({ id: t.String() }),
    query: t.Object({ month: t.Optional(t.String()), year: t.Optional(t.String()) }),
  })
  // Admin: export all employees' attendance for a month as JSON (frontend builds CSV)
  .get('/export-all', async ({ user, query, set }) => {
    if (user.role !== 'admin') { set.status = 403; return { error: 'Forbidden' } }
    const y = Number(query.year)  || new Date().getFullYear()
    const m = Number(query.month) || new Date().getMonth() + 1
    const startDate = `${y}-${String(m).padStart(2, '0')}-01`
    const lastDay   = new Date(y, m, 0).getDate()
    const endDate   = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

    const { employees: empTable } = await import('../db/schema')
    const allEmps = await db.select({
      id: empTable.id, name: empTable.name,
      employeeCode: empTable.employeeCode, department: empTable.department,
    }).from(empTable).where(and(eq(empTable.isActive, true), eq(empTable.role, 'employee')))

    const allRecords = await db.select().from(attendance)
      .where(and(gte(attendance.date, startDate), lte(attendance.date, endDate)))

    return { employees: allEmps, records: allRecords, month: m, year: y }
  }, { query: t.Object({ month: t.Optional(t.String()), year: t.Optional(t.String()) }) })

  // Admin: create or update attendance for any employee on any date
  .post('/admin-mark', async ({ user, body, set }) => {
    if (user.role !== 'admin') { set.status = 403; return { error: 'Forbidden' } }
    const { employeeId, date, punchIn, punchOut, status, notes } = body

    // Frontend sends UTC ISO strings — parse directly, no server-timezone math
    const punchInTs  = punchIn  ? new Date(punchIn)  : null
    const punchOutTs = punchOut ? new Date(punchOut) : null

    // Auto-calculate hours and status from punch times
    let hours: number | null = null
    let computedStatus = status || null  // null = auto mode

    if (punchInTs && punchOutTs) {
      hours = Number(((punchOutTs.getTime() - punchInTs.getTime()) / 3600000).toFixed(2))
      if (!computedStatus) computedStatus = determineStatus(hours)
    } else if (punchInTs && !punchOutTs) {
      if (!computedStatus) computedStatus = 'full_day'
    } else if (!punchInTs && !punchOutTs) {
      if (!computedStatus) computedStatus = 'absent'
    }

    const [existing] = await db.select().from(attendance)
      .where(and(eq(attendance.employeeId, employeeId), eq(attendance.date, date)))

    const now = new Date()
    if (existing) {
      // Save exactly what admin sent — no silent fallback to old values
      const [updated] = await db.update(attendance).set({
        punchIn: punchInTs,
        punchOut: punchOutTs,
        workingHours: hours !== null ? String(hours) : null,
        status: computedStatus as any,
        notes: notes ?? existing.notes,
        updatedAt: now,
      }).where(eq(attendance.id, existing.id)).returning()
      return updated
    }

    const [created] = await db.insert(attendance).values({
      employeeId,
      date,
      punchIn: punchInTs ?? undefined,
      punchOut: punchOutTs ?? undefined,
      workingHours: hours !== null ? String(hours) : undefined,
      status: (computedStatus || 'absent') as any,
      notes: notes ?? undefined,
    }).returning()
    return created
  }, {
    body: t.Object({
      employeeId: t.Number(),
      date: t.String(),
      punchIn: t.Optional(t.String()),
      punchOut: t.Optional(t.String()),
      status: t.Optional(t.String()),
      notes: t.Optional(t.String()),
    }),
  })
  .get('/summary', async ({ user, query }) => {
    const { month, year } = query
    const y = Number(year) || new Date().getFullYear()
    const m = Number(month) || new Date().getMonth() + 1
    const startDate = `${y}-${String(m).padStart(2, '0')}-01`
    const lastDay = new Date(y, m, 0).getDate()
    const endDate = `${y}-${String(m).padStart(2, '0')}-${lastDay}`

    // Look up employee's createdAt to use as tracking start
    const { employees: empTable } = await import('../db/schema')
    const [emp] = await db.select({ createdAt: empTable.createdAt })
      .from(empTable).where(eq(empTable.id, user.id))
    const trackingStart = (() => {
      const monthStart = new Date(y, m - 1, 1)
      if (emp?.createdAt) {
        const d = new Date(emp.createdAt); d.setHours(0, 0, 0, 0)
        return d > monthStart ? d : monthStart
      }
      return monthStart
    })()

    const records = await db.select().from(attendance)
      .where(and(eq(attendance.employeeId, user.id), gte(attendance.date, startDate), lte(attendance.date, endDate)))

    const holidayList = await db.select().from(holidays)
      .where(and(gte(holidays.date, startDate), lte(holidays.date, endDate)))
    const holidaySet = new Set(holidayList.map(h => h.date))

    const totalWorkingDays = countWorkingDays(y, m, trackingStart, holidaySet)
    const presentDays = records.filter(r => ['full_day', 'overtime'].includes(r.status)).length
    const halfDays = records.filter(r => r.status === 'half_day').length
    const totalHours = records.reduce((sum, r) => sum + Number(r.workingHours || 0), 0)

    return {
      totalWorkingDays,
      presentDays,
      halfDays,
      absentDays: totalWorkingDays - presentDays - halfDays,
      totalHours: totalHours.toFixed(1),
      attendancePercent: totalWorkingDays > 0 ? ((presentDays + halfDays * 0.5) / totalWorkingDays * 100).toFixed(1) : '0',
      holidays: holidayList,
    }
  }, { query: t.Object({ month: t.Optional(t.String()), year: t.Optional(t.String()) }) })

// Count working days (Mon–Sat) from trackingStart up to today, excluding holidays
function countWorkingDays(year: number, month: number, trackingStart: Date, holidaySet: Set<string>): number {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const lastDay = new Date(year, month, 0).getDate()
  let count = 0
  for (let d = 1; d <= lastDay; d++) {
    const dayDate = new Date(year, month - 1, d)
    if (dayDate < trackingStart || dayDate > today) continue
    const dow = dayDate.getDay()
    if (dow === 0) continue // Sunday only
    const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`
    if (!holidaySet.has(dateStr)) count++
  }
  return count
}
