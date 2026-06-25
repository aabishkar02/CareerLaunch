-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "course_id" UUID,
ADD COLUMN     "enrollment_id" UUID;

-- AlterTable
ALTER TABLE "student_tutor_assignments" ADD COLUMN     "enrollment_id" UUID;

-- CreateTable
CREATE TABLE "course_tutors" (
    "id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "tutor_id" UUID NOT NULL,
    "assigned_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "course_tutors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tutor_fees" (
    "id" UUID NOT NULL,
    "tutor_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "assignment_id" UUID,
    "amount_cents" INTEGER NOT NULL DEFAULT 0,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'usd',
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "paid_at" TIMESTAMP(3),
    "paid_by" UUID,
    "start_date" DATE NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tutor_fees_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "course_tutors_course_id_idx" ON "course_tutors"("course_id");

-- CreateIndex
CREATE INDEX "course_tutors_tutor_id_idx" ON "course_tutors"("tutor_id");

-- CreateIndex
CREATE UNIQUE INDEX "course_tutors_course_id_tutor_id_key" ON "course_tutors"("course_id", "tutor_id");

-- CreateIndex
CREATE INDEX "tutor_fees_tutor_id_idx" ON "tutor_fees"("tutor_id");

-- CreateIndex
CREATE INDEX "tutor_fees_student_id_idx" ON "tutor_fees"("student_id");

-- CreateIndex
CREATE INDEX "tutor_fees_paid_idx" ON "tutor_fees"("paid");

-- CreateIndex
CREATE INDEX "sessions_course_id_idx" ON "sessions"("course_id");

-- CreateIndex
CREATE INDEX "sessions_enrollment_id_idx" ON "sessions"("enrollment_id");

-- CreateIndex
CREATE INDEX "student_tutor_assignments_enrollment_id_idx" ON "student_tutor_assignments"("enrollment_id");

-- AddForeignKey
ALTER TABLE "student_tutor_assignments" ADD CONSTRAINT "student_tutor_assignments_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_tutors" ADD CONSTRAINT "course_tutors_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_tutors" ADD CONSTRAINT "course_tutors_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_tutors" ADD CONSTRAINT "course_tutors_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_fees" ADD CONSTRAINT "tutor_fees_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_fees" ADD CONSTRAINT "tutor_fees_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_fees" ADD CONSTRAINT "tutor_fees_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_fees" ADD CONSTRAINT "tutor_fees_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "student_tutor_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_fees" ADD CONSTRAINT "tutor_fees_paid_by_fkey" FOREIGN KEY ("paid_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
