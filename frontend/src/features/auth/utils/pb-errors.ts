import { ClientResponseError } from 'pocketbase';

/**
 * PocketBase puts the useful part of a failure in a per-field object, e.g.
 * `{email: {code: 'validation_not_unique', message: 'The email is invalid or
 * already in use.'}}`. Which field it is depends on what failed, so take the
 * first entry that carries a message rather than guessing a key.
 */
function fieldMessage(e: ClientResponseError): string | null {
  for (const value of Object.values(e.response?.data ?? {})) {
    if (value && typeof value === 'object' && 'message' in value) {
      const message = (value as { message?: unknown }).message;
      if (typeof message === 'string' && message) return message;
    }
  }
  return null;
}

/**
 * PocketBase rejects a bad password with the flat "Failed to authenticate."
 * Our own sentence says the same thing and reads better, so keep it. Every
 * other 400 — a password under the minimum length on the change-password form,
 * a malformed reset request — is specific and actionable, and flattening those
 * into "Invalid email or password." sends people hunting for a typo in a
 * password nobody checked.
 */
const CREDENTIAL_FAILURE = /fail(?:ed)? to authenticate/i;

/** Turn a PocketBase ClientResponseError into a readable sentence. */
export function readableAuthError(e: unknown): string {
  if (e instanceof ClientResponseError) {
    if (e.status === 0) {
      return `Could not reach the auth server (${process.env.NEXT_PUBLIC_PB_URL}). Check your connection.`;
    }
    if (e.status === 404) {
      // PocketBase answers 404 when the collection in the URL does not exist —
      // a missing schema, never a wrong password, and never a wrong email: the
      // request never reached a credential check at all. Reporting it as a
      // credential error would send the operator hunting for a typo instead of
      // at the install.
      return `No auth collection at ${process.env.NEXT_PUBLIC_PB_URL}. The server's schema is missing — run backend/scripts/provision_pb.py against it.`;
    }
    if (e.status === 429) {
      return 'Too many attempts. Please wait a minute and try again.';
    }
    if (e.status === 400) {
      const message = fieldMessage(e);
      if (!message || CREDENTIAL_FAILURE.test(message)) return 'Invalid email or password.';
      return message;
    }
    return fieldMessage(e) ?? e.response?.message ?? 'Authentication failed. Please try again.';
  }
  return 'Authentication failed. Please try again.';
}
