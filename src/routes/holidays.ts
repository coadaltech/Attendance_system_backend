import { Elysia, t } from 'elysia'
import { authMiddleware } from '../middleware/auth'
import { db } from '../db'
import { holidays } from '../db/schema'
import { eq, gte, lte, and } from 'drizzle-orm'

export const holidayRoutes = new Elysia({ prefix: '/holidays' })
  .use(authMiddleware)
  // Employees see only approved; admin sees all
  .get('/', async ({ query, user }) => {
    const year = Number(query.year) || new Date().getFullYear()
    const filters = [
      gte(holidays.date, `${year}-01-01`),
      lte(holidays.date, `${year}-12-31`),
    ]
    if (user.role !== 'admin') filters.push(eq(holidays.isApproved, true))
    return await db.select().from(holidays).where(and(...filters))
  }, { query: t.Object({ year: t.Optional(t.String()) }) })

  // Admin: create holiday (starts as unapproved)
  .post('/', async ({ body, user, set }) => {
    if (user.role !== 'admin') { set.status = 403; return { error: 'Forbidden' } }
    const [holiday] = await db.insert(holidays).values({
      ...body,
      isApproved: false,
    }).returning()
    return holiday
  }, {
    body: t.Object({
      date: t.String(), name: t.String(),
      description: t.Optional(t.String()), isOptional: t.Optional(t.Boolean()),
    }),
  })

  // Admin: approve a holiday (makes it visible to employees)
  .patch('/:id/approve', async ({ params, user, set }) => {
    if (user.role !== 'admin') { set.status = 403; return { error: 'Forbidden' } }
    const [updated] = await db.update(holidays)
      .set({ isApproved: true })
      .where(eq(holidays.id, Number(params.id)))
      .returning()
    if (!updated) { set.status = 404; return { error: 'Holiday not found' } }
    return updated
  }, { params: t.Object({ id: t.String() }) })

  // Admin: revoke approval
  .patch('/:id/revoke', async ({ params, user, set }) => {
    if (user.role !== 'admin') { set.status = 403; return { error: 'Forbidden' } }
    const [updated] = await db.update(holidays)
      .set({ isApproved: false })
      .where(eq(holidays.id, Number(params.id)))
      .returning()
    if (!updated) { set.status = 404; return { error: 'Holiday not found' } }
    return updated
  }, { params: t.Object({ id: t.String() }) })

  // Admin: delete a holiday
  .delete('/:id', async ({ params, user, set }) => {
    if (user.role !== 'admin') { set.status = 403; return { error: 'Forbidden' } }
    await db.delete(holidays).where(eq(holidays.id, Number(params.id)))
    return { message: 'Holiday deleted' }
  }, { params: t.Object({ id: t.String() }) })
