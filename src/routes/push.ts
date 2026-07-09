import { Elysia, t } from 'elysia'
import { authMiddleware } from '../middleware/auth'
import { db } from '../db'
import { pushSubscriptions, employees } from '../db/schema'
import { eq, and } from 'drizzle-orm'
import webpush from 'web-push'

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
)

export const pushRoutes = new Elysia({ prefix: '/push' })
  .use(authMiddleware)
  // Save (or refresh) this device's subscription for the logged-in employee
  .post('/subscribe', async ({ user, body }) => {
    await db.insert(pushSubscriptions).values({
      employeeId: user.id,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
    }).onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { employeeId: user.id, p256dh: body.keys.p256dh, auth: body.keys.auth },
    })
    return { success: true }
  }, {
    body: t.Object({
      endpoint: t.String(),
      keys: t.Object({ p256dh: t.String(), auth: t.String() }),
    }),
  })
  // Drop this device's subscription (e.g. user turned notifications off)
  .post('/unsubscribe', async ({ user, body }) => {
    await db.delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.endpoint, body.endpoint), eq(pushSubscriptions.employeeId, user.id)))
    return { success: true }
  }, { body: t.Object({ endpoint: t.String() }) })

// Sends to every active employee's subscribed devices, pruning subscriptions
// the browser has revoked (404/410) as it goes.
export async function sendPushToAllActive(payload: { title: string; body: string }) {
  const subs = await db.select({
    id: pushSubscriptions.id,
    endpoint: pushSubscriptions.endpoint,
    p256dh: pushSubscriptions.p256dh,
    auth: pushSubscriptions.auth,
  }).from(pushSubscriptions)
    .innerJoin(employees, eq(pushSubscriptions.employeeId, employees.id))
    .where(eq(employees.isActive, true))

  await Promise.all(subs.map(async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
      )
    } catch (err: any) {
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id))
      } else {
        console.error('[Push] failed to send to', sub.endpoint, err?.message || err)
      }
    }
  }))
}

export async function sendPunchInReminder() {
  await sendPushToAllActive({
    title: 'Punch-in reminder',
    body: 'Please punch in now — before 10:15 AM.',
  })
}
