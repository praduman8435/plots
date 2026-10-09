"use client";

import { BadgeCheck, Loader2, ShieldBan, UserRoundCheck, UserRoundPlus } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { ListingForm } from "@/components/listing/listing-form";
import type { ListingFormCity, ListingFormPayload } from "@/components/listing/types";
import { Field, Input } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { normalizePhoneNumber } from "@/lib/phone";
import { createListingForSellerAction, lookupSellerByPhone, type AdminSellerLookup } from "@/server/actions/admin/listings";


/** Admin "Add plot for a seller": seller section + the shared ListingForm + "Publish immediately". */
export function NewListingForm({
  cities,
  defaultCityId,
  initialPhone,
}: {
  cities: ListingFormCity[];
  defaultCityId?: string;
  initialPhone?: string;
}) {
  const uid = useId();
  const [phone, setPhone] = useState(initialPhone?.replace(/^\+91/, "") ?? "");
  const [name, setName] = useState("");
  const [publishNow, setPublishNow] = useState(false);
  const [lookup, setLookup] = useState<{ phone: string; result: AdminSellerLookup } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const normalized = normalizePhoneNumber(phone);
  const validPhone = normalized.valid ? normalized.normalized : null;
  const current = lookup && lookup.phone === validPhone ? lookup.result : null;
  const looking = Boolean(validPhone) && !current;

  // Look the number up once it's a valid mobile number.
  const latest = useRef<string | null>(null);
  useEffect(() => {
    if (!validPhone) return;
    latest.current = validPhone;
    const t = window.setTimeout(async () => {
      try {
        const result = await lookupSellerByPhone(validPhone);
        if (latest.current === validPhone) setLookup({ phone: validPhone, result });
      } catch {
        if (latest.current === validPhone) setLookup({ phone: validPhone, result: { found: false } });
      }
    }, 300);
    return () => window.clearTimeout(t);
  }, [validPhone]);

  async function action(payload: ListingFormPayload) {
    const localErrors: Record<string, string> = {};
    if (!validPhone) localErrors["seller.phone"] = "Enter a valid 10-digit mobile number";
    else if (current?.found === false && name.trim().length < 2) localErrors["seller.name"] = "Enter the seller's name";
    if (Object.keys(localErrors).length) {
      setErrors(localErrors);
      document.getElementById(`${uid}-seller`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return { ok: false as const, message: "Add the seller's details first." };
    }
    const result = await createListingForSellerAction({
      ...payload,
      // Everyone is simply a seller.
      seller: { phone: validPhone!, name: name.trim(), sellerType: "OWNER" },
      publishNow,
    });
    if (!result.ok) {
      const sellerErrors = Object.fromEntries(Object.entries(result.fieldErrors ?? {}).filter(([k]) => k.startsWith("seller.")));
      setErrors(sellerErrors);
      if (Object.keys(sellerErrors).length) {
        document.getElementById(`${uid}-seller`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    } else {
      setErrors({});
    }
    return result;
  }

  const sellerSection = (
    <section id={`${uid}-seller`} className="scroll-mt-20 rounded-2xl border border-line bg-white p-4 shadow-soft sm:p-6">
      <header className="mb-4">
        <h2 className="text-[17px] font-bold text-ink">Seller</h2>
        <p className="mt-0.5 text-sm text-muted">Their WhatsApp number. Existing sellers are recognised automatically.</p>
      </header>
      <Field label="Mobile number" htmlFor={`${uid}-phone`} error={errors["seller.phone"]}>
        <div className="relative">
          <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-[16px] text-muted">+91</span>
          <Input
            id={`${uid}-phone`}
            type="tel"
            inputMode="numeric"
            autoComplete="off"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value.replace(/[^\d\s+]/g, "").slice(0, 16));
              setErrors({});
            }}
            placeholder="98765 43210"
            className="tabular pl-14"
            aria-invalid={Boolean(errors["seller.phone"]) || undefined}
          />
          {looking && <Loader2 className="absolute top-1/2 right-4 size-4 -translate-y-1/2 animate-spin text-muted" aria-label="Looking up" />}
        </div>
      </Field>

      {current?.found && (
        <div
          className={cn(
            "mt-4 flex items-start gap-3 rounded-xl border px-4 py-3",
            current.isBlocked ? "border-red-200 bg-red-50" : "border-brand-200 bg-brand-50",
          )}
        >
          {current.isBlocked ? (
            <ShieldBan className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
          ) : (
            <UserRoundCheck className="mt-0.5 size-5 shrink-0 text-brand-600" aria-hidden />
          )}
          <div className="min-w-0 text-sm">
            <p className="font-semibold text-ink">
              {current.name} <span className="tabular font-medium text-muted">· {current.code}</span>
            </p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-muted">
              <span>Seller</span>
              {current.verified && (
                <span className="inline-flex items-center gap-1 text-brand-700">
                  <BadgeCheck className="size-3.5" aria-hidden /> Verified
                </span>
              )}
            </p>
            {current.isBlocked && <p className="mt-1 font-medium text-red-700">This seller is blocked. Unblock them before adding plots.</p>}
          </div>
        </div>
      )}

      {current && !current.found && (
        <div className="mt-4 rounded-xl border border-dashed border-line-strong p-4">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
            <UserRoundPlus className="size-4 text-brand-600" aria-hidden /> New seller — they’ll get a Seller ID on WhatsApp
          </p>
          <div className="grid gap-4 sm:max-w-sm">
            <Field label="Seller name" htmlFor={`${uid}-name`} error={errors["seller.name"]}>
              <Input
                id={`${uid}-name`}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setErrors({});
                }}
                placeholder="e.g. Ramesh Yadav"
                autoComplete="off"
                maxLength={80}
                aria-invalid={Boolean(errors["seller.name"]) || undefined}
              />
            </Field>
          </div>
        </div>
      )}
    </section>
  );

  const publishToggle = (
    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line bg-white p-4 shadow-soft sm:p-5">
      <input
        type="checkbox"
        checked={publishNow}
        onChange={(e) => setPublishNow(e.target.checked)}
        className="mt-0.5 size-5 shrink-0 rounded accent-brand-600"
      />
      <span>
        <span className="block text-[15px] font-semibold text-ink">Publish immediately</span>
        <span className="block text-sm text-muted">
          Skip the review queue — you’ve already checked the photos and spoken to the seller. They’ll get the live link on WhatsApp.
        </span>
      </span>
    </label>
  );

  return (
    <ListingForm
      mode="admin"
      cities={cities}
      initial={defaultCityId ? { cityId: defaultCityId } : undefined}
      submitLabel={publishNow ? "Publish plot" : "Add to review"}
      action={action}
      extra={sellerSection}
      beforeSubmit={publishToggle}
    />
  );
}
