-- The language a seller chose for the WhatsApp assistant ("en" | "hi"). Additive; null = not chosen yet.
ALTER TABLE "whatsapp_conversations" ADD COLUMN "language" TEXT;
ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_language_check" CHECK ("language" IS NULL OR "language" IN ('en', 'hi'));
