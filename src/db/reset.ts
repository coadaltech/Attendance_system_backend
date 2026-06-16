import { db } from './index'
import { attendance, leaves, leaveBalances, holidays, employees } from './schema'
import { sql } from 'drizzle-orm'

async function reset() {
  console.log('Clearing all data...')

  // Order matters — delete child tables before parent
  await db.delete(attendance)
  await db.delete(leaves)
  await db.delete(leaveBalances)
  await db.delete(holidays)
  await db.delete(employees)

  // Reset auto-increment sequences so IDs start from 1 again
  await db.execute(sql`ALTER SEQUENCE attendance_id_seq RESTART WITH 1`)
  await db.execute(sql`ALTER SEQUENCE leaves_id_seq RESTART WITH 1`)
  await db.execute(sql`ALTER SEQUENCE leave_balances_id_seq RESTART WITH 1`)
  await db.execute(sql`ALTER SEQUENCE holidays_id_seq RESTART WITH 1`)
  await db.execute(sql`ALTER SEQUENCE employees_id_seq RESTART WITH 1`)

  console.log('All data cleared. Database is clean.')
  console.log('You can now add your employees from the app.')
  process.exit(0)
}

reset().catch(e => { console.error(e); process.exit(1) })
