import { BatteryFull, CheckCheck, ChevronLeft, EllipsisVertical, Mic, Paperclip, Phone, Signal, Smile, Video, Wifi, Camera } from "lucide-react";
import Image from "next/image";
import { LogoMark } from "@/components/ui/logo";
import { cn } from "@/lib/cn";
import { site } from "@/lib/site";

type Bubble =
  | { from: "me" | "bot"; time: string; text: string; buttons?: string[] }
  | { from: "me"; time: string; photos: string[] };

/** A real listing chat, the way sellers actually write — Hinglish in, Hinglish back. */
const CHAT: Bubble[] = [
  { from: "me", time: "10:41", text: "Namaste, mujhe apni zameen bechni hai" },
  {
    from: "bot",
    time: "10:41",
    text: "Namaste ji! 🙏 Main aapki zameen list karne mein madad karunga. Zameen kis tarah ki hai?",
    buttons: ["🌾 Khet (Agricultural)", "🏠 Plot (Residential)"],
  },
  { from: "me", time: "10:42", text: "2 bigha khet hai, Sathiyaon, Azamgarh mein" },
  { from: "bot", time: "10:42", text: "👍 Samajh gaya: *Khet · 2 Bigha · Sathiyaon, Azamgarh*. Kitne mein bechna hai?" },
  { from: "me", time: "10:42", text: "18 lakh" },
  { from: "me", time: "10:43", photos: ["/demo/land-001.webp", "/demo/land-090.webp", "/demo/land-044.webp"] },
  {
    from: "bot",
    time: "10:44",
    text: "✅ Ho gaya, Ramesh ji! Team jaanch karke listing live karegi aur aapko yahin batayegi.\nSeller ID: *SLR-7A41K2*",
  },
];

/** WhatsApp-style *bold*. */
function rich(text: string) {
  return text.split(/(\*[^*]+\*)/g).map((part, i) => (part.startsWith("*") && part.endsWith("*") ? <strong key={i}>{part.slice(1, -1)}</strong> : part));
}

/**
 * A phone showing a WhatsApp chat with the assistant. One size everywhere
 * (like holding the phone), shrinking only when the screen is narrower than
 * the phone. Decorative: the story is told in the text around it.
 */
