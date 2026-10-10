/**
 * Hostname of OUR Vercel Blob store ("<store>.public.blob.vercel-storage.com").
 * Any Vercel customer can create a store, so image URLs are only trusted on
 * this exact host. Set BLOB_PUBLIC_HOST, or it is derived from the store id in
 * BLOB_READ_WRITE_TOKEN ("vercel_blob_rw_<storeId>_<secret>"). Null when
 * neither is set (local disk storage).
 */
export function ourBlobHost(env: Record<string, string | undefined> = process.env): string | null {
  const explicit = env.BLOB_PUBLIC_HOST?.trim().toLowerCase();
  if (explicit && /^[a-z0-9]+\.public\.blob\.vercel-storage\.com$/.test(explicit)) return explicit;
  const storeId = /^vercel_blob_rw_([a-z0-9]+)_/i.exec(env.BLOB_READ_WRITE_TOKEN?.trim() ?? "")?.[1];
  return storeId ? `${storeId.toLowerCase()}.public.blob.vercel-storage.com` : null;
}
