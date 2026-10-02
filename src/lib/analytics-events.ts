/**
 * The only events we track — each answers a validation question:
 *   visitors → property viewers → contacts (WhatsApp/call)
 *   listing started → submitted → approved/rejected
 *   availability yes / no / no response → sold
 */
export const CLIENT_EVENTS = ["visit", "search", "filter", "property_view", "whatsapp_click", "call_click", "listing_started"] as const;
export const SERVER_EVENTS = [
  "seller_signup_started",
  "seller_registered",
  "identity_verified",
  "listing_submitted",
  "listing_approved",
  "listing_rejected",
  "property_sold",
  "availability_check_sent",
  "availability_yes",
  "availability_no",
  "availability_no_response",
  "property_reactivated",
] as const;

export type ClientEvent = (typeof CLIENT_EVENTS)[number];
export type ServerEvent = (typeof SERVER_EVENTS)[number];
