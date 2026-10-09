import type { AreaUnit, LandType, ListingStatus } from "@/generated/prisma/enums";
import { formatPrice } from "@/lib/format";
import { LAND_TYPES } from "@/lib/land";
import { formatArea } from "@/lib/units";

/**
 * Everything the WhatsApp assistant says, in English and Hindi.
 *
 * Voice: a respectful, grounded helper from a land office you trust — warm,
 * short, never pushy, never promising a sale. Simple words; Hindi is
 * everyday Hindi (प्लॉट, फ़ोटो, लाख are fine), written so someone who
 * doesn't read English can list their land on their own.
 * Button titles stay ≤ 20 characters (WhatsApp's limit).
 */
export type Lang = "en" | "hi";

export function toLang(v: string | null | undefined): Lang {
  return v === "hi" ? "hi" : "en";
}

const SITE = "InstaPlots";

// ── Shared formatting ──

export function price(lang: Lang, value: number | bigint): string {
  const s = formatPrice(value);
  return lang === "hi" ? s.replace(/ Lakh$/, " लाख").replace(/ Cr$/, " करोड़") : s;
}

const HI_UNITS: Record<AreaUnit, string> = {
  SQFT: "वर्ग फ़ुट",
  SQYD: "गज",
  SQM: "वर्ग मीटर",
  ACRE: "एकड़",
  HECTARE: "हेक्टेयर",
  BIGHA: "बीघा",
  BISWA: "बिस्वा",
  MARLA: "मरला",
  KANAL: "कनाल",
};

export function area(lang: Lang, value: number, unit: AreaUnit): string {
  if (lang === "en") return formatArea(value, unit);
  return `${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(value)} ${HI_UNITS[unit]}`;
}

const LAND_HI: Record<LandType, { label: string; hint: string }> = {
  AGRICULTURAL: { label: "खेती की ज़मीन", hint: "खेत, बाग़-बगीचा" },
  RESIDENTIAL_PLOT: { label: "घर का प्लॉट", hint: "कॉलोनी या गाँव में मकान के लिए" },
  COMMERCIAL: { label: "कमर्शियल ज़मीन", hint: "दुकान, शोरूम, बाज़ार की सड़क" },
  INDUSTRIAL: { label: "इंडस्ट्रियल ज़मीन", hint: "फ़ैक्ट्री, गोदाम" },
  OTHER: { label: "अन्य ज़मीन", hint: "कोई और तरह की ज़मीन" },
};

const LAND_EN_HINTS: Record<LandType, string> = {
  AGRICULTURAL: "Khet / farmland, orchard",
  RESIDENTIAL_PLOT: "Plot for a house, in a colony or village",
  COMMERCIAL: "Shop, showroom, market road",
  INDUSTRIAL: "Factory, warehouse, godown",
  OTHER: "Any other kind of land",
};

export function landLabel(lang: Lang, lt: LandType): string {
  if (lang === "hi") return LAND_HI[lt].label;
  return lt === "OTHER" ? "Other land" : LAND_TYPES[lt].label;
}

export function landHint(lang: Lang, lt: LandType): string {
  return lang === "hi" ? LAND_HI[lt].hint : LAND_EN_HINTS[lt];
}

export const UNIT_ROWS: Record<Lang, { unit: AreaUnit; title: string; description: string }[]> = {
  en: [
    { unit: "BIGHA", title: "Bigha", description: "Common for farmland" },
    { unit: "BISWA", title: "Biswa", description: "1 Bigha = 20 Biswa" },
    { unit: "MARLA", title: "Marla", description: "Punjab, Haryana, Chandigarh" },
    { unit: "KANAL", title: "Kanal", description: "1 Kanal = 20 Marla" },
    { unit: "ACRE", title: "Acre / Killa", description: "43,560 sq ft" },
    { unit: "SQFT", title: "Square feet", description: "Common for house plots" },
    { unit: "SQYD", title: "Gaj (sq yd)", description: "1 Gaj = 9 sq ft" },
    { unit: "SQM", title: "Square metre", description: "≈ 10.76 sq ft" },
    { unit: "HECTARE", title: "Hectare", description: "≈ 2.47 acres" },
  ],
  hi: [
    { unit: "BIGHA", title: "बीघा", description: "खेती की ज़मीन में आम" },
    { unit: "BISWA", title: "बिस्वा", description: "1 बीघा = 20 बिस्वा" },
    { unit: "MARLA", title: "मरला", description: "पंजाब, हरियाणा, चंडीगढ़" },
    { unit: "KANAL", title: "कनाल", description: "1 कनाल = 20 मरला" },
    { unit: "ACRE", title: "एकड़ / किल्ला", description: "43,560 वर्ग फ़ुट" },
    { unit: "SQFT", title: "वर्ग फ़ुट", description: "घर के प्लॉट में आम" },
    { unit: "SQYD", title: "गज (वर्ग गज)", description: "1 गज = 9 वर्ग फ़ुट" },
    { unit: "SQM", title: "वर्ग मीटर", description: "≈ 10.76 वर्ग फ़ुट" },
    { unit: "HECTARE", title: "हेक्टेयर", description: "≈ 2.47 एकड़" },
  ],
};

const STATUS: Record<Lang, Record<ListingStatus, string>> = {
  en: { PENDING: "⏳ Being checked by our team", ACTIVE: "✅ Live", HIDDEN: "🙈 Hidden", SOLD: "🏁 Sold", REJECTED: "❌ Not approved" },
  hi: { PENDING: "⏳ हमारी टीम जाँच रही है", ACTIVE: "✅ लाइव", HIDDEN: "🙈 छुपी हुई", SOLD: "🏁 बिक गई", REJECTED: "❌ मंज़ूर नहीं हुई" },
};

export function statusWord(lang: Lang, status: ListingStatus): string {
  return STATUS[lang][status];
}

