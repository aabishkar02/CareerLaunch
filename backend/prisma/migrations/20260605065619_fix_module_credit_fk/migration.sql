-- DropForeignKey
ALTER TABLE "module_credits" DROP CONSTRAINT "module_credits_module_id_fkey";

-- AddForeignKey
ALTER TABLE "module_credits" ADD CONSTRAINT "module_credits_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "modules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
