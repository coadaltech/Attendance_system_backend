import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

const connectionString = process.env.DATABASE_URL!

const client = postgres(connectionString, {
  max: 3,           // Neon free tier: keep connections low
  idle_timeout: 20, // release idle connections after 20s
  connect_timeout: 10,
})
export const db = drizzle(client, { schema })

// Neon free tier sleeps after 5 min — ping every 4 min to keep it warm
setInterval(async () => {
  try { await client`SELECT 1` } catch { /* ignore */ }
}, 4 * 60 * 1000)