export function daysAgo(lang: Lang, d: Date): string {
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (lang === "hi") return days <= 0 ? "आज" : days === 1 ? "कल" : `${days} दिन पहले`;
  return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}

const first = (name: string) => name.trim().split(/\s+/)[0] ?? name;

// ── The language picker (always bilingual) ──

export const LANGUAGE_PICKER = {
  body: `Namaste 🙏 Welcome to *${SITE}*.\nWhich language would you like to chat in?\n\nनमस्ते 🙏 *${SITE}* में आपका स्वागत है।\nआप किस भाषा में बात करना चाहेंगे?`,
  buttons: [
    { id: "lang:en", title: "English" },
    { id: "lang:hi", title: "हिंदी" },
  ],
};

// ── Messages ──

type Vars = Record<string, string | number>;

function catalog(lang: Lang) {
  const en = lang === "en";
  return {
    languageSet: en ? "Great — we'll chat in English. 🙏 (Send *LANGUAGE* anytime to switch.)" : "ठीक है जी — अब हम हिंदी में बात करेंगे। 🙏 (भाषा बदलने के लिए कभी भी *भाषा* लिखें।)",

    // Menu
    welcomeNew: en
      ? `Namaste 🙏 Welcome to *${SITE}*.\n\nEvery piece of land has the right buyer somewhere. We help you reach them — simply and directly.\n\n• List your land here on WhatsApp — about 2 minutes\n• Our team checks it, then it goes live\n• Buyers call or message *you* directly\n\nListing is free. What would you like to do?`
      : `नमस्ते जी 🙏 *${SITE}* में आपका स्वागत है।\n\nहर ज़मीन का कहीं न कहीं सही खरीदार होता है। हम आपको उन तक सीधे और आसानी से पहुँचाते हैं।\n\n• यहीं WhatsApp पर ज़मीन डालें — लगभग 2 मिनट\n• हमारी टीम जाँच करती है, फिर लिस्टिंग लाइव होती है\n• खरीदार सीधे *आपको* कॉल या मैसेज करते हैं\n\nलिस्टिंग मुफ़्त है। आप क्या करना चाहेंगे?`,
    welcomeBack: (v: Vars) =>
      en
        ? `Namaste ${first(String(v.name))} ji 🙏\nYour Seller ID: *${v.code}*\n\nWhat would you like to do today?`
        : `नमस्ते ${first(String(v.name))} जी 🙏\nआपकी सेलर ID: *${v.code}*\n\nआज आप क्या करना चाहेंगे?`,
    btnList: en ? "List my land" : "ज़मीन लिस्ट करें",
    btnMine: en ? "My listings" : "मेरी लिस्टिंग",
    btnTalk: en ? "Talk to us" : "हमसे बात करें",
    backWithAssistant: en ? `👋 You're back with the ${SITE} assistant.` : `👋 आप फिर से ${SITE} असिस्टेंट के साथ हैं।`,
    help: (v: Vars) =>
      en
        ? [
            "Here's how I can help 🙂",
            "",
            "• *SELL* — list your land (about 2 minutes)",
            "• *STATUS* — see your listings",
            "• *ID* — your Seller ID",
            "• *YES* — your land is still available",
            "• *NO* — it's sold (e.g. *NO 2* for listing 2)",
            "• *SOLD* — mark a listing as sold",
            "• *TALK* — talk to a person from our team",
            "• *CANCEL* — stop the current listing",
            "• *LANGUAGE* — हिंदी / English",
            "",
            `Manage everything online: ${v.url}/seller`,
          ].join("\n")
        : [
            "मैं इन कामों में मदद कर सकता हूँ 🙂",
            "",
            "• *बेचना* या *SELL* — ज़मीन लिस्ट करें (लगभग 2 मिनट)",
            "• *स्टेटस* — अपनी लिस्टिंग देखें",
            "• *ID* — आपकी सेलर ID",
            "• *हाँ* — ज़मीन अभी भी उपलब्ध है",
            "• *नहीं* — ज़मीन बिक गई (जैसे *नहीं 2* — दूसरी लिस्टिंग)",
            "• *बिक गई* — लिस्टिंग को बिका हुआ बताएँ",
            "• *बात करनी है* — हमारी टीम से बात करें",
            "• *रद्द* — अभी की लिस्टिंग रोकें",
            "• *भाषा* — English / हिंदी",
            "",
            `सब कुछ ऑनलाइन देखें: ${v.url}/seller`,
          ].join("\n"),
    continueListing: en ? "👇 Let's continue your listing." : "👇 चलिए, आपकी लिस्टिंग आगे बढ़ाते हैं।",
    greetingMidListing: en ? "Namaste 🙏 We were in the middle of your listing." : "नमस्ते जी 🙏 हम आपकी लिस्टिंग भर रहे थे।",
    cancelled: en
      ? "Okay, I've stopped this listing. Nothing was sent.\n\nWhenever you're ready, tap *List my land*."
      : "ठीक है, यह लिस्टिंग रोक दी है। कुछ भी भेजा नहीं गया।\n\nजब भी तैयार हों, *ज़मीन लिस्ट करें* दबाइए।",
    whenReady: en ? "Okay 👍 Whenever you're ready, tap *List my land*." : "ठीक है 👍 जब भी तैयार हों, *ज़मीन लिस्ट करें* दबाइए।",
    human: en
      ? `🙋 Of course. Someone from the ${SITE} team will reply here soon.\n\nYou can type your question now. To come back to the assistant anytime, send *MENU*.`
      : `🙋 ज़रूर जी। ${SITE} टीम से कोई जल्द ही यहीं जवाब देगा।\n\nआप अपना सवाल अभी लिख सकते हैं। असिस्टेंट पर वापस आने के लिए कभी भी *मेनू* लिखें।`,
    errorGeneric: en
      ? "Sorry, something went wrong on our side 🙏 Please try again in a moment, or send *TALK* to reach our team."
      : "माफ़ कीजिए, हमारी तरफ़ से कुछ गड़बड़ हुई 🙏 थोड़ी देर में फिर कोशिश करें, या टीम से बात करने के लिए *बात करनी है* लिखें।",
    voiceNote: en
      ? "🎙️ Sorry, I can't listen to voice notes yet. Please type your answer — or send *TALK* and someone from our team will help."
      : "🎙️ माफ़ कीजिए, अभी मैं वॉइस मैसेज नहीं सुन पाता। कृपया लिखकर भेजें — या *बात करनी है* लिखें, हमारी टीम मदद करेगी।",
    unsupported: en ? "Sorry, I can only read text, photos and location pins 🙏" : "माफ़ कीजिए, मैं सिर्फ़ टेक्स्ट, फ़ोटो और लोकेशन पढ़ पाता हूँ 🙏",
    blocked: en
      ? "Sorry, we can't accept new listings from this number right now. Send *TALK* if you think this is a mistake."
      : "माफ़ कीजिए, अभी इस नंबर से नई लिस्टिंग नहीं ली जा सकती। अगर यह ग़लती लगे तो *बात करनी है* लिखें।",

    // Status / ID
    noPlotsYetInFlow: en ? "This will be your first listing with us — welcome! 🙂" : "यह हमारे साथ आपकी पहली लिस्टिंग होगी — स्वागत है! 🙂",
    noPlotsYet: en
      ? "You haven't listed any land with us yet.\n\nTap *List my land* to add your first — it takes about 2 minutes."
      : "आपने अभी तक हमारे साथ कोई ज़मीन लिस्ट नहीं की है।\n\nपहली लिस्टिंग के लिए *ज़मीन लिस्ट करें* दबाइए — लगभग 2 मिनट लगते हैं।",
    yourListings: en ? "📋 *Your listings*" : "📋 *आपकी लिस्टिंग*",
    andMore: (v: Vars) => (en ? `…and ${v.n} more.` : `…और ${v.n} लिस्टिंग।`),
    confirmed: (v: Vars) => (en ? `confirmed ${v.when}` : `${v.when} पक्की की गई`),
    unavailableReplyYes: en ? "⏸️ Paused – reply *YES* to bring it back" : "⏸️ रुकी हुई – वापस लाने के लिए *हाँ* लिखें",
    liveReplyYes: en ? "✅ Live – reply *YES* if still available" : "✅ लाइव – अभी भी उपलब्ध है तो *हाँ* लिखें",
    noneListed: en ? "You don't have any listings yet. Send *SELL* to add one." : "अभी कोई लिस्टिंग नहीं है। जोड़ने के लिए *बेचना* लिखें।",
    idLine: (v: Vars) => (en ? `Your Seller ID: *${v.code}*` : `आपकी सेलर ID: *${v.code}*`),
    manageAt: (v: Vars) => (en ? `See and manage everything at ${v.url}/seller` : `सब कुछ यहाँ देखें और बदलें: ${v.url}/seller`),
    noIdYet: en
      ? "You'll get your Seller ID as soon as you list your first land. Send *SELL* to start."
      : "पहली ज़मीन लिस्ट करते ही आपको सेलर ID मिल जाएगी। शुरू करने के लिए *बेचना* लिखें।",
    yourId: (v: Vars) =>
      en
        ? `🪪 Your Seller ID is *${v.code}*\n\nUse it to sign in at ${v.url}/seller — we'll send a code to this WhatsApp number. It never changes, so keep it handy.`
        : `🪪 आपकी सेलर ID है *${v.code}*\n\nइससे ${v.url}/seller पर लॉग इन करें — हम इसी WhatsApp नंबर पर कोड भेजेंगे। यह ID कभी नहीं बदलती, संभाल कर रखें।`,

    // Availability
    nothingToConfirm: en
      ? "Thank you! 👍 Nothing needs confirming right now — your listings are up to date.\n\nSend *STATUS* to see them."
      : "धन्यवाद जी! 👍 अभी कुछ पक्का करने की ज़रूरत नहीं — आपकी लिस्टिंग अप-टू-डेट हैं।\n\nदेखने के लिए *स्टेटस* लिखें।",
    staysLiveOne: (v: Vars) => (en ? `Thank you — your listing stays live. 👍\n\n*${v.title}*` : `धन्यवाद जी — आपकी लिस्टिंग लाइव रहेगी। 👍\n\n*${v.title}*`),
    staysLiveMany: (v: Vars) => (en ? `Thank you — your listings stay live. 👍\n\n${v.list}` : `धन्यवाद जी — आपकी लिस्टिंग लाइव रहेंगी। 👍\n\n${v.list}`),
    backLiveOne: (v: Vars) =>
      en
        ? `${v.also ? "And it's" : "👍 Thank you! It's"} live again — buyers can see it now:\n\n*${v.title}*\n${v.link}`
        : `${v.also ? "और यह" : "👍 धन्यवाद जी! यह"} फिर से लाइव है — खरीदार अब इसे देख सकते हैं:\n\n*${v.title}*\n${v.link}`,
    backLiveMany: (v: Vars) =>
      en
        ? `${v.also ? "And these are" : "👍 Thank you! These are"} live again — buyers can see them now:\n\n${v.list}`
        : `${v.also ? "और ये" : "👍 धन्यवाद जी! ये"} फिर से लाइव हैं — खरीदार अब इन्हें देख सकते हैं:\n\n${v.list}`,
    noLivePlots: en
      ? "Okay 👍 You don't have any live listings right now.\n\nSend *STATUS* to see them, or *SELL* to list new land."
      : "ठीक है 👍 अभी आपकी कोई लाइव लिस्टिंग नहीं है।\n\nदेखने के लिए *स्टेटस*, नई ज़मीन के लिए *बेचना* लिखें।",
    noNumber: (v: Vars) => (en ? `There's no number ${v.n} in the list 🙏` : `सूची में नंबर ${v.n} नहीं है 🙏`),
    whichSold: en ? "Which land has been sold?" : "कौन-सी ज़मीन बिक गई है?",
    replyNumberOrTap: en ? "Reply with its number, or tap below." : "उसका नंबर लिखें, या नीचे दबाएँ।",
    tapToChoose: en ? "Tap below to choose." : "चुनने के लिए नीचे दबाएँ।",
    chooseProperty: en ? "Choose listing" : "लिस्टिंग चुनें",
    replyWithNumber: en ? "Please reply with the number from the list, or tap *Choose listing* 👇" : "कृपया सूची से नंबर लिखें, या *लिस्टिंग चुनें* दबाएँ 👇",
    notFound: en ? "Sorry, I couldn't find that listing. Send *STATUS* to see yours." : "माफ़ कीजिए, वह लिस्टिंग नहीं मिली। अपनी लिस्टिंग देखने के लिए *स्टेटस* लिखें।",
    alreadySold: (v: Vars) => (en ? `*${v.title}* is already marked as sold. 👍` : `*${v.title}* पहले से बिकी हुई दर्ज है। 👍`),
    notLive: (v: Vars) =>
      en ? `*${v.title}* isn't live, so there's nothing to change. Send *STATUS* to see your listings.` : `*${v.title}* लाइव नहीं है, इसलिए कुछ बदलना नहीं है। लिस्टिंग देखने के लिए *स्टेटस* लिखें।`,
    soldCongrats: (v: Vars) =>
      en
        ? `Congratulations! 🎉 We've marked it as sold.\n\n*${v.title}*\n\nThank you for trusting ${SITE}. Whenever you have more land to sell, just send *SELL*.`
        : `बहुत-बहुत बधाई! 🎉 हमने इसे बिका हुआ दर्ज कर दिया है।\n\n*${v.title}*\n\n${SITE} पर भरोसा करने के लिए धन्यवाद। जब भी और ज़मीन बेचनी हो, बस *बेचना* लिखें।`,
    soldAskOthers: (v: Vars) =>
      en
        ? `Congratulations! 🎉 *${v.title}* is marked as sold.\n\n${v.many ? "Are the others still available?" : "Is this one still available?"}\n\n${v.list}`
        : `बधाई हो! 🎉 *${v.title}* बिकी हुई दर्ज हो गई।\n\n${v.many ? "क्या बाकी अभी भी उपलब्ध हैं?" : "क्या यह अभी भी उपलब्ध है?"}\n\n${v.list}`,
    btnYesAvailable: en ? "YES, available" : "हाँ, उपलब्ध है",
    btnAnotherSold: en ? "Another is sold" : "दूसरी भी बिकी",
    btnAlsoSold: en ? "NO, it's sold too" : "नहीं, यह भी बिकी",
    noSellable: en ? "You don't have any live listings to mark as sold. Send *STATUS* to see yours." : "बिका हुआ दर्ज करने के लिए कोई लाइव लिस्टिंग नहीं है। *स्टेटस* लिखकर देखें।",
    whichSoldCongrats: en ? "Congratulations! 🎉 Which land has been sold?" : "बधाई हो! 🎉 कौन-सी ज़मीन बिकी है?",
    choosePlot: en ? "Choose listing" : "लिस्टिंग चुनें",
    confirmSold: (v: Vars) =>
      en
        ? `Mark *${v.title}* (${v.code}) as sold?\n\nBuyers will no longer see it on ${SITE}.`
        : `क्या *${v.title}* (${v.code}) को बिका हुआ दर्ज करें?\n\nइसके बाद खरीदार इसे ${SITE} पर नहीं देखेंगे।`,
    btnYesSold: en ? "Yes, it's sold" : "हाँ, बिक गई",
    btnStillAvailable: en ? "No, still available" : "नहीं, उपलब्ध है",
    staysAsIs: (v: Vars) => (en ? `👍 Okay — *${v.title}* stays as it is.` : `👍 ठीक है — *${v.title}* जैसी है वैसी रहेगी।`),
    liveAgainShort: (v: Vars) => (en ? `👍 *${v.title}* is live again — buyers can see it now.` : `👍 *${v.title}* फिर से लाइव है — खरीदार अब देख सकते हैं।`),
    alreadyStatus: (v: Vars) => (en ? `*${v.title}* (${v.code}) is already ${v.status}.` : `*${v.title}* (${v.code}) पहले से ${v.status} है।`),

    // Listing flow
    startNew: en
      ? `Namaste 🙏 Let's put your land in front of the right buyers.\n\nI'll ask a few simple questions, one at a time — it takes about 2 minutes. Our team checks every listing before it goes live, so buyers trust what they see.\n\n(Send *CANCEL* anytime to stop.)`
      : `नमस्ते जी 🙏 चलिए आपकी ज़मीन को सही खरीदारों तक पहुँचाते हैं।\n\nमैं एक-एक करके कुछ आसान सवाल पूछूँगा — लगभग 2 मिनट लगेंगे। हर लिस्टिंग को लाइव होने से पहले हमारी टीम जाँचती है, ताकि खरीदार भरोसा कर सकें।\n\n(रोकने के लिए कभी भी *रद्द* लिखें।)`,
    startReturning: (v: Vars) =>
      en
        ? `Namaste ${first(String(v.name))} ji 🙏 Good to see you again.\nYour Seller ID: *${v.code}*\n\nLet's list your new land. (Send *CANCEL* anytime to stop.)`
        : `नमस्ते ${first(String(v.name))} जी 🙏 फिर से मिलकर अच्छा लगा।\nआपकी सेलर ID: *${v.code}*\n\nचलिए नई ज़मीन लिस्ट करते हैं। (रोकने के लिए कभी भी *रद्द* लिखें।)`,
    restartTop: en ? "No problem — let's start again from the top." : "कोई बात नहीं — शुरू से करते हैं।",
    restart: en ? "No problem — let's start again. 🔄" : "कोई बात नहीं — फिर से शुरू करते हैं। 🔄",
    askNameSuggested: (v: Vars) =>
      en
        ? `First, what is your *name*?\n\nShould we use *${v.name}*? Tap the button, or just type your name.`
        : `सबसे पहले, आपका *नाम* क्या है?\n\nक्या *${v.name}* रखें? बटन दबाइए, या अपना नाम लिख दीजिए।`,
    btnUseName: (v: Vars) => (en ? `Yes, ${first(String(v.name))}` : `हाँ, ${first(String(v.name))}`),
    askName: en ? "First, what is your *name*? (e.g. Ramesh Yadav)" : "सबसे पहले, आपका *नाम* क्या है? (जैसे: रमेश यादव)",
    askLandType: en ? "What kind of land is it?" : "यह किस तरह की ज़मीन है?",
    chooseLandType: en ? "Choose land type" : "ज़मीन का प्रकार",
    askState: en
      ? "Which *state* is the land in?\n\nPick from the list, or just type it — e.g. _Punjab_, _Uttar Pradesh_, _Gujarat_."
      : "ज़मीन किस *राज्य* में है?\n\nसूची से चुनें, या लिख दें — जैसे _पंजाब_, _उत्तर प्रदेश_, _गुजरात_।",
    chooseState: en ? "Choose state" : "राज्य चुनें",
    askCityTyped: (v: Vars) =>
      en
        ? `🏙️ Which *city or district*${v.state ? ` in ${v.state}` : ""} is the land in? Just type it — e.g. _Mohali_, _Azamgarh_, _Nashik_.`
        : `🏙️ ज़मीन${v.state ? ` ${v.state} के` : ""} किस *शहर या ज़िले* में है? बस लिख दें — जैसे _मोहाली_, _आज़मगढ़_, _नासिक_।`,
    askCityList: (v: Vars) =>
      en
        ? `Which *city or district*${v.state ? ` in ${v.state}` : ""} is the land in?\n\nPick from the list, or type it if yours isn't there.`
        : `ज़मीन${v.state ? ` ${v.state} के` : ""} किस *शहर या ज़िले* में है?\n\nसूची से चुनें, या अगर आपका शहर नहीं है तो लिख दें।`,
    chooseCity: en ? "Choose city" : "शहर चुनें",
    askLocality: en
      ? "📍 Which *village or area* is it in? Please add a nearby *landmark* too — it helps buyers find it.\n\n_e.g. Rampur, near Panchayat Bhawan — or Sector 70, opposite the market_"
      : "📍 ज़मीन किस *गाँव या इलाके* में है? पास का कोई *पहचान का स्थान* भी लिखें — इससे खरीदार आसानी से समझ पाते हैं।\n\n_जैसे: रामपुर, पंचायत भवन के पास — या सेक्टर 70, बाज़ार के सामने_",
    askArea: en
      ? "📐 How big is the land? Send the size with its unit — e.g. *2 bigha*, *10 marla*, *1 kanal*, *1.5 acre*, *1200 sq ft* or *200 gaj*."
      : "📐 ज़मीन कितनी बड़ी है? माप इकाई के साथ लिखें — जैसे *2 बीघा*, *10 मरला*, *1 कनाल*, *1.5 एकड़*, *1200 वर्ग फ़ुट* या *200 गज*।",
    askUnit: (v: Vars) => (en ? `*${v.n}* — in which unit?` : `*${v.n}* — किस इकाई में?`),
    chooseUnit: en ? "Choose unit" : "इकाई चुनें",
    askPrice: en
      ? "💰 What is your *total asking price* for the whole land? e.g. *18 lakh*, *1.2 crore* or *1800000*.\n\nBuyers can still negotiate with you directly."
      : "💰 पूरी ज़मीन की *कुल माँगी गई कीमत* क्या है? जैसे *18 लाख*, *1.2 करोड़* या *1800000*।\n\nखरीदार आपसे सीधे मोल-भाव कर सकते हैं।",
    askPhotosFirst: (v: Vars) =>
      en
        ? `📸 Now send *photos* of the land — up to ${v.max}. Buyers trust what they can see, and listings with photos get far more calls.\n\nTip: show the road, the boundary and the whole plot. Send them, then tap *Done*.`
        : `📸 अब ज़मीन की *फ़ोटो* भेजें — ${v.max} तक। खरीदार जो देखते हैं उस पर भरोसा करते हैं, फ़ोटो वाली लिस्टिंग पर कहीं ज़्यादा कॉल आते हैं।\n\nसुझाव: रास्ता, बाउंड्री और पूरी ज़मीन दिखाएँ। भेजकर *हो गया* दबाएँ।`,
    askPhotosMore: (v: Vars) =>
      en
        ? `📸 You've sent ${v.n} photo${Number(v.n) === 1 ? "" : "s"} so far. Send more (up to ${v.max}), or tap *Done*.`
        : `📸 अब तक ${v.n} फ़ोटो आ गई हैं। और भेजें (${v.max} तक), या *हो गया* दबाएँ।`,
    btnDone: en ? "Done" : "हो गया",
    btnSkipPhotos: en ? "Skip photos" : "फ़ोटो बाद में",
    askLocation: en
      ? "🗺️ Can you share the land's *location pin*? Tap 📎 → *Location* → send the spot (easiest when you're at the land).\n\nBuyers only see the approximate area — never your exact pin."
      : "🗺️ क्या आप ज़मीन की *लोकेशन* भेज सकते हैं? 📎 दबाएँ → *Location* → जगह भेजें (ज़मीन पर खड़े होकर भेजना सबसे आसान है)।\n\nखरीदार सिर्फ़ आस-पास का इलाका देखते हैं — आपकी सही लोकेशन कभी नहीं।",
    btnSkip: en ? "Skip" : "छोड़ें",
    askDescription: en
      ? "✍️ Last step: in a line or two, tell buyers what makes this land good — road width, electricity, water, boundary, distance to the highway or market, papers ready…\n\nOr tap *Skip* and we'll write a short description for you."
      : "✍️ आख़िरी सवाल: एक-दो लाइन में बताइए कि ज़मीन में क्या ख़ास है — रास्ते की चौड़ाई, बिजली, पानी, बाउंड्री, हाईवे या बाज़ार से दूरी, काग़ज़ तैयार…\n\nया *छोड़ें* दबाएँ, हम छोटा विवरण ख़ुद लिख देंगे।",
    confirmPrompt: en
      ? "Everything right? Tap *Submit*. Our team will check it and message you as soon as it's live."
      : "सब सही है? *भेजें* दबाइए। हमारी टीम जाँच करेगी और लाइव होते ही आपको मैसेज करेगी।",
    btnSubmit: en ? "Submit ✅" : "भेजें ✅",
    btnStartOver: en ? "Start over" : "फिर से शुरू",
    btnCancel: en ? "Cancel" : "रद्द करें",
    idleNudge: en ? "Send *SELL* to list your land, or *HELP* to see what I can do." : "ज़मीन लिस्ट करने के लिए *बेचना* लिखें, या *मदद* लिखकर देखें मैं क्या कर सकता हूँ।",
    checkListing: en ? "📋 *Please check your listing*" : "📋 *कृपया अपनी लिस्टिंग जाँच लें*",
    sumType: en ? "Type" : "प्रकार",
    sumPlace: en ? "Place" : "जगह",
    sumSize: en ? "Size" : "माप",
    sumPrice: en ? "Price" : "कीमत",
    sumPriceNote: en ? "(total, negotiable)" : "(कुल, मोल-भाव संभव)",
    sumPhotos: en ? "Photos" : "फ़ोटो",
    sumNone: en ? "none" : "नहीं",
    sumPin: en ? "Location pin" : "लोकेशन",
    sumShared: en ? "shared ✓" : "भेजी गई ✓",
    sumNotShared: en ? "not shared" : "नहीं भेजी",
    sumSeller: en ? "Seller" : "सेलर",

    // Answers
    thanksLocationIdle: en ? "Thanks for the location 📍" : "लोकेशन के लिए धन्यवाद 📍",
    typeName: en ? "Please type your name (just your name, e.g. *Ramesh Yadav*)." : "कृपया अपना नाम लिखें (सिर्फ़ नाम, जैसे *रमेश यादव*)।",
    thanksName: (v: Vars) => (en ? `Thank you, ${first(String(v.name))} ji! 🙏` : `धन्यवाद, ${first(String(v.name))} जी! 🙏`),
    chooseLandTypeFromList: en ? "Please choose the land type from the list 👇" : "कृपया सूची से ज़मीन का प्रकार चुनें 👇",
    unknownState: en
      ? "I didn't recognise that state. Please pick one from the list, or type its name (e.g. *Punjab*)."
      : "यह राज्य समझ नहीं आया। कृपया सूची से चुनें, या नाम लिखें (जैसे *पंजाब*)।",
    stateOk: (v: Vars) => (en ? `🗺️ State: *${v.state}*` : `🗺️ राज्य: *${v.state}*`),
    typeCity: en ? "Please type the city or district name." : "कृपया शहर या ज़िले का नाम लिखें।",
    typeCityEnglish: en
      ? "I couldn't find that place. Please type the city or district name in English letters — e.g. *Azamgarh*."
      : "यह जगह नहीं मिली। कृपया शहर या ज़िले का नाम अंग्रेज़ी अक्षरों में लिखें — जैसे *Azamgarh*।",
    typeLocalityFirst: en ? "Thanks! I'll ask for the pin in a moment — first, please *type* the village or area name." : "धन्यवाद! लोकेशन थोड़ी देर में माँगूँगा — पहले गाँव या इलाके का *नाम लिख* दीजिए।",
    typeLocality: en ? "Please type the village or area name." : "कृपया गाँव या इलाके का नाम लिखें।",
    didntGetSize: en ? "Sorry, I didn't get the size 🙏" : "माफ़ कीजिए, माप समझ नहीं आया 🙏",
    chooseUnitFromList: en ? "Please choose the unit from the list 👇" : "कृपया सूची से इकाई चुनें 👇",
    typePriceAgain: en ? "No problem — please type the total price again." : "कोई बात नहीं — कृपया कुल कीमत फिर से लिखें।",
    totalNotPerUnit: en ? "Please send the *total* price for the whole land, not the rate per unit 🙏" : "कृपया पूरी ज़मीन की *कुल* कीमत भेजें, प्रति बीघा/प्रति गज का रेट नहीं 🙏",
    didYouMean: (v: Vars) => (en ? `Did you mean *${v.price}*?` : `क्या आपका मतलब *${v.price}* है?`),
    btnYesPrice: (v: Vars) => (en ? `Yes, ${v.price}` : `हाँ, ${v.price}`),
    btnNo: en ? "No" : "नहीं",
    didntGetPrice: en ? "Sorry, I didn't get the price 🙏" : "माफ़ कीजिए, कीमत समझ नहीं आई 🙏",
    noPhotosYet: en
      ? "You haven't sent any photos yet. Send a few now — or tap *Skip photos* to continue without them."
      : "अभी तक कोई फ़ोटो नहीं आई। कुछ फ़ोटो भेजें — या *फ़ोटो बाद में* दबाकर आगे बढ़ें।",
    photosAdded: (v: Vars) => (en ? `👍 ${v.n} photo${Number(v.n) === 1 ? "" : "s"} added.` : `👍 ${v.n} फ़ोटो जुड़ गईं।`),
    noPhotosOk: en
      ? "Okay, no photos for now. (You can send them here later — listings with photos sell faster.)"
      : "ठीक है, अभी फ़ोटो नहीं। (बाद में यहीं भेज सकते हैं — फ़ोटो वाली ज़मीन जल्दी बिकती है।)",
    locationSaved: en ? "📍 Location saved — thank you!" : "📍 लोकेशन सेव हो गई — धन्यवाद!",
    sendPhotosOrTap: en ? "Please send photos of the land, or tap a button 👇" : "कृपया ज़मीन की फ़ोटो भेजें, या कोई बटन दबाएँ 👇",
    noProblem: en ? "Okay, no problem." : "ठीक है, कोई बात नहीं।",
    sendPinOrSkip: en ? "Please send the location pin (📎 → Location), or tap *Skip*." : "कृपया लोकेशन भेजें (📎 → Location), या *छोड़ें* दबाएँ।",
    gotLocationNowDesc: en ? "📍 Got the location! Now please type a short description, or tap *Skip*." : "📍 लोकेशन मिल गई! अब छोटा-सा विवरण लिखें, या *छोड़ें* दबाएँ।",
    confirmHint: en
      ? "Tap *Submit* to send it for checking, *Start over* to change something, or *Cancel*."
      : "जाँच के लिए भेजने को *भेजें*, कुछ बदलने को *फिर से शुरू*, या *रद्द करें* दबाएँ।",
    alreadySubmitted: en ? "✅ This listing has already been sent. Send *STATUS* to see your listings." : "✅ यह लिस्टिंग पहले ही भेजी जा चुकी है। देखने के लिए *स्टेटस* लिखें।",
    photoThanksIdle: en
      ? "Thank you for the photo! 📸 To list your land, tap *List my land* and send photos when I ask."
      : "फ़ोटो के लिए धन्यवाद! 📸 ज़मीन लिस्ट करने के लिए *ज़मीन लिस्ट करें* दबाएँ, और पूछने पर फ़ोटो भेजें।",
    photoFailed: en ? "Sorry, I couldn't save that photo 🙏 Please try sending it again." : "माफ़ कीजिए, यह फ़ोटो सेव नहीं हो पाई 🙏 कृपया फिर से भेजें।",
    photoMax: (v: Vars) => (en ? `You've already sent ${v.max} photos — that's the maximum. 👍` : `आप ${v.max} फ़ोटो भेज चुके हैं — इससे ज़्यादा नहीं जुड़ सकतीं। 👍`),
    photoAddedOutside: (v: Vars) => (en ? `📸 Photo added to your listing (${v.n} so far).` : `📸 फ़ोटो लिस्टिंग में जुड़ गई (अब तक ${v.n})।`),
    photoMaxDone: (v: Vars) => (en ? `✅ ${v.max} photos received — that's the maximum. A great set!` : `✅ ${v.max} फ़ोटो मिल गईं — यही अधिकतम है। बहुत बढ़िया!`),
    photoReceived: (v: Vars) => (en ? `✅ Photo ${v.n} received. Send more, or tap *Done*.` : `✅ फ़ोटो ${v.n} मिल गई। और भेजें, या *हो गया* दबाएँ।`),
    oneMoreThing: en ? "One more thing before we send it:" : "भेजने से पहले एक और बात:",
    understood: (v: Vars) => (en ? `👍 Noted: ${v.items}` : `👍 समझ गया: ${v.items}`),
    stopConfirm: en ? "Do you want to stop this listing? What you've filled so far will be cleared." : "क्या आप यह लिस्टिंग रोकना चाहते हैं? अब तक भरी जानकारी हट जाएगी।",
    btnStop: en ? "Yes, stop" : "हाँ, रोकें",
    btnKeepGoing: en ? "Continue" : "जारी रखें",
    browseLand: (v: Vars) => (en ? `👉 See land for sale here: ${v.url}` : `👉 बिकाऊ ज़मीन यहाँ देखें: ${v.url}`),
    needsFixing: (v: Vars) => (en ? `⚠️ One thing needs fixing: ${v.issue}.` : `⚠️ एक चीज़ ठीक करनी है: ${v.issue}।`),
    submitted: (v: Vars) =>
      en
        ? `🙏 Thank you, ${first(String(v.name))} ji! Your land is with our team now.\n\nWe check every listing so buyers can trust it — usually within a few hours. We'll message you here the moment it's live.\n\nTo list more land, send *SELL*. To see your listings, send *STATUS*.`
        : `🙏 धन्यवाद, ${first(String(v.name))} जी! आपकी ज़मीन अब हमारी टीम के पास है।\n\nहर लिस्टिंग की जाँच होती है ताकि खरीदार भरोसा कर सकें — आमतौर पर कुछ घंटों में। लाइव होते ही हम यहीं मैसेज करेंगे।\n\nऔर ज़मीन लिस्ट करने के लिए *बेचना*, अपनी लिस्टिंग देखने के लिए *स्टेटस* लिखें।`,

    // Notifications (outside the chat flow)
    nRegistered: (v: Vars) =>
      en
        ? `Namaste ${first(String(v.name))} ji 🙏 Your seller account is ready.\n\nSeller ID: *${v.code}*\n\nUse it to add and manage your land: ${v.url}/seller\n\nTo list land from WhatsApp anytime, just send *SELL*.`
        : `नमस्ते ${first(String(v.name))} जी 🙏 आपका सेलर अकाउंट तैयार है।\n\nसेलर ID: *${v.code}*\n\nइससे अपनी ज़मीन जोड़ें और देखें: ${v.url}/seller\n\nWhatsApp से कभी भी ज़मीन लिस्ट करने के लिए बस *बेचना* लिखें।`,
    nVerifyIdentity: (v: Vars) =>
      en
        ? `One small step, ${first(String(v.name))} ji: verify your identity so buyers see *✓ Aadhaar verified* on your listings.\n\nIt takes 2 minutes, once. We never show your Aadhaar to anyone.\n\n${v.url}/seller/verify`
        : `${first(String(v.name))} जी, एक छोटा-सा कदम: अपनी पहचान सत्यापित करें ताकि खरीदार आपकी लिस्टिंग पर *✓ Aadhaar verified* देखें।\n\nसिर्फ़ एक बार, 2 मिनट। आपका आधार हम किसी को नहीं दिखाते।\n\n${v.url}/seller/verify`,
    nReceived: (v: Vars) =>
      en
        ? `✅ Your land has reached us.\n\n${v.plot}\n\nOur team will check it and message you when it's live — usually within a few hours.\n\nSeller ID: *${v.code}*`
        : `✅ आपकी ज़मीन हम तक पहुँच गई है।\n\n${v.plot}\n\nहमारी टीम जाँच करके लाइव होते ही आपको मैसेज करेगी — आमतौर पर कुछ घंटों में।\n\nसेलर ID: *${v.code}*`,
    nLive: (v: Vars) =>
      en
        ? `🎉 Good news — your land is live on ${SITE}.\n\n${v.title}\n${v.where} · ${v.price}\n\n${v.link}\n\nBuyers can now call or WhatsApp you directly. Share this link in your WhatsApp groups — more eyes, more calls.\n\nSeller ID: *${v.code}*`
        : `🎉 ख़ुशख़बरी — आपकी ज़मीन ${SITE} पर लाइव है।\n\n${v.title}\n${v.where} · ${v.price}\n\n${v.link}\n\nअब खरीदार सीधे आपको कॉल या WhatsApp कर सकते हैं। यह लिंक अपने WhatsApp ग्रुप में शेयर करें — जितने ज़्यादा लोग देखेंगे, उतने ज़्यादा कॉल।\n\nसेलर ID: *${v.code}*`,
    nRejected: (v: Vars) =>
      en
        ? `We couldn't publish your listing yet: ${v.title}.${v.reason ? `\n\nReason: ${v.reason}` : ""}\n\nPlease don't worry — reply here and we'll help you fix it.`
        : `आपकी लिस्टिंग अभी पब्लिश नहीं हो पाई: ${v.title}।${v.reason ? `\n\nकारण: ${v.reason}` : ""}\n\nचिंता न करें — यहीं जवाब दें, हम ठीक करने में मदद करेंगे।`,
    nUnavailable: (v: Vars) =>
      en
        ? `We didn't hear back, so we've paused your listing for now — buyers won't see it.\n\n${v.plot}\n\nStill available? Just reply *YES* and it goes live again.`
        : `आपका जवाब नहीं आया, इसलिए अभी आपकी लिस्टिंग रोक दी है — खरीदार इसे नहीं देखेंगे।\n\n${v.plot}\n\nअभी भी उपलब्ध है? बस *हाँ* लिखें, लिस्टिंग फिर से लाइव हो जाएगी।`,
    nSold: (v: Vars) =>
      en
        ? `Congratulations! 🎉 We've marked it as sold.\n\n${v.title}\n\nWhenever you have more land to sell, just send *SELL*.`
        : `बहुत-बहुत बधाई! 🎉 हमने इसे बिका हुआ दर्ज कर दिया है।\n\n${v.title}\n\nजब भी और ज़मीन बेचनी हो, बस *बेचना* लिखें।`,
    nReactivated: (v: Vars) => (en ? `👍 Your land is live again.\n\n${v.plot}\n${v.link}` : `👍 आपकी ज़मीन फिर से लाइव है।\n\n${v.plot}\n${v.link}`),
    nEnquiry: (v: Vars) =>
      en
        ? `📩 A buyer is interested in your land\n\n${v.buyer} · +91 ${v.phone} ${v.call ? "is calling you" : "is messaging you on WhatsApp"}.\nFor: ${v.title} (${v.code})\n\nA quick, kind reply makes all the difference. All enquiries: ${v.url}/seller`
        : `📩 एक खरीदार आपकी ज़मीन में रुचि रखते हैं\n\n${v.buyer} · +91 ${v.phone} ${v.call ? "आपको कॉल कर रहे हैं" : "आपको WhatsApp पर मैसेज कर रहे हैं"}।\nज़मीन: ${v.title} (${v.code})\n\nजल्दी और अच्छे से जवाब देने से सौदा बनता है। सभी पूछताछ: ${v.url}/seller`,
    nCheckOne: (v: Vars) =>
      en
        ? `Is your land still available?\n\n${v.line}\n\nReply *YES* – still available\nReply *NO* – it's sold`
        : `क्या आपकी ज़मीन अभी भी उपलब्ध है?\n\n${v.line}\n\n*हाँ* लिखें – अभी उपलब्ध है\n*नहीं* लिखें – बिक गई`,
    nCheckMany: (v: Vars) =>
      en
        ? `Is your land still available?\n\n${v.list}\n\nReply *YES* if all are still available.\nIf one is sold, reply *NO* and its number — e.g. *NO 2*.`
        : `क्या आपकी ज़मीन अभी भी उपलब्ध है?\n\n${v.list}\n\nसब उपलब्ध हैं तो *हाँ* लिखें।\nकोई बिक गई हो तो *नहीं* और उसका नंबर लिखें — जैसे *नहीं 2*।`,
    btnYesAll: en ? "YES, all available" : "हाँ, सब उपलब्ध",
    btnOneSold: en ? "One is sold" : "एक बिक गई",
    btnNoSold: en ? "NO, it's sold" : "नहीं, बिक गई",
    footerOne: en ? "No reply in 24 hours pauses it for buyers" : "24 घंटे में जवाब न मिला तो लिस्टिंग रुक जाएगी",
    footerMany: en ? "No reply in 24 hours pauses them for buyers" : "24 घंटे में जवाब न मिला तो लिस्टिंग रुक जाएँगी",
  };
}

export type Copy = ReturnType<typeof catalog>;
const CACHE: Record<Lang, Copy> = { en: catalog("en"), hi: catalog("hi") };

export function copy(lang: Lang): Copy {
  return CACHE[lang];
}
