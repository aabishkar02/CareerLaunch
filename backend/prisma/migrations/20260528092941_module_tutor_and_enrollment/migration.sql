-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "module_id" UUID;

-- CreateTable
CREATE TABLE "module_tutors" (
    "id" UUID NOT NULL,
    "module_id" UUID NOT NULL,
    "tutor_id" UUID NOT NULL,
    "assigned_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "module_tutors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "module_enrollments" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "module_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "payment_id" UUID,
    "tutor_id" UUID,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'active',
    "enrolled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "module_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "module_tutors_module_id_idx" ON "module_tutors"("module_id");

-- CreateIndex
CREATE INDEX "module_tutors_tutor_id_idx" ON "module_tutors"("tutor_id");

-- CreateIndex
CREATE UNIQUE INDEX "module_tutors_module_id_tutor_id_key" ON "module_tutors"("module_id", "tutor_id");

-- CreateIndex
CREATE INDEX "module_enrollments_student_id_idx" ON "module_enrollments"("student_id");

-- CreateIndex
CREATE INDEX "module_enrollments_module_id_idx" ON "module_enrollments"("module_id");

-- CreateIndex
CREATE INDEX "module_enrollments_course_id_idx" ON "module_enrollments"("course_id");

-- CreateIndex
CREATE INDEX "module_enrollments_tutor_id_idx" ON "module_enrollments"("tutor_id");

-- CreateIndex
CREATE UNIQUE INDEX "module_enrollments_student_id_module_id_key" ON "module_enrollments"("student_id", "module_id");

-- CreateIndex
CREATE INDEX "sessions_module_id_idx" ON "sessions"("module_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "course_modules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "module_tutors" ADD CONSTRAINT "module_tutors_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "course_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "module_tutors" ADD CONSTRAINT "module_tutors_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "module_tutors" ADD CONSTRAINT "module_tutors_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "module_enrollments" ADD CONSTRAINT "module_enrollments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "module_enrollments" ADD CONSTRAINT "module_enrollments_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "course_modules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "module_enrollments" ADD CONSTRAINT "module_enrollments_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "module_enrollments" ADD CONSTRAINT "module_enrollments_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "module_enrollments" ADD CONSTRAINT "module_enrollments_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
