import "server-only";
import { redirect } from "next/navigation";
import { getAdminSession } from "./session";

/** For admin pages and server actions: returns the admin or redirects to /admin/login. */
export async function requireAdmin() {
  const admin = await getAdminSession();
  if (!admin) redirect("/admin/login");
  return admin;
}