export function PhoneChat({ className }: { className?: string }) {
  return (
    <div className={cn("mx-auto w-[min(300px,100%)]", className)} aria-hidden>
      <div className="relative aspect-[300/650] rounded-[2.9rem] bg-[#0d1210] p-[9px] shadow-lift ring-1 ring-white/10">
        <div className="relative flex h-full flex-col overflow-hidden rounded-[2.35rem] bg-[#efeae2]">
          {/* Status bar + header */}
          <div className="bg-[#0a5c3b] text-white">
            <div className="relative flex h-8 items-center justify-between px-6 pt-1 text-[11px] font-semibold">
              <span>10:44</span>
              <span className="absolute top-1.5 left-1/2 h-[18px] w-[76px] -translate-x-1/2 rounded-full bg-black" />
              <span className="flex items-center gap-1">
                <Signal className="size-3" strokeWidth={2.6} />
                <Wifi className="size-3" strokeWidth={2.6} />
                <BatteryFull className="size-[15px]" strokeWidth={2} />
              </span>
            </div>
            <div className="flex items-center gap-2 px-2 pt-1 pb-2.5">
              <ChevronLeft className="size-5 shrink-0" />
              <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white">
                <LogoMark className="size-8" />
              </span>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="flex items-center gap-1 truncate text-[13px] font-semibold">
                  {site.name}
                  <svg viewBox="0 0 24 24" className="size-3.5 shrink-0" aria-hidden>
                    <path fill="#25d366" d="m12 1 2.6 2.1 3.3-.3.9 3.2 3 1.5-.9 3.2 1.4 3-2.6 2.1-.1 3.3-3.3.4-1.8 2.8-3.1-1.2-3 1.4-1.8-2.8-3.3-.3-.2-3.3L.8 14.6l1.4-3-.9-3.2 3-1.5.9-3.2 3.3.3z" />
                    <path fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" d="m7.8 12.2 2.8 2.7 5.6-5.6" />
                  </svg>
                </p>
                <p className="text-[10.5px] text-white/75">online</p>
              </div>
              <Video className="size-[18px] shrink-0 opacity-90" />
              <Phone className="ml-2.5 size-4 shrink-0 opacity-90" />
              <EllipsisVertical className="ml-1.5 size-4 shrink-0 opacity-90" />
            </div>
          </div>

          {/* Messages — newest at the bottom, like a chat you've scrolled through */}
          <div className="flex min-h-0 flex-1 flex-col justify-end gap-1.5 overflow-hidden px-2.5 pt-2 pb-2 text-[12px] leading-[1.4] text-[#111b21]">
            <p className="mx-auto mb-1 rounded-md bg-white/85 px-2 py-0.5 text-[10px] font-medium text-[#54656f] shadow-sm">Today</p>
            {CHAT.map((b, i) => {
              const me = b.from === "me";
              const continued = i > 0 && CHAT[i - 1].from === b.from;
              return (
                <div key={i} className={cn("flex", me ? "justify-end" : "justify-start", continued ? "-mt-0.5" : "mt-0.5")}>
                  <div
                    className={cn(
                      "relative max-w-[84%] rounded-lg shadow-[0_1px_0.5px_rgb(11_20_26/0.13)]",
                      me ? "bg-[#d9fdd3]" : "bg-white",
                      !continued && (me ? "rounded-tr-none" : "rounded-tl-none"),
                    )}
                  >
                    {"photos" in b ? (
                      <div className="relative p-1">
                        <div className="grid grid-cols-2 gap-0.5 overflow-hidden rounded-md">
                          {b.photos.slice(0, 2).map((src, j) => (
                            <div key={src} className="relative h-16 w-[70px]">
                              <Image src={src} alt="" fill sizes="80px" quality={50} className="object-cover" />
                              {j === 1 && b.photos.length > 2 && (
                                <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-sm font-semibold text-white">+{b.photos.length - 2}</span>
                              )}
                            </div>
                          ))}
                        </div>
                        <Meta time={b.time} me overlay />
                      </div>
                    ) : (
                      <>
                        <div className="relative px-2 pt-1.5 pb-1.5">
                          <p className="whitespace-pre-line">
                            {rich(b.text)}
                            <span className={cn("inline-block", me ? "w-[52px]" : "w-9")} />
                          </p>
                          <Meta time={b.time} me={me} />
                        </div>
                        {b.buttons && (
                          <div className="divide-y divide-[#e9edef] border-t border-[#e9edef]">
                            {b.buttons.map((t) => (
                              <p key={t} className="py-1.5 text-center text-[11.5px] font-medium text-[#027eb5]">
                                {t}
                              </p>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Composer */}
          <div className="flex items-center gap-1.5 px-2 pt-1 pb-5">
            <div className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-full bg-white px-3 text-[#8696a0] shadow-sm">
              <Smile className="size-[18px] shrink-0" />
              <span className="flex-1 truncate text-[12.5px]">Message</span>
              <Paperclip className="size-4 shrink-0 -rotate-45" />
              <Camera className="size-4 shrink-0" />
            </div>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#1daa61] text-white">
              <Mic className="size-[18px]" />
            </span>
          </div>
          <span className="absolute bottom-1.5 left-1/2 h-1 w-24 -translate-x-1/2 rounded-full bg-black/80" />
        </div>
      </div>
    </div>
  );
}

/** Time + read ticks in the bubble's bottom-right corner (the text leaves room for it). */
function Meta({ time, me, overlay = false }: { time: string; me: boolean; overlay?: boolean }) {
  return (
    <span
      className={cn(
        "absolute flex items-center gap-0.5 text-[9.5px]",
        overlay ? "right-2.5 bottom-2 text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.6)]" : "right-1.5 bottom-1 text-[#667781]",
      )}
    >
      {time}
      {me && <CheckCheck className={cn("size-3.5", overlay ? "text-white" : "text-[#53bdeb]")} />}
    </span>
  );
}
