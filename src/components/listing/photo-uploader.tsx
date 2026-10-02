"use client";

import { AlertCircle, Camera, ChevronLeft, ChevronRight, ImagePlus, Loader2, RotateCw, Trash2 } from "lucide-react";
import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import type { StoredImage } from "./types";

const MAX_SIDE = 2000;
const JPEG_QUALITY = 0.85;

type Item = {
  key: string;
  status: "uploading" | "done" | "error";
  image?: StoredImage;
  /** Local object URL shown while uploading. */
  preview?: string;
  progress: number;
  error?: string;
  file?: File;
};

export type PhotoUploaderProps = {
  initial?: StoredImage[];
  /** Called with the ordered list of uploaded photos whenever it changes (first = cover). */
  onChange: (images: StoredImage[]) => void;
  /** True while any photo is still uploading — disable submit meanwhile. */
  onBusyChange?: (busy: boolean) => void;
  max?: number;
  error?: string;
  uploadUrl?: string;
  id?: string;
};

let keySeq = 0;
const nextKey = () => `p${Date.now().toString(36)}${(keySeq++).toString(36)}`;

/**
 * Downscales a phone photo in the browser before upload (≈2000px, JPEG
 * q0.85) — a 6 MB camera photo becomes ~400 KB, which matters on rural
 * 4G. Also drops EXIF (incl. GPS). Falls back to the original file if the
 * browser can't decode it (e.g. HEIC on Android); the server re-encodes anyway.
 */
async function downscale(file: File): Promise<Blob> {
  let source: ImageBitmap | HTMLImageElement | null = null;
  let width = 0;
  let height = 0;
  let objectUrl: string | null = null;
  try {
    if (typeof createImageBitmap === "function") {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      source = bitmap;
      width = bitmap.width;
      height = bitmap.height;
    } else {
      objectUrl = URL.createObjectURL(file);
      const img = new window.Image();
      img.src = objectUrl;
      await img.decode();
      source = img;
      width = img.naturalWidth;
      height = img.naturalHeight;
    }
    const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
    // Already small and compact: send as is.
    if (scale === 1 && file.size <= 600 * 1024 && /jpe?g|webp/.test(file.type)) return file;

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  } finally {
    if (source && "close" in source) source.close();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

function upload(url: string, blob: Blob, name: string, onProgress: (fraction: number) => void): Promise<StoredImage> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      const body = xhr.response as (StoredImage & { error?: string }) | null;
      if (xhr.status >= 200 && xhr.status < 300 && body?.url) resolve({ url: body.url, width: body.width, height: body.height });
      else if (xhr.status === 401) reject(new Error("Your session expired. Sign in again."));
      else reject(new Error(body?.error || "Upload failed"));
    };
    xhr.onerror = () => reject(new Error("No connection. Tap retry."));
    xhr.ontimeout = () => reject(new Error("Upload timed out. Tap retry."));
    xhr.timeout = 120_000;
    const form = new FormData();
    form.append("file", blob, name.replace(/\.\w+$/, "") + (blob.type === "image/jpeg" ? ".jpg" : ""));
    xhr.send(form);
  });
}

