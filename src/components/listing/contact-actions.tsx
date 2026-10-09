"use client";

import { Phone, ShieldCheck, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { WhatsAppIcon } from "@/components/ui/icons";
import { track } from "@/lib/analytics-client";
import { normalizePhoneNumber } from "@/lib/phone";
import { buyerToSellerLink } from "@/lib/whatsapp-links";

type Channel = "WHATSAPP" | "CALL";
type Buyer = { name: string; phone: string };
type PlotRef = { id: string; code: string; slug: string; title: string };

const STORAGE_KEY = "plots.buyer";

function readBuyer(): Buyer | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const b = raw ? (JSON.parse(raw) as Buyer) : null;
    return b?.name && b?.phone ? b : null;
  } catch {
    return null;
  }
}

/**
 * The marketplace's core action: buyer → seller on WhatsApp or a call.
 * First time only, we ask for a name and number (no OTP, remembered on the
 * device) so the seller knows who's calling and we can count enquiries.
 */
export function ContactActions({
  plot,
  sellerPhone,
  sellerName,
  variant,
  source,
}: {
  plot: PlotRef;
  sellerPhone: string;
  sellerName: string;
  variant: "bar" | "panel" | "icon";
  source: "detail" | "card";
}) {
  const [pending, setPending] = useState<Channel | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  function connect(channel: Channel, buyer: Buyer) {
    // Fire-and-forget so WhatsApp opens instantly; keepalive survives the navigation.
    fetch("/api/enquiries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ propertyId: plot.id, name: buyer.name, phone: buyer.phone, channel, source }),
      keepalive: true,
    }).catch(() => {});

    if (channel === "WHATSAPP") {
      const link = buyerToSellerLink(sellerPhone, plot, buyer.name);
      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      if (isMobile) window.location.href = link;
      else window.open(link, "_blank", "noopener");
    } else {
      window.location.href = `tel:${sellerPhone}`;
    }
  }

  function start(channel: Channel) {
    track(channel === "WHATSAPP" ? "whatsapp_click" : "call_click", { propertyId: plot.id, props: { source } });
    const buyer = readBuyer();
    if (buyer) return connect(channel, buyer);
    setPending(channel);
    dialogRef.current?.showModal();
  }

  return (
    <>
      {variant === "icon" ? (
        <button
          type="button"
          onClick={() => start("WHATSAPP")}
          aria-label={`Chat with ${sellerName} on WhatsApp about ${plot.title}`}
          className="relative z-10 flex size-10 items-center justify-center rounded-full bg-brand-600 text-white shadow-brand transition hover:bg-brand-700 active:scale-95"
        >
          <WhatsAppIcon className="size-5" />
        </button>
      ) : variant === "bar" ? (
        <div className="flex gap-2">
          <Button size="lg" onClick={() => start("WHATSAPP")} className="h-12 flex-1 px-4 md:h-10 md:text-sm">
            <WhatsAppIcon /> WhatsApp Seller
          </Button>
          <Button size="lg" variant="secondary" onClick={() => start("CALL")} className="h-12 px-5 md:h-10 md:px-4 md:text-sm" aria-label={`Call ${sellerName}`}>
            <Phone /> Call
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          <Button size="xl" onClick={() => start("WHATSAPP")} className="w-full">
            <WhatsAppIcon /> WhatsApp Seller
          </Button>
          <Button size="xl" variant="secondary" onClick={() => start("CALL")} className="w-full">
            <Phone /> Call seller
          </Button>
        </div>
      )}

      <BuyerDetailsDialog
        ref={dialogRef}
        sellerName={sellerName}
        channel={pending}
        onDone={(buyer) => {
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(buyer));
          } catch {}
          dialogRef.current?.close();
          if (pending) connect(pending, buyer);
        }}
      />
    </>
  );
}

function BuyerDetailsDialog({
  ref,
  sellerName,
  channel,
  onDone,
}: {
  ref: React.RefObject<HTMLDialogElement | null>;
  sellerName: string;
  channel: Channel | null;
  onDone: (buyer: Buyer) => void;
}) {
  const nameId = useId();
  const phoneId = useId();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (name.trim().length < 2) next.name = "Please enter your name";
    const normalized = normalizePhoneNumber(phone);
    if (!normalized.valid) next.phone = "Enter a valid 10-digit mobile number";
    setErrors(next);
    if (next.name || !normalized.valid) return;
    onDone({ name: name.trim(), phone: normalized.normalized });
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={`${nameId}-title`}
      className="m-0 mt-auto w-full max-w-none rounded-t-[1.75rem] bg-white p-0 shadow-lift open:animate-sheet-up sm:m-auto sm:max-w-md sm:rounded-3xl sm:open:animate-fade-up"
      onClick={(e) => {
        if (e.target === e.currentTarget) e.currentTarget.close();
      }}
    >
      <form onSubmit={submit} className="pb-safe px-5 pt-3 sm:p-7">
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-line-strong sm:hidden" aria-hidden />
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id={`${nameId}-title`} className="text-xl font-bold text-ink">
              {channel === "CALL" ? "Call" : "Message"} {sellerName.split(" ")[0]}
            </h2>
            <p className="mt-1 text-sm text-muted">Tell the seller who you are. We only ask once.</p>
          </div>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            className="-mt-1 -mr-2 flex size-10 items-center justify-center rounded-full text-muted hover:bg-mist"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <Field label="Your name" htmlFor={nameId} error={errors.name}>
            <Input id={nameId} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Amit Kumar" />
          </Field>
          <Field label="Mobile number" htmlFor={phoneId} error={errors.phone}>
            <div className="flex">
              <span className="flex h-12 items-center rounded-l-xl border border-r-0 border-line-strong bg-mist px-3.5 text-[15px] font-medium text-ink-soft">
                +91
              </span>
              <Input
                id={phoneId}
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/[^\d ]/g, "").slice(0, 11))}
                placeholder="98765 43210"
                className="rounded-l-none"
              />
            </div>
          </Field>
        </div>

        <Button type="submit" size="xl" className="mt-6 w-full">
          {channel === "CALL" ? <Phone /> : <WhatsAppIcon />}
          {channel === "CALL" ? "Continue to call" : "Continue to WhatsApp"}
        </Button>
        <p className="mt-3 mb-2 flex items-center justify-center gap-1.5 text-xs text-muted">
          <ShieldCheck className="size-3.5 text-brand-600" aria-hidden />
          Shared only with this seller. No spam, no login.
        </p>
      </form>
    </dialog>
  );
}
