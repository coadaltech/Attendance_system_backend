import { Elysia, t } from 'elysia'
import { authMiddleware } from '../middleware/auth'
import { db } from '../db'
import { announcements } from '../db/schema'
import { eq, gt, desc } from 'drizzle-orm'

export const announcementRoutes = new Elysia({ prefix: '/announcements' })
  .use(authMiddleware)
  // Everyone: only currently active announcements — powers both dashboards
  .get('/active', async () => {
    return await db.select().from(announcements)
      .where(gt(announcements.expiresAt, new Date()))
      .orderBy(desc(announcements.createdAt))
  })
  // Admin: full history (active + expired) for the management panel
  .get('/', async ({ user, set }) => {
    if (user.role !== 'admin') { set.status = 403; return { error: 'Forbidden' } }
    return await db.select().from(announcements).orderBy(desc(announcements.createdAt))
  })
  // Admin: post a new announcement, visible for durationDays
  .post('/', async ({ body, user, set }) => {
    if (user.role !== 'admin') { set.status = 403; return { error: 'Forbidden' } }
    const expiresAt = new Date(Date.now() + body.durationDays * 24 * 60 * 60 * 1000)
    const [created] = await db.insert(announcements).values({
      title: body.title,
      message: body.message,
      durationDays: body.durationDays,
      createdBy: user.id,
      createdByName: user.name,
      expiresAt,
    }).returning()
    return created
  }, {
    body: t.Object({
      title: t.String({ minLength: 1, maxLength: 150 }),
      message: t.String({ minLength: 1 }),
      durationDays: t.Number({ minimum: 1, maximum: 365 }),
    }),
  })
  // Admin: remove early, independent of expiry
  .delete('/:id', async ({ params, user, set }) => {
    if (user.role !== 'admin') { set.status = 403; return { error: 'Forbidden' } }
    await db.delete(announcements).where(eq(announcements.id, Number(params.id)))
    return { success: true }
  }, { params: t.Object({ id: t.String() }) })
