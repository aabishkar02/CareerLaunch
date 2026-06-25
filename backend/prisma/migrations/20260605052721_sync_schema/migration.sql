/*
  Warnings:

  - A unique constraint covering the columns `[username]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "TicketCategory" AS ENUM ('refund_request', 'tutor_change', 'scheduling_issue', 'payment_issue', 'session_complaint', 'general_support', 'other');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('open', 'in_review', 'resolved', 'closed', 'refunded');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('low', 'normal', 'high', 'urgent');

-- DropForeignKey
ALTER TABLE "module_tutors" DROP CONSTRAINT "module_tutors_module_id_fkey";

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "managed_plan_id" UUID;

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "tutor_paid" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tutor_paid_at" TIMESTAMP(3),
ADD COLUMN     "tutor_paid_by" UUID,
ADD COLUMN     "tutor_pay_cents" INTEGER;

-- AlterTable
ALTER TABLE "tutor_profiles" ADD COLUMN     "pay_rate_cents" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "username" VARCHAR(20);

-- CreateTable
CREATE TABLE "module_questions" (
    "id" UUID NOT NULL,
    "module_id" UUID NOT NULL,
    "question" TEXT NOT NULL,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "module_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_questionnaires" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "answer" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_questionnaires_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "module_materials" (
    "id" UUID NOT NULL,
    "module_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "url" TEXT NOT NULL,
    "file_type" VARCHAR(50),
    "type" VARCHAR(20) NOT NULL DEFAULT 'student',
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "module_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "category" "TicketCategory" NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'open',
    "priority" "TicketPriority" NOT NULL DEFAULT 'normal',
    "related_payment_id" UUID,
    "related_tutor_id" UUID,
    "related_session_id" UUID,
    "assigned_admin_id" UUID,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_messages" (
    "id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "is_internal" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modules" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "slug" VARCHAR(200) NOT NULL,
    "short_description" TEXT,
    "full_description" TEXT,
    "thumbnail_url" TEXT,
    "credit_cost" INTEGER NOT NULL DEFAULT 1,
    "category" VARCHAR(100),
    "status" VARCHAR(20) NOT NULL DEFAULT 'unpublished',
    "visibility" VARCHAR(20) NOT NULL DEFAULT 'hidden',
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "tagline" VARCHAR(300),
    "price_cents" INTEGER NOT NULL DEFAULT 0,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'usd',
    "billing_type" VARCHAR(20) NOT NULL DEFAULT 'one_time',
    "whats_included" JSONB NOT NULL DEFAULT '[]',
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "is_recommended" BOOLEAN NOT NULL DEFAULT false,
    "badge_label" VARCHAR(50),
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "stripe_plan_id" VARCHAR(200),
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_modules" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "module_id" UUID NOT NULL,
    "credits_included" INTEGER NOT NULL DEFAULT 1,
    "display_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "plan_modules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "module_questions_module_id_idx" ON "module_questions"("module_id");

-- CreateIndex
CREATE INDEX "session_questionnaires_session_id_idx" ON "session_questionnaires"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "session_questionnaires_session_id_question_id_key" ON "session_questionnaires"("session_id", "question_id");

-- CreateIndex
CREATE INDEX "module_materials_module_id_idx" ON "module_materials"("module_id");

-- CreateIndex
CREATE INDEX "support_tickets_student_id_idx" ON "support_tickets"("student_id");

-- CreateIndex
CREATE INDEX "support_tickets_status_idx" ON "support_tickets"("status");

-- CreateIndex
CREATE INDEX "support_tickets_category_idx" ON "support_tickets"("category");

-- CreateIndex
CREATE INDEX "support_tickets_priority_idx" ON "support_tickets"("priority");

-- CreateIndex
CREATE INDEX "support_tickets_created_at_idx" ON "support_tickets"("created_at" DESC);

-- CreateIndex
CREATE INDEX "support_messages_ticket_id_idx" ON "support_messages"("ticket_id");

-- CreateIndex
CREATE INDEX "support_messages_sender_id_idx" ON "support_messages"("sender_id");

-- CreateIndex
CREATE UNIQUE INDEX "modules_slug_key" ON "modules"("slug");

-- CreateIndex
CREATE INDEX "modules_status_idx" ON "modules"("status");

-- CreateIndex
CREATE INDEX "modules_visibility_idx" ON "modules"("visibility");

-- CreateIndex
CREATE INDEX "modules_display_order_idx" ON "modules"("display_order");

-- CreateIndex
CREATE INDEX "plans_status_idx" ON "plans"("status");

-- CreateIndex
CREATE INDEX "plans_is_recommended_idx" ON "plans"("is_recommended");

-- CreateIndex
CREATE INDEX "plans_display_order_idx" ON "plans"("display_order");

-- CreateIndex
CREATE INDEX "plan_modules_plan_id_idx" ON "plan_modules"("plan_id");

-- CreateIndex
CREATE INDEX "plan_modules_module_id_idx" ON "plan_modules"("module_id");

-- CreateIndex
CREATE UNIQUE INDEX "plan_modules_plan_id_module_id_key" ON "plan_modules"("plan_id", "module_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- AddForeignKey
ALTER TABLE "module_questions" ADD CONSTRAINT "module_questions_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "course_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_questionnaires" ADD CONSTRAINT "session_questionnaires_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_questionnaires" ADD CONSTRAINT "session_questionnaires_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "module_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "module_materials" ADD CONSTRAINT "module_materials_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "course_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_tutor_paid_by_fkey" FOREIGN KEY ("tutor_paid_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_managed_plan_id_fkey" FOREIGN KEY ("managed_plan_id") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "module_tutors" ADD CONSTRAINT "module_tutors_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_assigned_admin_id_fkey" FOREIGN KEY ("assigned_admin_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_related_payment_id_fkey" FOREIGN KEY ("related_payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_related_session_id_fkey" FOREIGN KEY ("related_session_id") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modules" ADD CONSTRAINT "modules_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans" ADD CONSTRAINT "plans_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_modules" ADD CONSTRAINT "plan_modules_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_modules" ADD CONSTRAINT "plan_modules_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "modules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
