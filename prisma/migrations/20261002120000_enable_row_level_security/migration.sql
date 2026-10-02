-- The app talks to Postgres directly (as the table owner, which bypasses RLS).
-- On Supabase, every table in "public" is also exposed through the auto-generated
-- REST/GraphQL APIs to the anon/authenticated roles. Enabling RLS with no policies
-- denies those APIs entirely, so seller phones, sessions and hashes are never
-- reachable with the project's public key. Harmless on plain Postgres.
ALTER TABLE "sellers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "seller_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "otp_challenges" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "kyc_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "admin_users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "admin_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "admin_login_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "properties" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "property_images" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "enquiries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "whatsapp_conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "whatsapp_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "analytics_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
