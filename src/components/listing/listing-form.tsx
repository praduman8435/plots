"use client";

import {
  AlertCircle,
  Building2,
  Check,
  Factory,
  House,
  ArrowLeft,
  ArrowRight,
  LandPlot,
  Loader2,
  RotateCcw,
  Sprout,
  type LucideIcon,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { SellProgress } from "@/components/seller/progress";
import { track } from "@/lib/analytics-client";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import type { AreaUnit, LandType } from "@/generated/prisma/enums";
import { cn } from "@/lib/cn";
import { formatNumber, formatPrice } from "@/lib/format";
import { INDIAN_STATES } from "@/lib/india";
import { FEATURE_OPTIONS, LAND_TYPES, buildTitle, placeName } from "@/lib/land";
import { AREA_UNITS, formatArea, toSqft } from "@/lib/units";
import { listingInputSchema } from "@/lib/validation/listing";
import { PhotoUploader } from "./photo-uploader";
import type { ListingFormAction, ListingFormCity, ListingFormInitial, StoredImage } from "./types";

// Leaflet touches `window`, so the map loads only in the browser.
const LocationPicker = dynamic(() => import("./location-picker").then((m) => m.LocationPicker), {
  ssr: false,
  loading: () => <div className="h-60 animate-pulse rounded-2xl bg-mist ring-1 ring-line sm:h-72" />,
});

export type ListingFormProps = {
  /** "seller": the seller's own "Add plot" form. "admin": adds an editable title. */
  mode: "admin" | "seller";
  cities: ListingFormCity[];
  initial?: ListingFormInitial;
  submitLabel?: string;
  /** Receives the validated payload. Return `{ ok: true, redirectTo }` to navigate, or errors to show. */
  action: ListingFormAction;
  /** Rendered first, inside the form (e.g. the admin's seller section). */
  extra?: ReactNode;
  /** Rendered after the photos, just before the submit bar (e.g. a "Publish immediately" checkbox). */
  beforeSubmit?: ReactNode;
  /** Errors for fields rendered by the caller in `extra` are the caller's job; anything else lands here. */
  className?: string;
  /**
   * Seller mode: one step at a time (Property details → Photos → Submit) with
   * a progress bar, and the draft saved on this device under `draftKey` so a
   * refresh or a closed tab doesn't lose anything.
   */
  wizard?: { draftKey: string };
};

const LAND_TYPE_CARDS: { value: LandType; icon: LucideIcon; hint: string }[] = [
  { value: "AGRICULTURAL", icon: Sprout, hint: "Khet, farming land" },
  { value: "RESIDENTIAL_PLOT", icon: House, hint: "To build a house" },
  { value: "COMMERCIAL", icon: Building2, hint: "Shops, showrooms" },
  { value: "INDUSTRIAL", icon: Factory, hint: "Godown, factory" },
  { value: "OTHER", icon: LandPlot, hint: "Anything else" },
];

/** UP sellers speak Bigha/Biswa; Punjab/Chandigarh sellers Marla/Kanal/Acre ("killa"); plots in sq ft or Gaj. */
const UNIT_ORDER: AreaUnit[] = ["SQFT", "SQYD", "MARLA", "KANAL", "BIGHA", "BISWA", "ACRE", "HECTARE", "SQM"];
const DEFAULT_UNIT: Record<LandType, AreaUnit> = {
  AGRICULTURAL: "BIGHA",
  INDUSTRIAL: "BIGHA",
  OTHER: "SQFT",
  RESIDENTIAL_PLOT: "SQFT",
  COMMERCIAL: "SQFT",
};

type PriceUnit = "LAKH" | "CRORE" | "RUPEES";
const PRICE_UNITS: { value: PriceUnit; label: string; multiplier: number }[] = [
  { value: "LAKH", label: "Lakh", multiplier: 1_00_000 },
  { value: "CRORE", label: "Crore", multiplier: 1_00_00_000 },
  { value: "RUPEES", label: "₹ total", multiplier: 1 },
];

function splitPrice(rupees: number | undefined): { amount: string; unit: PriceUnit } {
  if (!rupees) return { amount: "", unit: "LAKH" };
  if (rupees >= 1_00_00_000) return { amount: String(+(rupees / 1_00_00_000).toFixed(4)), unit: "CRORE" };
  if (rupees >= 1_00_000) return { amount: String(+(rupees / 1_00_000).toFixed(4)), unit: "LAKH" };
  return { amount: String(rupees), unit: "RUPEES" };
}

function parseAmount(v: string): number {
  const n = Number(v.replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : NaN;
}

const FIELD_ORDER = ["landType", "state", "cityName", "locality", "village", "area", "areaUnit", "price", "features", "description", "images", "title"];

/** Wizard pages and the fields each one validates before "Next". */
const PAGES = [
  { title: "Property details", fields: ["landType", "state", "cityName", "locality", "village", "area", "areaUnit", "price", "priceNegotiable", "latitude", "longitude"] },
  { title: "Photos & description", fields: ["description", "features", "images"] },
  { title: "Check and submit", fields: [] as string[] },
];

type Draft = {
  landType: LandType | "";
  stateName: string;
  cityName: string;
  locality: string;
  village: string;
  coords: { lat: number; lng: number } | null;
  area: string;
  areaUnit: AreaUnit;
  priceAmount: string;
  priceUnit: PriceUnit;
  negotiable: boolean;
  features: string[];
  description: string;
  images: StoredImage[];
  page: number;
  savedAt: number;
};

export function ListingForm({
  mode,
  cities,
  initial,
  submitLabel = "Submit",
  action,
  extra,
  beforeSubmit,
  className,
  wizard,
}: ListingFormProps) {
  const router = useRouter();
  const uid = useId();
  const fid = (name: string) => `${uid}-${name}`;
  const [pending, startTransition] = useTransition();

  const [landType, setLandType] = useState<LandType | "">(initial?.landType ?? "");
  const initialCity = cities.find((c) => c.id === initial?.cityId);
  const [stateName, setStateName] = useState(initial?.state ?? initialCity?.state ?? "");
  const [cityName, setCityName] = useState(initial?.cityName ?? initialCity?.name ?? "");
  const [locality, setLocality] = useState(initial?.locality ?? "");
  const [village, setVillage] = useState(initial?.village ?? "");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    initial?.latitude != null && initial?.longitude != null ? { lat: initial.latitude, lng: initial.longitude } : null,
  );
  const [area, setArea] = useState(initial?.area != null ? String(initial.area) : "");
  const [areaUnit, setAreaUnit] = useState<AreaUnit>(initial?.areaUnit ?? "BIGHA");
  const [unitTouched, setUnitTouched] = useState(Boolean(initial?.areaUnit));
  const initialPrice = splitPrice(initial?.price);
  const [priceAmount, setPriceAmount] = useState(initialPrice.amount);
  const [priceUnit, setPriceUnit] = useState<PriceUnit>(initialPrice.unit);
  const [negotiable, setNegotiable] = useState(initial?.priceNegotiable ?? true);
  const [features, setFeatures] = useState<string[]>(initial?.features ?? []);
  const [description, setDescription] = useState(initial?.description ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [images, setImages] = useState<StoredImage[]>(initial?.images ?? []);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [photoKey, setPhotoKey] = useState(0);
  const [restored, setRestored] = useState(false);
  const started = useRef(false);
  const topRef = useRef<HTMLDivElement>(null);

  // ── Draft: restore once, then save on every change (wizard only) ──
  /* eslint-disable react-hooks/set-state-in-effect -- one-time restore from device storage after mount */
  useEffect(() => {
    if (!wizard) return;
    try {
      const d = JSON.parse(localStorage.getItem(wizard.draftKey) ?? "null") as Draft | null;
      if (!d || Date.now() - d.savedAt > 14 * 86_400_000) return;
      setLandType(d.landType);
      setStateName(d.stateName ?? "");
      setCityName(d.cityName ?? "");
      setLocality(d.locality);
      setVillage(d.village);
      setCoords(d.coords);
      setArea(d.area);
      setAreaUnit(d.areaUnit);
      setUnitTouched(true);
      setPriceAmount(d.priceAmount);
      setPriceUnit(d.priceUnit);
      setNegotiable(d.negotiable);
      setFeatures(d.features);
      setDescription(d.description);
      setImages(d.images ?? []);
      setPhotoKey((k) => k + 1);
      setPage(Math.min(d.page ?? 0, PAGES.length - 1));
      setRestored(true);
      started.current = true;
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const draft: Omit<Draft, "savedAt"> = { landType, stateName, cityName, locality, village, coords, area, areaUnit, priceAmount, priceUnit, negotiable, features, description, images, page };
  const draftJson = JSON.stringify(draft);
  useEffect(() => {
    if (!wizard) return;
    const empty = !landType && !locality && !area && !priceAmount && !description && images.length === 0;
    if (empty) return;
    if (!started.current) {
      started.current = true;
      track("listing_started", { props: { via: "web" } });
    }
    const t = setTimeout(() => {
      try {
        localStorage.setItem(wizard.draftKey, JSON.stringify({ ...JSON.parse(draftJson), savedAt: Date.now() }));
      } catch {}
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftJson]);

  function startFresh() {
    if (!wizard) return;
    try {
      localStorage.removeItem(wizard.draftKey);
    } catch {}
    window.location.reload();
  }

  // An already-used city (suggested as you type), or a brand-new one — both work.
  const city = cities.find((c) => c.state === stateName && c.name.toLowerCase() === cityName.trim().toLowerCase());
  const stateCities = cities.filter((c) => !stateName || c.state === stateName);
  const areaNum = parseAmount(area);
  const multiplier = PRICE_UNITS.find((u) => u.value === priceUnit)!.multiplier;
  const amountNum = parseAmount(priceAmount);
  const rupees = Number.isFinite(amountNum) && amountNum > 0 ? Math.round(amountNum * multiplier) : 0;

  const sqftHint = useMemo(() => {
    if (!(areaNum > 0)) return null;
    if ((areaUnit === "BIGHA" || areaUnit === "BISWA") && !city?.bighaInSqft) return null;
    const sqft = toSqft(areaNum, areaUnit, city?.bighaInSqft ?? 0, city?.marlaInSqft);
    if (areaUnit === "SQFT") return sqft >= 21_780 ? `≈ ${formatNumber(sqft / 43_560, 2)} acres` : null;
    const parts = [`≈ ${formatNumber(sqft)} sq ft`];
    if (sqft >= 21_780 && areaUnit !== "ACRE") parts.push(`${formatNumber(sqft / 43_560, 2)} acres`);
    return parts.join(" · ");
  }, [areaNum, areaUnit, city?.bighaInSqft, city?.marlaInSqft]);

  const autoTitle =
    landType && areaNum > 0 && (village.trim() || locality.trim())
      ? buildTitle({ area: areaNum, areaUnit, landType, locality, village })
      : "";

  function clearError(name: string) {
    if (!errors[name]) return;
    const next = { ...errors };
    delete next[name];
    setErrors(next);
    if (Object.keys(next).length === 0) setMessage(null);
  }

  function chooseLandType(value: LandType) {
    setLandType(value);
    clearError("landType");
    if (!unitTouched && !area) setAreaUnit(DEFAULT_UNIT[value]);
  }

  function toggleFeature(f: string) {
    setFeatures((list) => (list.includes(f) ? list.filter((x) => x !== f) : [...list, f]));
  }

  function focusFirstError(errs: Record<string, string>) {
    const first = FIELD_ORDER.find((f) => errs[f]) ?? Object.keys(errs)[0];
    if (!first) return;
    const el = document.getElementById(fid(first)) ?? document.querySelector<HTMLElement>(`[data-field="${first}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (el && "focus" in el) (el as HTMLElement).focus({ preventScroll: true });
  }

  function rawInput() {
    return {
      cityId: city?.id,
      cityName: cityName.trim() || undefined,
      state: stateName || undefined,
      landType: landType || undefined,
      area: area.trim() === "" ? undefined : areaNum,
      areaUnit,
      price: rupees || (priceAmount.trim() === "" ? undefined : NaN),
      priceNegotiable: negotiable,
      locality,
      village,
      latitude: coords?.lat,
      longitude: coords?.lng,
      description,
      features,
    };
  }

  /** Validates everything, or only `onlyFields` (wizard "Next"). Returns the parsed listing when fully valid. */
  function validate(onlyFields?: string[]) {
    const raw = rawInput();
    const parsed = listingInputSchema.safeParse(raw);
    const errs: Record<string, string> = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        if (onlyFields && !onlyFields.includes(key)) continue;
        errs[key] ??= key === "area" && raw.area === undefined ? "Enter the land size" : issue.message;
        if (key === "price" && !rupees) errs.price = "Enter the expected price";
      }
    }
    return { errs, data: parsed.success ? parsed.data : null };
  }

  function goNext() {
    const { errs } = validate(PAGES[page].fields);
    if (Object.keys(errs).length) {
      setErrors(errs);
      setMessage("Please check the highlighted fields.");
      focusFirstError(errs);
      return;
    }
    setErrors({});
    setMessage(null);
    setPage((p) => Math.min(p + 1, PAGES.length - 1));
    requestAnimationFrame(() => topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function goBack() {
    setMessage(null);
    setPage((p) => Math.max(0, p - 1));
    requestAnimationFrame(() => topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending || uploading) return;
    if (wizard && page < PAGES.length - 1) return goNext();
    setMessage(null);

    const { errs, data } = validate();
    if (!data) {
      setErrors(errs);
      setMessage("Please check the highlighted fields.");
      // Jump back to the page that has the problem.
      if (wizard) {
        const bad = PAGES.findIndex((pg) => pg.fields.some((f) => errs[f]));
        if (bad >= 0) setPage(bad);
        requestAnimationFrame(() => focusFirstError(errs));
      } else focusFirstError(errs);
      return;
    }
    const parsed = { data };
    setErrors({});

    startTransition(async () => {
      try {
        const result = await action({
          listing: parsed.data,
          images,
          title: mode === "admin" ? title.trim() || undefined : undefined,
        });
        if (result.ok) {
          if (wizard) {
            try {
              localStorage.removeItem(wizard.draftKey);
            } catch {}
          }
          router.push(result.redirectTo);
          return;
        }
        const errs = result.fieldErrors ?? {};
        setErrors(errs);
        setMessage(result.message ?? "Please check the highlighted fields.");
        focusFirstError(errs);
      } catch {
        setMessage("Something went wrong — check your connection and try again.");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className={cn("flex flex-col gap-4 sm:gap-5", className)}>
      <div ref={topRef} className="-mt-24 pt-24" aria-hidden />
      {wizard && (
        <div className="rounded-2xl border border-line bg-white p-4 shadow-soft">
          <SellProgress current={page + 1} />
          <p className="mt-3 text-sm font-semibold text-ink">
            Step {page + 2} of 4 · <span className="text-muted">{PAGES[page].title}</span>
          </p>
        </div>
      )}
      {wizard && restored && (
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-brand-50 px-4 py-3 text-sm text-brand-900 ring-1 ring-brand-100">
          <span>We saved your unfinished listing — continue where you left off.</span>
          <button type="button" onClick={startFresh} className="inline-flex shrink-0 items-center gap-1 font-semibold text-brand-700">
            <RotateCcw className="size-3.5" aria-hidden /> Start fresh
          </button>
        </div>
      )}
      {extra}

      <div className={cn("flex flex-col gap-4 sm:gap-5", wizard && page !== 0 && "hidden")}>
      {/* ── Land type ── */}
      <Section id="form-type" title="What kind of land is it?" step={wizard ? undefined : 1}>
        <div
          role="radiogroup"
          aria-label="Land type"
          aria-invalid={Boolean(errors.landType) || undefined}
          data-field="landType"
          className="grid grid-cols-2 gap-3 lg:grid-cols-5"
        >
          {LAND_TYPE_CARDS.map(({ value, icon: Icon, hint }, i) => {
            const selected = landType === value;
            return (
              <button
                key={value}
                id={i === 0 ? fid("landType") : undefined}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => chooseLandType(value)}
                className={cn(
                  "relative flex min-h-28 flex-col items-start gap-2 rounded-2xl border bg-white p-4 text-left transition active:scale-[0.98]",
                  value === "OTHER" && "col-span-2 min-h-0 flex-row items-center lg:col-span-1 lg:min-h-28 lg:flex-col lg:items-start",
                  selected
                    ? "border-brand-500 bg-brand-50/60 shadow-soft ring-2 ring-brand-500"
                    : errors.landType
                      ? "border-danger/50"
                      : "border-line-strong hover:border-brand-300",
                )}
              >
                <span
                  className={cn(
                    "flex size-10 items-center justify-center rounded-xl transition",
                    selected ? "bg-brand-600 text-white" : "bg-brand-50 text-brand-700",
                  )}
                >
                  <Icon className="size-5" aria-hidden />
                </span>
                <span>
                  <span className="block text-[15px] leading-tight font-semibold text-ink">{LAND_TYPES[value].short}</span>
                  <span className="mt-0.5 block text-xs text-muted">{hint}</span>
                </span>
                {selected && (
                  <span className="absolute top-3 right-3 flex size-5 items-center justify-center rounded-full bg-brand-600 text-white">
                    <Check className="size-3.5" strokeWidth={3} aria-hidden />
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {errors.landType && <ErrorText>{errors.landType}</ErrorText>}
      </Section>

      {/* ── Location ── */}
      <Section id="form-location" title="Where is it?" step={wizard ? undefined : 2}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="State" htmlFor={fid("state")} error={errors.state}>
            <Select
              id={fid("state")}
              value={stateName}
              onChange={(e) => {
                setStateName(e.target.value);
                clearError("state");
              }}
              aria-invalid={Boolean(errors.state) || undefined}
            >
              <option value="">Choose state…</option>
              {INDIAN_STATES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="City / district" htmlFor={fid("cityName")} error={errors.cityName} hint={stateName ? "Pick a suggestion or type yours" : "Choose the state first"}>
            <Input
              id={fid("cityName")}
              list={fid("cities")}
              value={cityName}
              onChange={(e) => {
                setCityName(e.target.value);
                clearError("cityName");
              }}
              placeholder="e.g. Mohali, Nashik, Azamgarh"
              autoComplete="off"
              maxLength={60}
              disabled={!stateName}
              aria-invalid={Boolean(errors.cityName) || undefined}
            />
            <datalist id={fid("cities")}>
              {stateCities.map((c) => (
                <option key={c.id} value={c.name} />
              ))}
            </datalist>
          </Field>
          <Field
            label="Address — area / locality"
            htmlFor={fid("locality")}
            error={errors.locality}
            hint="Mohalla, road or a landmark buyers know"
          >
            <Input
              id={fid("locality")}
              value={locality}
              onChange={(e) => {
                setLocality(e.target.value);
                clearError("locality");
              }}
              placeholder="e.g. Near Sidhari bypass"
              autoComplete="off"
              maxLength={120}
              aria-invalid={Boolean(errors.locality) || undefined}
            />
          </Field>
          <Field label="Village" htmlFor={fid("village")} optional error={errors.village}>
            <Input
              id={fid("village")}
              value={village}
              onChange={(e) => setVillage(e.target.value)}
              placeholder="e.g. Sathiyaon"
              autoComplete="off"
              maxLength={120}
            />
          </Field>
        </div>
        <div className="mt-5" data-field="latitude">
          <p className="mb-2 text-sm font-semibold text-ink">
            Pin on the map <span className="ml-1 font-normal text-faint">Optional · helps buyers a lot</span>
          </p>
          <LocationPicker
            value={coords}
            onChange={setCoords}
            center={city?.latitude != null && city?.longitude != null ? { lat: city.latitude, lng: city.longitude } : { lat: 22.9734, lng: 78.6569 }}
            areaHint={cityName.trim() && stateName ? `${cityName.trim()}, ${stateName}` : stateName || undefined}
          />
        </div>
      </Section>

      {/* ── Size & price ── */}
      <Section id="form-price" title="Size and price" step={wizard ? undefined : 3}>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Land size" htmlFor={fid("area")} error={errors.area} hint={sqftHint ?? "Exactly as you'd say it"}>
            <div className="flex gap-2">
              <Input
                id={fid("area")}
                inputMode="decimal"
                value={area}
                onChange={(e) => {
                  setArea(e.target.value.replace(/[^\d.,]/g, ""));
                  clearError("area");
                }}
                placeholder="e.g. 2"
                className="tabular min-w-0 flex-1"
                aria-invalid={Boolean(errors.area) || undefined}
              />
              <div className="w-[9.5rem] shrink-0">
                <Select
                  id={fid("areaUnit")}
                  aria-label="Unit"
                  value={areaUnit}
                  onChange={(e) => {
                    setAreaUnit(e.target.value as AreaUnit);
                    setUnitTouched(true);
                  }}
                >
                  {UNIT_ORDER.map((u) => (
                    <option key={u} value={u}>
                      {u === "SQYD" ? "Gaj (sq yd)" : AREA_UNITS[u].label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          </Field>

          <Field
            label="Total asking price"
            htmlFor={fid("price")}
            error={errors.price}
            hint={
              rupees > 0 ? (
                <span>
                  <span className="font-semibold text-brand-700">{formatPrice(rupees)}</span>
                  {areaNum > 0 && <> · ≈ {formatPrice(Math.round(rupees / areaNum))} per {AREA_UNITS[areaUnit].short}</>}
                </span>
              ) : (
                "For the whole land, not per unit"
              )
            }
          >
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted">₹</span>
                <Input
                  id={fid("price")}
                  inputMode="decimal"
                  value={priceAmount}
                  onChange={(e) => {
                    setPriceAmount(e.target.value.replace(/[^\d.,]/g, ""));
                    clearError("price");
                  }}
                  placeholder={priceUnit === "RUPEES" ? "e.g. 1800000" : "e.g. 18"}
                  className="tabular pl-8"
                  aria-invalid={Boolean(errors.price) || undefined}
                />
              </div>
              <div role="radiogroup" aria-label="Price unit" className="flex h-12 shrink-0 rounded-xl border border-line-strong bg-mist p-1">
                {PRICE_UNITS.map((u) => (
                  <button
                    key={u.value}
                    type="button"
                    role="radio"
                    aria-checked={priceUnit === u.value}
                    onClick={() => {
                      setPriceUnit(u.value);
                      clearError("price");
                    }}
                    className={cn(
                      "rounded-lg px-2.5 text-[13px] font-semibold whitespace-nowrap transition sm:px-3",
                      priceUnit === u.value ? "bg-white text-brand-800 shadow-soft" : "text-muted",
                    )}
                  >
                    {u.label}
                  </button>
                ))}
              </div>
            </div>
          </Field>
        </div>

        <label className="mt-5 flex min-h-12 cursor-pointer items-center justify-between gap-4 rounded-xl border border-line bg-mist/60 px-4 py-2.5">
          <span>
            <span className="block text-[15px] font-semibold text-ink">Price is negotiable</span>
            <span className="block text-sm text-muted">Buyers see “Negotiable” next to the price</span>
          </span>
          <input type="checkbox" className="peer sr-only" checked={negotiable} onChange={(e) => setNegotiable(e.target.checked)} />
          <span
            aria-hidden
            className="relative h-7 w-12 shrink-0 rounded-full bg-line-strong transition peer-checked:bg-brand-600 peer-focus-visible:ring-4 peer-focus-visible:ring-brand-100 after:absolute after:top-1 after:left-1 after:size-5 after:rounded-full after:bg-white after:shadow-soft after:transition peer-checked:after:translate-x-5"
          />
        </label>
      </Section>
      </div>

      <div className={cn("flex flex-col gap-4 sm:gap-5", wizard && page !== 1 && "hidden")}>
      {/* ── Photos (first on this page: photos sell land) ── */}
      <Section
        id="form-photos"
        title="Photos"
        step={wizard ? undefined : 4}
        description="Add clear photos of the land. A road / frontage photo and a nearby landmark help too. 2 or more photos get far more enquiries."
      >
        <div data-field="images">
          <PhotoUploader key={photoKey} initial={images.length ? images : initial?.images} onChange={setImages} onBusyChange={setUploading} error={errors.images} />
        </div>
      </Section>

      {/* ── Features ── */}
      <Section id="form-features" title="What does it have?" step={wizard ? undefined : 5} description="Tap all that apply.">
        <div className="flex flex-wrap gap-2" data-field="features">
          {FEATURE_OPTIONS.map((f) => {
            const on = features.includes(f);
            return (
              <button
                key={f}
                type="button"
                aria-pressed={on}
                onClick={() => toggleFeature(f)}
                className={cn(
                  "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition active:scale-[0.97]",
                  on ? "border-brand-600 bg-brand-600 text-white shadow-soft" : "border-line-strong bg-white text-ink-soft hover:border-brand-300",
                )}
              >
                {on && <Check className="size-4" strokeWidth={3} aria-hidden />}
                {f}
              </button>
            );
          })}
        </div>
        {errors.features && <ErrorText>{errors.features}</ErrorText>}
      </Section>

      {/* ── Description ── */}
      <Section id="form-description" title="Tell buyers about it" step={wizard ? undefined : 6}>
        <Field
          label="Description"
          htmlFor={fid("description")}
          error={errors.description}
          hint={`${description.trim().length}/2000 · Write in Hindi or English`}
        >
          <Textarea
            id={fid("description")}
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              clearError("description");
            }}
            maxLength={2000}
            rows={5}
            placeholder="Tell buyers what they should know about this land… e.g. 200 m from the main road, tube-well, electricity, boundary wall."
            aria-invalid={Boolean(errors.description) || undefined}
          />
        </Field>
      </Section>

      </div>

      {wizard && page === 2 && (
        <ReviewCard
          landType={landType}
          area={areaNum}
          areaUnit={areaUnit}
          rupees={rupees}
          negotiable={negotiable}
          place={[placeName({ locality, village }), cityName.trim()].filter(Boolean).join(", ")}
          pinned={Boolean(coords)}
          photos={images}
          description={description}
          onEdit={(p) => setPage(p)}
        />
      )}

      {mode === "admin" && (
        <Section title="Listing title" description="Shown on cards and the plot page.">
          <Field
            label="Title"
            htmlFor={fid("title")}
            optional
            error={errors.title}
            hint={autoTitle ? `Leave empty to use: “${autoTitle}”` : "Leave empty to build it from the size, type and place."}
          >
            <Input
              id={fid("title")}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                clearError("title");
              }}
              placeholder={autoTitle || "Automatic"}
              maxLength={140}
            />
          </Field>
        </Section>
      )}

      {beforeSubmit}

      {/* ── Sticky submit bar ── */}
      <div className="sticky bottom-[calc(var(--sticky-bottom,0px)+0.75rem)] z-20 mt-1">
        {message && (
          <div
            role="alert"
            className="mb-2 flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-3.5 py-2.5 text-sm text-red-700 shadow-soft"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>{message}</p>
          </div>
        )}
        <div className="flex items-center gap-3 rounded-2xl border border-line bg-white/95 p-2.5 pl-4 shadow-lift backdrop-blur-md">
          <div className="min-w-0 flex-1 text-sm leading-tight">
            <p className="truncate font-semibold text-ink">{rupees > 0 ? formatPrice(rupees) : "Price not set"}</p>
            <p className="truncate text-muted">
              {uploading ? "Uploading photos…" : `${images.length} photo${images.length === 1 ? "" : "s"}`}
            </p>
          </div>
          {wizard && page > 0 && (
            <Button type="button" variant="ghost" size="lg" onClick={goBack} className="px-3" aria-label="Back">
              <ArrowLeft />
            </Button>
          )}
          {wizard && page < PAGES.length - 1 ? (
            <Button type="button" size="lg" onClick={goNext} disabled={uploading} className="min-w-32">
              Next <ArrowRight />
            </Button>
          ) : (
            <Button type="submit" size="lg" disabled={pending || uploading} className="min-w-36">
              {pending && <Loader2 className="animate-spin" />}
              {pending ? "Submitting…" : submitLabel}
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}

function Section({ id, title, description, step, children }: { id?: string; title: string; description?: string; step?: number; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 rounded-2xl border border-line bg-white p-4 shadow-soft sm:p-6">
      <header className="mb-4 flex items-start gap-3">
        {step != null && (
          <span className="tabular mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-700 ring-1 ring-brand-100">
            {step}
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-[17px] font-bold text-ink">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}

function ErrorText({ children }: { children: ReactNode }) {
  return (
    <p className="mt-2 text-sm text-danger" role="alert">
      {children}
    </p>
  );
}

function ReviewCard(props: {
  landType: LandType | "";
  area: number;
  areaUnit: AreaUnit;
  rupees: number;
  negotiable: boolean;
  place: string;
  pinned: boolean;
  photos: StoredImage[];
  description: string;
  onEdit: (page: number) => void;
}) {
  const rows: { label: string; value: string; page: number }[] = [
    { label: "Land type", value: props.landType ? LAND_TYPES[props.landType].label : "—", page: 0 },
    { label: "Size", value: props.area > 0 ? formatArea(props.area, props.areaUnit) : "—", page: 0 },
    { label: "Price", value: props.rupees > 0 ? `${formatPrice(props.rupees)}${props.negotiable ? " · negotiable" : ""}` : "—", page: 0 },
    { label: "Location", value: `${props.place || "—"}${props.pinned ? " · pin added" : ""}`, page: 0 },
    { label: "Photos", value: `${props.photos.length} photo${props.photos.length === 1 ? "" : "s"}`, page: 1 },
  ];
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-soft">
      {props.photos[0] && (
        // eslint-disable-next-line @next/next/no-img-element -- local preview of an uploaded photo
        <img src={props.photos[0].url} alt="" className="aspect-[16/9] w-full object-cover" />
      )}
      <div className="p-4 sm:p-6">
        <h2 className="text-[17px] font-bold text-ink">Check your listing</h2>
        <p className="mt-0.5 text-sm text-muted">We&apos;ll review it before it appears to buyers.</p>
        <dl className="mt-4 divide-y divide-line">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between gap-3 py-3">
              <dt className="text-sm text-muted">{r.label}</dt>
              <dd className="flex min-w-0 items-center gap-3 text-right text-sm font-semibold text-ink">
                <span className="truncate">{r.value}</span>
                <button type="button" onClick={() => props.onEdit(r.page)} className="shrink-0 text-xs font-semibold text-brand-700">
                  Edit
                </button>
              </dd>
            </div>
          ))}
        </dl>
        {props.description.trim() && <p className="mt-2 line-clamp-3 rounded-xl bg-mist p-3 text-sm text-ink-soft">{props.description}</p>}
        {props.photos.length < 2 && (
          <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            Tip: listings with 2 or more photos get many more enquiries.{" "}
            <button type="button" onClick={() => props.onEdit(1)} className="font-semibold underline">
              Add photos
            </button>
          </p>
        )}
      </div>
    </section>
  );
}
