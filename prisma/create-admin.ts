/**
 * Creates (or updates) an admin account. Safe to run anywhere, including
 * production — it only touches the admin_users table.
 *
 *   pnpm db:create-admin <email> <name> <password>
 *   pnpm db:create-admin admin@plots.local "Plots Admin" plots-admin-123
 *
 * Re-running for an existing email updates the name and password and
 * re-activates the account. ADMIN_RESET_MFA=true also turns off two-step
 * sign-in (for an admin who lost both their phone and recovery codes). The password is never printed by this script
 * (pnpm echoes the command line, so on shared machines pass it via the
 * ADMIN_PASSWORD environment variable and omit the third argument).
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { hashSecret } from "../src/lib/scrypt-hash";

const MIN_PASSWORD_LENGTH = 12;

async function main() {
  const [rawEmail, rawName, argPassword] = process.argv.slice(2);
  const password = argPassword ?? process.env.ADMIN_PASSWORD;
  const email = rawEmail?.trim().toLowerCase();
  const name = rawName?.trim();

  if (!email || !name || !password) {
    console.error('Usage: pnpm db:create-admin <email> "<name>" <password>');
    process.exitCode = 1;
    return;
  }
  if (!/^[^\s@]+@[^\s@]+$/.test(email)) {
    console.error("That doesn't look like an email address.");
    process.exitCode = 1;
    return;
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(`The password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    process.exitCode = 1;
    return;
  }

  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    const passwordHash = await hashSecret(password);
    const existing = await db.adminUser.findUnique({ where: { email }, select: { id: true } });
    await db.adminUser.upsert({
      where: { email },
      create: { email, name, passwordHash, isActive: true },
      update: {
        name,
        passwordHash,
        isActive: true,
        ...(process.env.ADMIN_RESET_MFA === "true" ? { mfaSecret: null, mfaEnabledAt: null, mfaLastStep: null, mfaRecoveryCodes: [] } : {}),
      },
    });
    if (existing) {
      // A password change signs the admin out everywhere.
      await db.adminSession.deleteMany({ where: { adminUserId: existing.id } });
      console.log(`Updated admin ${email} (name and password; existing sessions signed out).`);
    } else {
      console.log(`Created admin ${email}. Sign in at /admin/login.`);
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
