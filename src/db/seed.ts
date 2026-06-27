import { db } from './index'
import { employees, leaveBalances, holidays } from './schema'
import bcrypt from 'bcryptjs'

 async function seed() {
  console.log('Seeding database...')

  const hashedPassword = await bcrypt.hash('password123', 10)

  const [admin] = await db.insert(employees).values({
    name: 'Admin User',
    email: 'admin@coadal.com',
    password: hashedPassword,
    employeeCode: 'CT-001',
    department: 'Management',
    designation: 'HR Manager',
    phone: '9876543210',
    role: 'admin',
    joinDate: '2023-01-01',
  }).returning()

  const [emp1] = await db.insert(employees).values({
    name: 'Rahul Sharma',
    email: 'rahul@coadal.com',
    password: hashedPassword,
    employeeCode: 'CT-002',
    department: 'Engineering',
    designation: 'Software Engineer',
    phone: '9876543211',
    role: 'employee',
    joinDate: '2023-06-01',
  }).returning()

  const [emp2] = await db.insert(employees).values({
    name: 'Priya Patel',
    email: 'priya@coadal.com',
    password: hashedPassword,
    employeeCode: 'CT-003',
    department: 'Design',
    designation: 'UI/UX Designer',
    phone: '9876543212',
    role: 'employee',
    joinDate: '2024-01-15',
  }).returning()

  const year = new Date().getFullYear()
  for (const emp of [admin, emp1, emp2]) {
    await db.insert(leaveBalances).values({ employeeId: emp.id, year })
  }

  await db.insert(holidays).values([
    { date: `${year}-01-01`, name: "New Year's Day" },
    { date: `${year}-01-14`, name: 'Makar Sankranti' },
    { date: `${year}-01-26`, name: 'Republic Day' },
    { date: `${year}-02-26`, name: 'Maha Shivratri' },
    { date: `${year}-03-14`, name: 'Holi' },
    { date: `${year}-03-30`, name: 'Ram Navami' },
    { date: `${year}-03-31`, name: 'Eid ul-Fitr' },
    { date: `${year}-04-03`, name: 'Good Friday' },
    { date: `${year}-04-14`, name: 'Dr. Ambedkar Jayanti' },
    { date: `${year}-06-07`, name: 'Eid ul-Adha (Bakrid)' },
    { date: `${year}-06-27`, name: 'Muharram' },
    { date: `${year}-08-15`, name: 'Independence Day' },
    { date: `${year}-08-17`, name: 'Janmashtami' },
    { date: `${year}-08-27`, name: 'Ganesh Chaturthi' },
    { date: `${year}-10-01`, name: 'Dussehra' },
    { date: `${year}-10-02`, name: 'Gandhi Jayanti' },
    { date: `${year}-10-20`, name: 'Diwali' },
    { date: `${year}-11-03`, name: 'Guru Nanak Jayanti' },
    { date: `${year}-12-25`, name: 'Christmas' },
  ])

  console.log('Seeding complete!')
  console.log('Admin: admin@coadal.com / password123')
  console.log('Employee: rahul@coadal.com / password123')
  process.exit(0)
}

seed().catch(console.error)
