import { Elysia } from 'elysia'

// user is already resolved globally in index.ts — this is just a guard
export const authMiddleware = new Elysia()
  .onBeforeHandle(({ user, set }: any) => {
    if (!user) {
      set.status = 401
      return { error: 'Unauthorized' }
    }
  })

export const adminMiddleware = new Elysia()
  .use(authMiddleware)
  .onBeforeHandle(({ user, set }: any) => {
    if (user?.role !== 'admin') {
      set.status = 403
      return { error: 'Forbidden: Admin access required' }
    }
  })
