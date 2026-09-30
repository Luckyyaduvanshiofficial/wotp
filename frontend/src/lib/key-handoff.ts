/**
 * One-session handoff of a freshly created plaintext API key to the tester page.
 *
 * MEMORY ONLY, on purpose. An API key is a spending credential: it can send
 * WhatsApp messages against the operator's Meta account. Anything that writes it
 * to web storage leaves it readable by any script on the origin (including an
 * injected one), and `localStorage` additionally keeps it readable in every
 * later session on that browser.
 *
 * A module-scoped variable survives client-side navigation — which is all this
 * needs, since the keys page and the tester page both live inside the dashboard
 * SPA — and dies with the tab. A hard refresh loses it and the tester asks for
 * the key again, which is the correct trade.
 *
 * `take` really takes: the value is cleared on read, so it exists only for the
 * one navigation it was stashed for.
 */
export interface HandoffKey {
  api_key: string;
  last4: string;
  label: string;
}

let handoff: HandoffKey | null = null;

export function stashPlaintextKey(key: HandoffKey) {
  handoff = key;
}

export function takePlaintextKey(): HandoffKey | null {
  const value = handoff;
  handoff = null;
  return value;
}
