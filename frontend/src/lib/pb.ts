import PocketBase from 'pocketbase';

/**
 * PocketBase singleton for WA OTP.
 *
 * `NEXT_PUBLIC_PB_URL` must point at *your own* PocketBase instance. There is
 * deliberately no fallback: a missing value is a configuration error, and
 * silently defaulting to some other server would make this dashboard talk to
 * an instance you do not control while looking like it works.
 *
 * The auth collection is `${prefix}users` — for this deployment `waotp_users`.
 * The prefix exists so one PocketBase instance can host more than one project
 * without collection-name collisions; it is env-driven and must match
 * `WAOTP_PB_COLLECTIONS_PREFIX` in `backend/.env`. If you run a dedicated
 * PocketBase for this app alone, the default prefix works fine as-is.
 *
 * The SDK persists the auth token in localStorage by default (LocalAuthStore),
 * which is acceptable for v1.
 */
function resolvePbUrl(): string {
  const configured = (process.env.NEXT_PUBLIC_PB_URL ?? '').trim();
  if (!configured) {
    throw new Error(
      'NEXT_PUBLIC_PB_URL is not set. Copy frontend/.env.local.example to ' +
        'frontend/.env.local and point it at your own PocketBase instance ' +
        '(e.g. http://127.0.0.1:8090). See docs/self-hosting.md.'
    );
  }
  return configured.replace(/\/+$/, '');
}

export const PB_URL = resolvePbUrl();

/**
 * Collection namespace shared with the backend. An unset *or empty* value
 * falls back to `waotp_` rather than to no prefix, so that a half-configured
 * deployment cannot silently address the stock `users`/`api_keys` collections
 * of a PocketBase instance that someone else is also using.
 */
const configuredPrefix = (process.env.NEXT_PUBLIC_PB_COLLECTIONS_PREFIX ?? '').trim();
export const PB_COLLECTIONS_PREFIX = configuredPrefix || 'waotp_';

export const PB_USERS_COLLECTION = `${PB_COLLECTIONS_PREFIX}users`;

export interface WaotpUser {
  id: string;
  email: string;
  name?: string;
  avatar?: string;
  /** `active` | `suspended`. `suspended` disables every key the user owns. */
  status?: string;
  created: string;
  updated: string;
}

export const pb = new PocketBase(PB_URL);

export function pbUsers() {
  return pb.collection<WaotpUser>(PB_USERS_COLLECTION);
}

/**
 * Absolute origin of this app, used wherever PocketBase has to be told where
 * to send the user back to (password-reset emails). Prefers the configured
 * public URL — which is correct even when the form is served from a preview
 * host — and falls back to the browser origin.
 *
 * Returns '' during SSR when nothing is configured; callers must skip sending
 * a relative redirect and let PocketBase use its own default instead.
 */
export function appOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/+$/, '');
  return typeof window !== 'undefined' ? window.location.origin : '';
}
