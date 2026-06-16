import { pgTable, serial, varchar, text, timestamp, date, time, integer, decimal, boolean, pgEnum } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

export const roleEnum = pgEnum('role', ['admin', 'employee'])
export const attendanceStatusEnum = pgEnum('attendance_status', ['full_day', 'half_day', 'overtime', 'absent', 'holiday', 'weekend'])
export const leaveTypeEnum = pgEnum('leave_type', ['sick', 'casual', 'earned', 'wfh'])
export const leaveStatusEnum = pgEnum('leave_status', ['pending', 'approved', 'rejected'])

export const employees = pgTable('employees', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  email: varchar('email', { length: 150 }).notNull().unique(),
  password: text('password').notNull(),
  employeeCode: varchar('employee_code', { length: 20 }).notNull().unique(),
  department: varchar('department', { length: 100 }),
  designation: varchar('designation', { length: 100 }),
  phone: varchar('phone', { length: 15 }),
  role: roleEnum('role').default('employee').notNull(),
  joinDate: date('join_date'),
  isActive: boolean('is_active').default(true).notNull(),
  avatar: text('avatar'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const attendance = pgTable('attendance', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id').references(() => employees.id).notNull(),
  date: date('date').notNull(),
  punchIn: timestamp('punch_in'),
  punchOut: timestamp('punch_out'),
  workingHours: decimal('working_hours', { precision: 5, scale: 2 }),
  status: attendanceStatusEnum('status').default('absent').notNull(),
  notes: text('notes'),
  punchInLat: decimal('punch_in_lat', { precision: 10, scale: 7 }),
  punchInLng: decimal('punch_in_lng', { precision: 10, scale: 7 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const leaves = pgTable('leaves', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id').references(() => employees.id).notNull(),
  leaveType: leaveTypeEnum('leave_type').notNull(),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  totalDays: integer('total_days').notNull(),
  reason: text('reason').notNull(),
  status: leaveStatusEnum('status').default('pending').notNull(),
  approvedBy: integer('approved_by').references(() => employees.id),
  approvedAt: timestamp('approved_at'),
  rejectionReason: text('rejection_reason'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const leaveBalances = pgTable('leave_balances', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id').references(() => employees.id).notNull(),
  year: integer('year').notNull(),
  sickLeave: integer('sick_leave').default(12).notNull(),
  sickUsed: integer('sick_used').default(0).notNull(),
  casualLeave: integer('casual_leave').default(12).notNull(),
  casualUsed: integer('casual_used').default(0).notNull(),
  earnedLeave: integer('earned_leave').default(15).notNull(),
  earnedUsed: integer('earned_used').default(0).notNull(),
  wfhLeave: integer('wfh_leave').default(24).notNull(),
  wfhUsed: integer('wfh_used').default(0).notNull(),
})

export const holidays = pgTable('holidays', {
  id: serial('id').primaryKey(),
  date: date('date').notNull().unique(),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  isOptional: boolean('is_optional').default(false).notNull(),
  isApproved: boolean('is_approved').default(false).notNull(),
})

export const employeesRelations = relations(employees, ({ many }) => ({
  attendance: many(attendance),
  leaves: many(leaves),
  leaveBalances: many(leaveBalances),
}))

export const attendanceRelations = relations(attendance, ({ one }) => ({
  employee: one(employees, { fields: [attendance.employeeId], references: [employees.id] }),
}))

export const leavesRelations = relations(leaves, ({ one }) => ({
  employee: one(employees, { fields: [leaves.employeeId], references: [employees.id] }),
  approver: one(employees, { fields: [leaves.approvedBy], references: [employees.id] }),
}))

export type Employee = typeof employees.$inferSelect
export type NewEmployee = typeof employees.$inferInsert
export type Attendance = typeof attendance.$inferSelect
export type NewAttendance = typeof attendance.$inferInsert
export type Leave = typeof leaves.$inferSelect
export type NewLeave = typeof leaves.$inferInsert
export type LeaveBalance = typeof leaveBalances.$inferSelect
export type Holiday = typeof holidays.$inferSelect
