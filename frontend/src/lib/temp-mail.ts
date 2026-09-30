/**
 * Optional link to a disposable-inbox service, shown only as a testing
 * convenience on the login screen and the dashboard overview.
 *
 * Deliberately empty by default. This project ships no third-party link baked
 * into its source: a self-hoster's login page must not send their operators to
 * a service the project's authors happen to run, and the README's promise that
 * the code contains no author-owned endpoint has to stay true.
 *
 * Set `NEXT_PUBLIC_TEMP_MAIL_URL` to any inbox provider you trust — your own or
 * somebody else's — and the prompt renders. Leave it unset and every surface
 * that mentions it renders nothing at all: no placeholder, no dead link.
 */
export const TEMP_MAIL_URL = (process.env.NEXT_PUBLIC_TEMP_MAIL_URL ?? '').trim();

export const TEMP_MAIL_ENABLED = TEMP_MAIL_URL.length > 0;

/** Hostname of the configured inbox service, for display. '' when unset. */
export function tempMailHost(): string {
  if (!TEMP_MAIL_ENABLED) return '';
  try {
    return new URL(TEMP_MAIL_URL).host;
  } catch {
    // A malformed value is a config mistake, not a reason to crash the page.
    return TEMP_MAIL_URL;
  }
}
