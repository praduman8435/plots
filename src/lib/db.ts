import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// One client per process. In dev, hot reload would otherwise open a new pool on every edit.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const int = (name: string, fallback: number) => {
  const n = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/**
 * Each Vercel function instance has its own small pool; Supabase's pooler
 * (Supavisor) multiplexes them onto real Postgres connections. Small pools +
 * bounded waits keep a traffic spike from exhausting the pooler, and the
 * statement timeout stops one runaway query from holding a function (and a
 * connection) until the platform kills it. All overridable via env.
 */
function createClient() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    max: int("DB_POOL_MAX", process.env.NODE_ENV === "production" ? 5 : 10),
    connectionTimeoutMillis: int("DB_CONNECT_TIMEOUT_MS", 5_000),
    idleTimeoutMillis: int("DB_IDLE_TIMEOUT_MS", 10_000),
    statement_timeout: int("DB_STATEMENT_TIMEOUT_MS", 15_000),
  });
  return new PrismaClient({ adapter });
}

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
