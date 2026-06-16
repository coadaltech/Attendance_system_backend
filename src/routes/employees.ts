import { Elysia, t } from 'elysia'
import { authMiddleware } from '../middleware/auth'
import { db } from '../db'
import { employees, leaveBalances } from '../db/schema'
import { eq } from 'drizzle-orm'
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
    const { name, department, designation, phone, avatar } = body
    const [updated] = await db.update(employees)
      .set({ name, department, designation, phone, avatar, updatedAt: new Date() })
      .where(eq(employees.id, Number(params.id))).returning()
    return updated
  }, {
    params: t.Object({ id: t.String() }),
    body: t.Object({
      name: t.Optional(t.String()), department: t.Optional(t.String()),
      designation: t.Optional(t.String()), phone: t.Optional(t.String()),
      avatar: t.Optional(t.String()),
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
