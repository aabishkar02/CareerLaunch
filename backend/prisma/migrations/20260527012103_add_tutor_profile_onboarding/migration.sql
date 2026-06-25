-- CreateTable
CREATE TABLE "tutor_profiles" (
    "id" UUID NOT NULL,
    "tutor_id" UUID NOT NULL,
    "bio" TEXT,
    "qualifications" JSONB NOT NULL DEFAULT '[]',
    "specialisations" JSONB NOT NULL DEFAULT '[]',
    "experience_years" INTEGER NOT NULL DEFAULT 0,
    "linkedin_url" TEXT,
    "github_url" TEXT,
    "rating" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "review_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tutor_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_requests" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "preferred_tutor_id" UUID,
    "schedule_preference" JSONB NOT NULL DEFAULT '{}',
    "goals" JSONB NOT NULL DEFAULT '[]',
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "assigned_tutor_id" UUID,
    "admin_message" TEXT,
    "admin_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "onboarding_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tutor_profiles_tutor_id_key" ON "tutor_profiles"("tutor_id");

-- CreateIndex
CREATE INDEX "onboarding_requests_student_id_idx" ON "onboarding_requests"("student_id");

-- CreateIndex
CREATE INDEX "onboarding_requests_status_idx" ON "onboarding_requests"("status");

-- AddForeignKey
ALTER TABLE "tutor_profiles" ADD CONSTRAINT "tutor_profiles_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_requests" ADD CONSTRAINT "onboarding_requests_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_requests" ADD CONSTRAINT "onboarding_requests_preferred_tutor_id_fkey" FOREIGN KEY ("preferred_tutor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_requests" ADD CONSTRAINT "onboarding_requests_assigned_tutor_id_fkey" FOREIGN KEY ("assigned_tutor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_requests" ADD CONSTRAINT "onboarding_requests_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
