import { Elysia, t } from 'elysia'
import { authMiddleware } from '../middleware/auth'
import { db } from '../db'
import { leaves, leaveBalances, attendance } from '../db/schema'
import { eq, and, gte, lte, desc } from 'drizzle-orm'

export const leaveRoutes = new Elysia({ prefix: '/leave' })
  .use(authMiddleware)
  .get('/balance', async ({ user, query }) => {
    const year = Number(query.year) || new Date().getFullYear()
    const [balance] = await db.select().from(leaveBalances)
      .where(and(eq(leaveBalances.employeeId, user.id), eq(leaveBalances.year, year)))
    return balance || null
  }, { query: t.Object({ year: t.Optional(t.String()) }) })
  .get('/my-leaves', async ({ user, query }) => {
    const year = Number(query.year) || new Date().getFullYear()
    const records = await db.select().from(leaves)
      .where(and(eq(leaves.employeeId, user.id), gte(leaves.startDate, `${year}-01-01`)))
      .orderBy(desc(leaves.createdAt))
    return records
  }, { query: t.Object({ year: t.Optional(t.String()) }) })
  .post('/apply', async ({ user, body, set }) => {
    const { leaveType, startDate, endDate, reason } = body
    const start = new Date(startDate)
    const end = new Date(endDate)
    const totalDays = Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1

    const year = start.getFullYear()
    const [balance] = await db.select().from(leaveBalances)
      .where(and(eq(leaveBalances.employeeId, user.id), eq(leaveBalances.year, year)))

    if (!balance) { set.status = 400; return { error: 'Leave balance not found' } }

    const usedKey = `${leaveType}Used` as keyof typeof balance
    const totalKey = leaveType === 'wfh' ? 'wfhLeave' : `${leaveType}Leave` as keyof typeof balance
    const available = Number(balance[totalKey]) - Number(balance[usedKey])

    if (totalDays > available) {
      set.status = 400
      return { error: `Insufficient ${leaveType} leave balance. Available: ${available} days` }
    }

    const [leave] = await db.insert(leaves).values({
      employeeId: user.id,
      leaveType,
      startDate,
      endDate,
      totalDays,
      reason,
      status: 'pending',
    }).returning()
    return leave
  }, {
    body: t.Object({
      leaveType: t.Union([t.Literal('sick'), t.Literal('casual'), t.Literal('earned'), t.Literal('wfh')]),
      startDate: t.String(),
      endDate: t.String(),
      reason: t.String(),
    }),
  })
  .delete('/:id', async ({ user, params, set }) => {
    const [leave] = await db.select().from(leaves)
      .where(and(eq(leaves.id, Number(params.id)), eq(leaves.employeeId, user.id)))
    if (!leave) { set.status = 404; return { error: 'Leave not found' } }
    if (leave.status !== 'pending') { set.status = 400; return { error: 'Only pending leaves can be cancelled' } }
    await db.delete(leaves).where(eq(leaves.id, Number(params.id)))
    return { message: 'Leave cancelled' }
  }, { params: t.Object({ id: t.String() }) })
  .get('/all', async ({ user, set }) => {
    if (user.role !== 'admin') { set.status = 403; return { error: 'Forbidden' } }
    const records = await db.query.leaves.findMany({
      with: { employee: { columns: { name: true, employeeCode: true, department: true } } },
      orderBy: [desc(leaves.createdAt)],
    })
    return records
  })
  .patch('/:id/approve', async ({ user, params, set }) => {
    if (user.role !== 'admin') { set.status = 403; return { error: 'Forbidden' } }
    const [leave] = await db.select().from(leaves).where(eq(leaves.id, Number(params.id)))
    if (!leave) { set.status = 404; return { error: 'Leave not found' } }
    if (leave.status !== 'pending') { set.status = 400; return { error: 'Leave already processed' } }

    const [updated] = await db.update(leaves).set({
      status: 'approved',
      approvedBy: user.id,
      approvedAt: new Date(),
    }).where(eq(leaves.id, Number(params.id))).returning()

    const year = new Date(leave.startDate).getFullYear()
    const [balance] = await db.select().from(leaveBalances)
      .where(and(eq(leaveBalances.employeeId, leave.employeeId), eq(leaveBalances.year, year)))

    if (balance) {
      const usedMap: Record<string, keyof typeof balance> = {
        sick: 'sickUsed', casual: 'casualUsed', earned: 'earnedUsed', wfh: 'wfhUsed',
      }
      const usedKey = usedMap[leave.leaveType]
      await db.update(leaveBalances).set({
        [usedKey]: Number(balance[usedKey]) + leave.totalDays,
      }).where(eq(leaveBalances.id, balance.id))
    }

    const start = new Date(leave.startDate)
    const end = new Date(leave.endDate)
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0]
      const dayOfWeek = d.getDay()
      if (dayOfWeek === 0 || dayOfWeek === 6) continue

      const existing = await db.select().from(attendance)
        .where(and(eq(attendance.employeeId, leave.employeeId), eq(attendance.date, dateStr)))

      if (existing.length === 0) {
        await db.insert(attendance).values({
          employeeId: leave.employeeId,
          date: dateStr,
          status: leave.leaveType === 'wfh' ? 'full_day' : 'absent',
          notes: `${leave.leaveType.toUpperCase()} leave approved`,
        })
      }
    }

    return updated
  }, { params: t.Object({ id: t.String() }) })
  .patch('/:id/reject', async ({ user, params, body, set }) => {
    if (user.role !== 'admin') { set.status = 403; return { error: 'Forbidden' } }
    const [updated] = await db.update(leaves).set({
      status: 'rejected',
      approvedBy: user.id,
      approvedAt: new Date(),
      rejectionReason: body.reason,
    }).where(eq(leaves.id, Number(params.id))).returning()
    return updated
  }, {
    params: t.Object({ id: t.String() }),
    body: t.Object({ reason: t.String() }),
  })
  // Admin: get leave balance for any employee
  .get('/balance/:employeeId', async ({ user, params, query, set }) => {
    if (user.role !== 'admin') { set.status = 403; return { error: 'Forbidden' } }
    const year = Number(query.year) || new Date().getFullYear()
    const [balance] = await db.select().from(leaveBalances)
      .where(and(eq(leaveBalances.employeeId, Number(params.employeeId)), eq(leaveBalances.year, year)))
    return balance || null
  }, {
    params: t.Object({ employeeId: t.String() }),
    query: t.Object({ year: t.Optional(t.String()) }),
  })
  // Admin: set leave allocation for any employee
  .put('/balance/:employeeId', async ({ user, params, body, set }) => {
    if (user.role !== 'admin') { set.status = 403; return { error: 'Forbidden' } }
    const empId = Number(params.employeeId)
    const year = body.year || new Date().getFullYear()
    const [existing] = await db.select().from(leaveBalances)
      .where(and(eq(leaveBalances.employeeId, empId), eq(leaveBalances.year, year)))

    if (existing) {
      const [updated] = await db.update(leaveBalances).set({
        sickLeave: body.sickLeave,
        casualLeave: body.casualLeave,
        earnedLeave: body.earnedLeave,
        wfhLeave: body.wfhLeave,
      }).where(eq(leaveBalances.id, existing.id)).returning()
      return updated
    }
    const [created] = await db.insert(leaveBalances).values({
      employeeId: empId, year,
      sickLeave: body.sickLeave, casualLeave: body.casualLeave,
      earnedLeave: body.earnedLeave, wfhLeave: body.wfhLeave,
    }).returning()
    return created
  }, {
    params: t.Object({ employeeId: t.String() }),
    body: t.Object({
      sickLeave: t.Number(), casualLeave: t.Number(),
      earnedLeave: t.Number(), wfhLeave: t.Number(),
      year: t.Optional(t.Number()),
    }),
  })
