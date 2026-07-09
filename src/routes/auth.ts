import { Elysia, t } from 'elysia'
import { db } from '../db'
import { employees } from '../db/schema'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'

export const authRoutes = new Elysia({ prefix: '/auth' })
  // jwt is already registered globally in index.ts — no need to re-register here
  .post('/login', async ({ body, jwt, set }) => {
    const { email, password } = body
    const [employee] = await db.select().from(employees).where(eq(employees.email, email))

    if (!employee || !employee.isActive) {
      set.status = 401
      return { error: 'Invalid credentials' }
    }

    const valid = await bcrypt.compare(password, employee.password)
    if (!valid) {
      set.status = 401
      return { error: 'Invalid credentials' }
    }

    const token = await jwt.sign({
      id: employee.id,
      email: employee.email,
      role: employee.role,
      name: employee.name,
    })

    return {
      token,
      employee: {
        id: employee.id,
        name: employee.name,
        email: employee.email,
        role: employee.role,
        employeeCode: employee.employeeCode,
        department: employee.department,
        designation: employee.designation,
        avatar: employee.avatar,
      },
    }
  }, {
    body: t.Object({ email: t.String(), password: t.String() }),
  })
  .post('/change-password', async ({ body, user, set }) => {
    if (!user) { set.status = 401; return { error: 'Unauthorized' } }
    const { oldPassword, newPassword } = body
    const [employee] = await db.select().from(employees).where(eq(employees.id, user.id))
    if (!employee) { set.status = 404; return { error: 'Employee not found' } }

    const valid = await bcrypt.compare(oldPassword, employee.password)
    if (!valid) { set.status = 400; return { error: 'Old password is incorrect' } }

    const hashed = await bcrypt.hash(newPassword, 10)
    await db.update(employees).set({ password: hashed, updatedAt: new Date() }).where(eq(employees.id, user.id))
    return { message: 'Password changed successfully' }
  }, {
    body: t.Object({ oldPassword: t.String(), newPassword: t.String() }),
  })
