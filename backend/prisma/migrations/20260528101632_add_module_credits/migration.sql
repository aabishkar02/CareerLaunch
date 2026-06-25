-- CreateTable
CREATE TABLE "module_credits" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "module_id" UUID NOT NULL,
    "credits_granted" INTEGER NOT NULL DEFAULT 5,
    "credits_used" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "module_credits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "module_credits_student_id_idx" ON "module_credits"("student_id");

-- CreateIndex
CREATE INDEX "module_credits_module_id_idx" ON "module_credits"("module_id");

-- CreateIndex
CREATE UNIQUE INDEX "module_credits_student_id_module_id_key" ON "module_credits"("student_id", "module_id");

-- AddForeignKey
ALTER TABLE "module_credits" ADD CONSTRAINT "module_credits_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "module_credits" ADD CONSTRAINT "module_credits_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "course_modules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
