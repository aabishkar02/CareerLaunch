-- CreateEnum
CREATE TYPE "SupportChatStatus" AS ENUM ('waiting', 'active', 'closed');

-- CreateTable
CREATE TABLE "help_chats" (
    "id" UUID NOT NULL,
    "requester_id" UUID NOT NULL,
    "admin_id" UUID,
    "status" "SupportChatStatus" NOT NULL DEFAULT 'waiting',
    "subject" VARCHAR(200),
    "last_message_at" TIMESTAMP(3),
    "claimed_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "closed_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "help_chats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "help_chat_messages" (
    "id" UUID NOT NULL,
    "chat_id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "help_chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "help_chats_requester_id_idx" ON "help_chats"("requester_id");

-- CreateIndex
CREATE INDEX "help_chats_admin_id_idx" ON "help_chats"("admin_id");

-- CreateIndex
CREATE INDEX "help_chats_status_idx" ON "help_chats"("status");

-- CreateIndex
CREATE INDEX "help_chats_created_at_idx" ON "help_chats"("created_at" DESC);

-- CreateIndex
CREATE INDEX "help_chat_messages_chat_id_idx" ON "help_chat_messages"("chat_id");

-- CreateIndex
CREATE INDEX "help_chat_messages_sent_at_idx" ON "help_chat_messages"("sent_at" DESC);

-- AddForeignKey
ALTER TABLE "help_chats" ADD CONSTRAINT "help_chats_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "help_chats" ADD CONSTRAINT "help_chats_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "help_chats" ADD CONSTRAINT "help_chats_closed_by_fkey" FOREIGN KEY ("closed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "help_chat_messages" ADD CONSTRAINT "help_chat_messages_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "help_chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "help_chat_messages" ADD CONSTRAINT "help_chat_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
