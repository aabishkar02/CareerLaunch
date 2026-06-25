-- Drop old unique constraint (one review per student-tutor pair)
DROP INDEX IF EXISTS "tutor_reviews_tutor_id_student_id_key";

-- Add session_id column (nullable for backward compat with existing rows)
ALTER TABLE "tutor_reviews" ADD COLUMN "session_id" UUID;

-- Add unique constraint so each session can only be rated once
CREATE UNIQUE INDEX "tutor_reviews_session_id_key" ON "tutor_reviews"("session_id") WHERE "session_id" IS NOT NULL;

-- Add foreign key to sessions table
ALTER TABLE "tutor_reviews" ADD CONSTRAINT "tutor_reviews_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
