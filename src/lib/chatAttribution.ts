/**
 * Ties a booking back to the chatbot conversation that sent the visitor.
 *
 * Nicobot has been handing out /book-now buttons since April 2026 and there
 * was no way to tell whether a single one of them turned into a booking:
 * chatbot_conversations.booked_at is written by nothing, so every funnel
 * number downstream of the chat reads zero whether chat works or not.
 *
 * The chatbot now stamps ?cid=<conversation id> on its booking links. This
 * module carries that id from the landing URL through to Stripe metadata,
 * where the webhook stamps booked_at on real payment -- not on reaching
 * checkout, so an abandoned cart is never counted as a booking.
 *
 * Deliberately NOT folded into lib/attribution.ts: that module only refreshes
 * session storage when it sees a UTM parameter, so a bare ?cid= would be
 * dropped. (It is also never initialised -- see captureAttribution's call
 * site in main.tsx, added at the same time as this.)
 */
const CHAT_CID_KEY = 'cv_chat_cid';

/** A conversation id is a uuid; anything else came from a mangled link. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Call on app mount. Reads ?cid= and remembers it for the rest of the tab
 * session, so it survives the several navigations between the chat widget's
 * button and the checkout call.
 */
export function captureChatConversationId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const cid = new URL(window.location.href).searchParams.get('cid');
    if (cid && UUID.test(cid)) {
      sessionStorage.setItem(CHAT_CID_KEY, cid);
      return cid;
    }
    return chatConversationId();
  } catch {
    // Private mode, blocked storage, a malformed href -- attribution is not
    // worth breaking a booking over.
    return null;
  }
}

/** The chat conversation this visit came from, if any. */
export function chatConversationId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const cid = sessionStorage.getItem(CHAT_CID_KEY);
    return cid && UUID.test(cid) ? cid : null;
  } catch {
    return null;
  }
}
