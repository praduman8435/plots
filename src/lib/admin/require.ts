import "server-only";
import { redirect } from "next/navigation";
import { isAdminMfaRequired } from "./mfa";
import { getAdminSession } from "./session";

/**
 * For admin pages and server actions: returns the admin or redirects to
 * /admin/login. With ADMIN_REQUIRE_MFA=true, an admin who hasn't turned on
 * two-step sign-in is sent to /admin/security until they do.
 */
export async function requireAdmin() {
  const admin = await getAdminSession();
  if (!admin) redirect("/admin/login");
  if (isAdminMfaRequired() && !admin.mfaEnabledAt) redirect("/admin/security?required=1");
  return admin;
}

/** Only for /admin/security itself: signed in, two-step not yet required. */
export async function requireAdminSession() {
  const admin = await getAdminSession();
  if (!admin) redirect("/admin/login");
  return admin;
}
