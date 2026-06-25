-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_plan_id_fkey";

-- AlterTable
ALTER TABLE "payments" ALTER COLUMN "course_id" DROP NOT NULL,
ALTER COLUMN "plan_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "pricing_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
