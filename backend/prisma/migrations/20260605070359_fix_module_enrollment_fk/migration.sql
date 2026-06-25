-- DropForeignKey
ALTER TABLE "module_enrollments" DROP CONSTRAINT "module_enrollments_course_id_fkey";

-- DropForeignKey
ALTER TABLE "module_enrollments" DROP CONSTRAINT "module_enrollments_module_id_fkey";

-- AlterTable
ALTER TABLE "module_enrollments" ALTER COLUMN "course_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "module_enrollments" ADD CONSTRAINT "module_enrollments_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "modules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