export function PhotoUploader({
  initial,
  onChange,
  onBusyChange,
  max = 10,
  error,
  uploadUrl = "/api/uploads",
  id,
}: PhotoUploaderProps) {
  const autoId = useId();
  const inputId = id ?? `${autoId}-photos`;
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>(() =>
    (initial ?? []).map((image) => ({ key: nextKey(), status: "done", image, progress: 1 })),
  );
  const [notice, setNotice] = useState<string | null>(null);
  // Upload one photo at a time: kinder to a weak 4G connection than parallel uploads.
  const queue = useRef<Promise<void>>(Promise.resolve());

  const callbacks = useRef({ onChange, onBusyChange });
  useEffect(() => {
    callbacks.current = { onChange, onBusyChange };
  });
  useEffect(() => {
    callbacks.current.onChange(items.filter((i) => i.status === "done" && i.image).map((i) => i.image!));
    callbacks.current.onBusyChange?.(items.some((i) => i.status === "uploading"));
  }, [items]);

  // Revoke object URLs on unmount.
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  useEffect(
    () => () => {
      for (const i of itemsRef.current) if (i.preview) URL.revokeObjectURL(i.preview);
    },
    [],
  );

  const patch = (key: string, p: Partial<Item>) => setItems((list) => list.map((i) => (i.key === key ? { ...i, ...p } : i)));

  function enqueue(key: string, file: File) {
    queue.current = queue.current.then(async () => {
      try {
        const blob = await downscale(file);
        const image = await upload(uploadUrl, blob, file.name, (f) => patch(key, { progress: f }));
        setItems((list) =>
          list.map((i) => {
            if (i.key !== key) return i;
            if (i.preview) URL.revokeObjectURL(i.preview);
            return { key, status: "done", image, progress: 1 };
          }),
        );
      } catch (e) {
        patch(key, { status: "error", error: e instanceof Error ? e.message : "Upload failed" });
      }
    });
  }

  function addFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    const room = max - items.length;
    const files = Array.from(fileList).filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name));
    if (files.length === 0) {
      setNotice("Please choose photos (JPG, PNG or HEIC).");
      return;
    }
    const accepted = files.slice(0, Math.max(0, room));
    setNotice(files.length > accepted.length ? `You can add up to ${max} photos — ${files.length - accepted.length} skipped.` : null);
    const newItems: Item[] = accepted.map((file) => ({
      key: nextKey(),
      status: "uploading",
      preview: URL.createObjectURL(file),
      progress: 0,
      file,
    }));
    setItems((list) => [...list, ...newItems]);
    for (const it of newItems) enqueue(it.key, it.file!);
  }

  function retry(item: Item) {
    if (!item.file) return;
    patch(item.key, { status: "uploading", progress: 0, error: undefined });
    enqueue(item.key, item.file);
  }

  function remove(key: string) {
    setItems((list) => {
      const it = list.find((i) => i.key === key);
      if (it?.preview) URL.revokeObjectURL(it.preview);
      return list.filter((i) => i.key !== key);
    });
  }

  function move(index: number, delta: -1 | 1) {
    setItems((list) => {
      const to = index + delta;
      if (to < 0 || to >= list.length) return list;
      const next = [...list];
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });
  }

  const full = items.length >= max;

  return (
    <div className="flex flex-col gap-3">
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-label="Photos">
        {items.map((item, index) => {
          const src = item.image?.url ?? item.preview;
          return (
            <li key={item.key} className="flex flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-soft">
              <div className="relative aspect-[4/3] bg-mist">
                {src && (
                  <Image
                    src={src}
                    alt={`Photo ${index + 1}`}
                    fill
                    sizes="(min-width: 1024px) 200px, (min-width: 640px) 30vw, 45vw"
                    unoptimized={src.startsWith("blob:")}
                    className={cn("object-cover", item.status !== "done" && "opacity-60")}
                  />
                )}
                {index === 0 && item.status === "done" && (
                  <span className="absolute top-2 left-2 rounded-full bg-brand-600 px-2 py-0.5 text-[11px] font-bold text-white shadow-soft">
                    Cover
                  </span>
                )}
                {item.status === "uploading" && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/40">
                    <Loader2 className="size-6 animate-spin text-brand-700" aria-hidden />
                    <div className="h-1.5 w-2/3 overflow-hidden rounded-full bg-white/80">
                      <div className="h-full rounded-full bg-brand-600 transition-[width]" style={{ width: `${Math.round(item.progress * 100)}%` }} />
                    </div>
                    <span className="sr-only">Uploading</span>
                  </div>
                )}
                {item.status === "error" && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-red-50/90 p-2 text-center">
                    <AlertCircle className="size-5 text-danger" aria-hidden />
                    <p className="text-xs font-medium text-red-700">{item.error}</p>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between gap-1 p-1">
                {item.status === "error" ? (
                  <button
                    type="button"
                    onClick={() => retry(item)}
                    className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl text-sm font-semibold text-brand-700 hover:bg-brand-50"
                  >
                    <RotateCw className="size-4" aria-hidden /> Retry
                  </button>
                ) : (
                  <>
                    <IconButton label="Move left" onClick={() => move(index, -1)} disabled={index === 0}>
                      <ChevronLeft />
                    </IconButton>
                    <IconButton label="Move right" onClick={() => move(index, 1)} disabled={index === items.length - 1}>
                      <ChevronRight />
                    </IconButton>
                  </>
                )}
                <IconButton label="Remove photo" onClick={() => remove(item.key)} danger>
                  <Trash2 />
                </IconButton>
              </div>
            </li>
          );
        })}

        {!full && (
          <li>
            <label
              htmlFor={inputId}
              className={cn(
                "flex h-full min-h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-4 text-center transition",
                error ? "border-danger/50 bg-red-50/40" : "border-brand-200 bg-brand-50/50 hover:border-brand-400 hover:bg-brand-50",
              )}
            >
              <span className="flex size-11 items-center justify-center rounded-full bg-white text-brand-600 shadow-soft">
                <ImagePlus className="size-5" aria-hidden />
              </span>
              <span className="text-sm font-semibold text-brand-800">{items.length ? "Add more photos" : "Add photos"}</span>
              <span className="text-xs text-muted">
                {items.length}/{max} · from gallery
              </span>
            </label>
          </li>
        )}
      </ul>

      <input
        ref={galleryRef}
        id={inputId}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {!full && (
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          className="inline-flex h-11 items-center justify-center gap-2 self-start rounded-full border border-line-strong bg-white px-4 text-sm font-semibold text-ink shadow-soft transition hover:border-brand-300 sm:hidden"
        >
          <Camera className="size-4 text-brand-600" aria-hidden /> Take a photo now
        </button>
      )}

      {(error || notice) && (
        <p className={cn("text-sm", error ? "text-danger" : "text-muted")} role={error ? "alert" : "status"}>
          {error || notice}
        </p>
      )}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "flex size-11 items-center justify-center rounded-xl text-muted transition disabled:opacity-30 [&_svg]:size-[18px]",
        danger ? "hover:bg-red-50 hover:text-danger" : "hover:bg-mist hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
