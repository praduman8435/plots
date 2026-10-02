import { getAdminSession } from "@/lib/admin/session";
import { getSellerSession } from "@/lib/seller/session";
import { MAX_UPLOAD_BYTES, isAllowedImageType, saveImage } from "@/server/storage";

/**
 * Photo upload for the listing form (admin and seller portal). Multipart
 * `file` → stored, re-encoded WebP → `{ url, width, height }`.
 * Needs a signed-in admin or seller.
 */
export async function POST(request: Request) {
  // Same-origin only (session cookies are SameSite=Lax; this is defence in depth).
  if (!isSameOrigin(request)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const [admin, seller] = await Promise.all([getAdminSession(), getSellerSession()]);
  if (!admin && !seller) return Response.json({ error: "Sign in to upload photos." }, { status: 401 });

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_UPLOAD_BYTES + 64 * 1024) {
    return Response.json({ error: "Photo is too large (max 15 MB)." }, { status: 413 });
  }

  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get("file");
  } catch {
    return Response.json({ error: "Send the photo as multipart form data." }, { status: 400 });
  }
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: "No photo received." }, { status: 400 });
  }
  const type = file.type || (/\.(heic|heif)$/i.test(file.name) ? "image/heic" : "");
  if (!isAllowedImageType(type)) {
    return Response.json({ error: "Use a JPG, PNG, WebP or HEIC photo." }, { status: 415 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return Response.json({ error: "Photo is too large (max 15 MB)." }, { status: 413 });
  }

  try {
    const image = await saveImage(Buffer.from(await file.arrayBuffer()));
    return Response.json(image, { status: 201 });
  } catch (err) {
    console.error("upload failed", { by: admin ? "admin" : "seller", err: err instanceof Error ? err.message : String(err) });
    return Response.json({ error: "Couldn't read this photo. Try another one." }, { status: 400 });
  }
}

function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // non-browser clients; the session cookie is still required
  try {
    const host = new URL(origin).host;
    const allowed = [request.headers.get("x-forwarded-host"), request.headers.get("host"), new URL(request.url).host];
    if (process.env.NEXT_PUBLIC_SITE_URL) allowed.push(new URL(process.env.NEXT_PUBLIC_SITE_URL).host);
    return allowed.includes(host);
  } catch {
    return false;
  }
}
