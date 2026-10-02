import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Migrations need a session connection (Supabase: session pooler :5432 or direct).
    // The app itself uses DATABASE_URL (Supabase: transaction pooler :6543 on Vercel).
    url: process.env.DIRECT_URL || env("DATABASE_URL"),
  },
});
