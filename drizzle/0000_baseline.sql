CREATE TYPE "public"."attendance_status" AS ENUM('full_day', 'half_day', 'overtime', 'absent', 'holiday', 'weekend', 'on_leave');--> statement-breakpoint
CREATE TYPE "public"."leave_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."leave_type" AS ENUM('sick', 'casual', 'earned', 'wfh');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('admin', 'employee');--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(150) NOT NULL,
	"message" text NOT NULL,
	"created_by" integer,
	"created_by_name" varchar(100) NOT NULL,
	"duration_days" integer NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"date" date NOT NULL,
	"punch_in" timestamp,
	"punch_out" timestamp,
	"working_hours" numeric(5, 2),
	"status" "attendance_status" DEFAULT 'absent' NOT NULL,
	"notes" text,
	"punch_in_lat" numeric(10, 7),
	"punch_in_lng" numeric(10, 7),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"email" varchar(150) NOT NULL,
	"password" text NOT NULL,
	"employee_code" varchar(20) NOT NULL,
	"department" varchar(100),
	"designation" varchar(100),
	"phone" varchar(15),
	"role" "role" DEFAULT 'employee' NOT NULL,
	"join_date" date,
	"is_active" boolean DEFAULT true NOT NULL,
	"avatar" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "employees_email_unique" UNIQUE("email"),
	CONSTRAINT "employees_employee_code_unique" UNIQUE("employee_code")
);
--> statement-breakpoint
CREATE TABLE "holidays" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"is_optional" boolean DEFAULT false NOT NULL,
	"is_approved" boolean DEFAULT false NOT NULL,
	CONSTRAINT "holidays_date_unique" UNIQUE("date")
);
--> statement-breakpoint
CREATE TABLE "leave_balances" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"year" integer NOT NULL,
	"sick_leave" integer DEFAULT 12 NOT NULL,
	"sick_used" integer DEFAULT 0 NOT NULL,
	"casual_leave" integer DEFAULT 12 NOT NULL,
	"casual_used" integer DEFAULT 0 NOT NULL,
	"earned_leave" integer DEFAULT 15 NOT NULL,
	"earned_used" integer DEFAULT 0 NOT NULL,
	"wfh_leave" integer DEFAULT 24 NOT NULL,
	"wfh_used" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leaves" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"leave_type" "leave_type" NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"total_days" integer NOT NULL,
	"reason" text NOT NULL,
	"status" "leave_status" DEFAULT 'pending' NOT NULL,
	"approved_by" integer,
	"approved_at" timestamp,
	"rejection_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaves" ADD CONSTRAINT "leaves_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaves" ADD CONSTRAINT "leaves_approved_by_employees_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "announcements_expires_idx" ON "announcements" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "att_emp_date_idx" ON "attendance" USING btree ("employee_id","date");--> statement-breakpoint
CREATE INDEX "att_date_idx" ON "attendance" USING btree ("date");--> statement-breakpoint
CREATE INDEX "lb_emp_year_idx" ON "leave_balances" USING btree ("employee_id","year");--> statement-breakpoint
CREATE INDEX "leaves_emp_idx" ON "leaves" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "leaves_status_idx" ON "leaves" USING btree ("status");--> statement-breakpoint
CREATE INDEX "push_subs_emp_idx" ON "push_subscriptions" USING btree ("employee_id");