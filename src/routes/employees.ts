import { Elysia, t } from 'elysia'
import { authMiddleware } from '../middleware/auth'
import { db } from '../db'
import { employees, leaveBalances, attendance, leaves } from '../db/schema'
import { eq, ne, sql } from 'drizzle-orm'
import bcrypt from 'bcryptjs'

export const employeeRoutes = new Elysia({ prefix: '/employees' })
  .use(authMiddleware)
  .get('/', async ({ user, set }) => {
    if (user.role !== 'admin') { set.status = 403; return { error: 'Forbidden' } }
    return await db.select({
      id: employees.id, name: employees.name, email: employees.email,
      employeeCode: employees.employeeCode, department: employees.department,
      designation: employees.designation, phone: employees.phone, role: employees.role,
      joinDate: employees.joinDate, isActive: employees.isActive, avatar: employees.avatar,
    }).from(employees)
  })
  .get('/me', async ({ user }) => {
    const [emp] = await db.select({
      id: employees.id, name: employees.name, email: employees.email,
      employeeCode: employees.employeeCode, department: employees.department,
      designation: employees.designation, phone: employees.phone, role: employees.role,
      joinDate: employees.joinDate, avatar: employees.avatar,
    }).from(employees).where(eq(employees.id, user.id))
    return emp
  })
  .get('/:id', async ({ params, user, set }) => {
    if (user.role !== 'admin' && user.id !== Number(params.id)) { set.status = 403; return { error: 'Forbidden' } }
    const [emp] = await db.select({
      id: employees.id, name: employees.name, email: employees.email,
      employeeCode: employees.employeeCode, department: employees.department,
      designation: employees.designation, phone: employees.phone, role: employees.role,
      joinDate: employees.joinDate, isActive: employees.isActive, avatar: employees.avatar,
    }).from(employees).where(eq(employees.id, Number(params.id)))
    return emp || null
  }, { params: t.Object({ id: t.String() }) })
  .post('/', async ({ body, user, set }) => {
    if (user.role !== 'admin') { set.status = 403; return { error: 'Forbidden' } }
    const { name, email, password, employeeCode, department, designation, phone, role, joinDate } = body
    const hashed = await bcrypt.hash(password, 10)
    const [emp] = await db.insert(employees).values({
      name, email, password: hashed, employeeCode,
      department, designation, phone, role: role as any, joinDate,
    }).returning()

    const year = new Date().getFullYear()
    await db.insert(leaveBalances).values({ employeeId: emp.id, year })

    return { id: emp.id, name: emp.name, email: emp.email, employeeCode: emp.employeeCode, role: emp.role }
  }, {
    body: t.Object({
      name: t.String(), email: t.String(), password: t.String(),
      employeeCode: t.String(), department: t.Optional(t.String()),
      designation: t.Optional(t.String()), phone: t.Optional(t.String()),
      role: t.Optional(t.String()), joinDate: t.Optional(t.String()),
    }),
  })
  .put('/:id', async ({ params, body, user, set }) => {
    if (user.role !== 'admin' && user.id !== Number(params.id)) { set.status = 403; return { error: 'Forbidden' } }
    const { name, email, employeeCode, department, designation, phone, role, joinDate, isActive, avatar, password } = body
    const changes: Record<string, any> = { updatedAt: new Date() }
    if (name !== undefined)        changes.name = name
    if (department !== undefined)  changes.department = department
    if (designation !== undefined) changes.designation = designation
    if (phone !== undefined)       changes.phone = phone
    if (avatar !== undefined)      changes.avatar = avatar
    if (user.role === 'admin') {
      if (email !== undefined)       changes.email = email
      if (employeeCode !== undefined) changes.employeeCode = employeeCode
      if (role !== undefined)        changes.role = role
      if (joinDate !== undefined)    changes.joinDate = joinDate
      if (isActive !== undefined)    changes.isActive = isActive
      if (password)                  changes.password = await bcrypt.hash(password, 10)
    }
    const [updated] = await db.update(employees).set(changes)
      .where(eq(employees.id, Number(params.id))).returning()
    const { password: _, ...safe } = updated
    return safe
  }, {
    params: t.Object({ id: t.String() }),
    body: t.Object({
      name: t.Optional(t.String()), email: t.Optional(t.String()),
      employeeCode: t.Optional(t.String()), department: t.Optional(t.String()),
      designation: t.Optional(t.String()), phone: t.Optional(t.String()),
      role: t.Optional(t.String()), joinDate: t.Optional(t.String()),
      isActive: t.Optional(t.Boolean()), avatar: t.Optional(t.String()),
      password: t.Optional(t.String()),
    }),
  })
  .patch('/:id/toggle', async ({ params, user, set }) => {
    if (user.role !== 'admin') { set.status = 403; return { error: 'Forbidden' } }
    const [emp] = await db.select().from(employees).where(eq(employees.id, Number(params.id)))
    if (!emp) { set.status = 404; return { error: 'Employee not found' } }
    const [updated] = await db.update(employees)
      .set({ isActive: !emp.isActive, updatedAt: new Date() })
      .where(eq(employees.id, Number(params.id))).returning()
    return { isActive: updated.isActive }
  }, { params: t.Object({ id: t.String() }) })
  .delete('/reset-all', async ({ user, set }) => {
    if (user.role !== 'admin') { set.status = 403; return { error: 'Forbidden' } }
    await db.delete(attendance)
    await db.delete(leaves)
    await db.delete(leaveBalances)
    await db.delete(employees).where(ne(employees.id, user.id))
    await db.execute(sql`SELECT setval('attendance_id_seq', 1, false)`)
    await db.execute(sql`SELECT setval('leaves_id_seq', 1, false)`)
    await db.execute(sql`SELECT setval('leave_balances_id_seq', 1, false)`)
    return { success: true }
  })
