/**
 * Creates (or updates) an admin account. Safe to run anywhere, including
 * production — it only touches the admin_users table.
 *
 *   pnpm db:create-admin <email> <name> <password>
 *   pnpm db:create-admin admin@plots.local "Plots Admin" plots-admin-123
 *
 * Re-running for an existing email updates the name and password and
 * re-activates the account. ADMIN_RESET_MFA=true also turns off two-step
 * sign-in (for an admin who lost both their phone and recovery codes).
 *
 * Leave the password out and the script asks for it (hidden, typed twice), so
 * it never lands in shell history. ADMIN_PASSWORD or a third argument also work.
 * It prints which database host it is about to change before touching it.
 */
import "dotenv/config";
import { createInterface } from "node:readline";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { hashSecret } from "../src/lib/scrypt-hash";

const MIN_PASSWORD_LENGTH = 12;

/** Reads one line from the terminal without echoing it. */
function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
    // The prompt is already printed; from here on, swallow the echo of typed characters.
    (rl as unknown as { _writeToOutput: (text: string) => void })._writeToOutput = () => {};
  });
}

function databaseHost(url: string | undefined): string {
  try {
    return url ? new URL(url).host : "(DATABASE_URL is not set)";
  } catch {
    return "(DATABASE_URL is not a valid URL — percent-encode special characters in the password)";
  }
}

async function main() {
  const [rawEmail, rawName, argPassword] = process.argv.slice(2);
  const email = rawEmail?.trim().toLowerCase();
  const name = rawName?.trim();

  if (!email || !name) {
    console.error('Usage: pnpm db:create-admin <email> "<name>"   (the password is asked for)');
    process.exitCode = 1;
    return;
  }
  console.log(`Database: ${databaseHost(process.env.DATABASE_URL)}`);

  let password = argPassword ?? process.env.ADMIN_PASSWORD;
  if (!password) {
    if (!process.stdin.isTTY) {
      console.error("No password given. Run this in a terminal, or set ADMIN_PASSWORD.");
      process.exitCode = 1;
      return;
    }
    password = await askHidden(`New password for ${email} (hidden, ${MIN_PASSWORD_LENGTH}+ characters): `);
    if (password.length >= MIN_PASSWORD_LENGTH && (await askHidden("Type it again: ")) !== password) {
      console.error("The two passwords don't match. Nothing was changed.");
      process.exitCode = 1;
      return;
    }
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
