import { API_URL } from '@/lib/api';

/**
 * The agent briefing is written to be pasted into a context window, and it tells
 * the agent to ask the user for two values: the gateway base URL and an API key.
 *
 * That is the right instruction for a stranger reading the file off the site,
 * but it is friction for the person who just created a key and is holding both
 * values. This wraps the same briefing in a preamble that supplies them, so one
 * paste is the whole job.
 *
 * The briefing itself is fetched from `/agent-briefing.md` rather than
 * duplicated here. It is the same file the docs render and the same file an
 * agent can fetch directly, so there is exactly one copy of the contract to keep
 * current.
 */
export const BRIEFING_PATH = '/agent-briefing.md';

/**
 * `$WOTP_API` is documented as having no trailing slash, so one supplied by env
 * config is normalised here rather than left to produce `…//v1/otp/send`.
 */
export function buildAgentPrompt(briefing: string, apiKey: string, apiUrl: string = API_URL) {
  const base = apiUrl.replace(/\/+$/, '');

  return `Integrate the WOTP OTP gateway into this project.

The briefing at the end of this message instructs you to ask the user for a base
URL and an API key. I am that user, so here they are — do not ask again:

    WOTP_API=${base}
    WOTP_KEY=${apiKey}

Read the briefing in full before you write anything, then do the integration:

  - put both values in environment variables. Never in source, never in a client
    bundle, never in a log — the key is a spending credential and this is the
    only time it is readable.
  - make the send and verify calls from this project's backend. Never from
    browser code.
  - build the UI timer from \`expires_in\` in the send response, not a hardcoded
    300.
  - handle the errors the briefing lists explicitly, and never retry a 4xx.
  - keep \`request_id\` from sends you care about.
  - run this project's own type checker and tests before you call it done. If
    the briefing conflicts with this project's existing conventions, follow the
    conventions and tell me what you deviated from.

Tell me what you changed and anything you could not verify.

---

${briefing}`;
}
