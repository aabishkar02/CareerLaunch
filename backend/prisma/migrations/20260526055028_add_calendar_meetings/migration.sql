-- CreateTable
CREATE TABLE "tutor_busy_slots" (
    "id" UUID NOT NULL,
    "tutor_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "start_time" VARCHAR(5) NOT NULL,
    "end_time" VARCHAR(5) NOT NULL,
    "reason" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tutor_busy_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_meeting_links" (
    "id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "tutor_id" UUID,
    "title" VARCHAR(200) NOT NULL,
    "link" TEXT NOT NULL,
    "description" TEXT,
    "scheduled_at" TIMESTAMP(3),
    "recurring" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_meeting_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tutor_busy_slots_tutor_id_idx" ON "tutor_busy_slots"("tutor_id");

-- CreateIndex
CREATE INDEX "tutor_busy_slots_date_idx" ON "tutor_busy_slots"("date");

-- CreateIndex
CREATE INDEX "course_meeting_links_course_id_idx" ON "course_meeting_links"("course_id");

-- AddForeignKey
ALTER TABLE "tutor_busy_slots" ADD CONSTRAINT "tutor_busy_slots_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_meeting_links" ADD CONSTRAINT "course_meeting_links_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_meeting_links" ADD CONSTRAINT "course_meeting_links_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
