import "server-only";
import { redirect } from "next/navigation";
import { getSellerSession } from "./session";

/** For seller pages and server actions: returns the seller or redirects to /seller. */
export async function requireSeller() {
  const seller = await getSellerSession();
  if (!seller) redirect("/seller/login");
  return seller;
}
