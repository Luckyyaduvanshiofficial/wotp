/**
 * A faithful, in-browser model of the documented gateway contract.
 *
 * WHY THIS EXISTS
 * Every "try it" button on a self-hosted project has the same problem: there is
 * no live host to point at. The alternatives are a hosted instance (infra the
 * project deliberately does not run), or a fake that returns whatever shape
 * looks nice in a screenshot — which teaches an integration that then fails
 * against the real gateway.
 *
 * So this is neither. It reimplements the rules exactly as `backend/docs/api.md`
 * documents them, and returns the same bodies, the same status codes and the
 * same headers. Nothing leaves the browser; there is no network call, no
 * account, and no install.
 *
 * It is a model, not the gateway. Where the two could drift, `backend/docs/api.md`
 * wins — that file is the contract, and its tests live in `backend/tests/`. The
 * behaviours modelled here are the ones an integrator has to write code for:
 * the single-use code, the attempt budget, the newest-code-wins rule, the
 * telegram link bounce, and the three different 429s with their three different
 * `Retry-After` values.
 */

export type Channel = 'whatsapp' | 'telegram';

export interface SimHeaders {
  [name: string]: string;
}

export interface SimResult {
  status: number;
  headers: SimHeaders;
  body: Record<string, unknown>;
}

/**
 * What a call did to the simulated world. Deliberately not part of
 * `SimResult`: that type is the wire, and the wire carries no such field.
 */
export type SimEvent = 'sent' | 'telegram-not-linked' | 'verified' | 'code-burned';

export interface SimOutcome {
  state: SimState;
  result: SimResult;
  event?: SimEvent;
}

export interface ActiveCode {
  code: string;
  expiresAt: number;
  attemptsLeft: number;
}

export interface SimState {
  /** Only ever one active code per phone — a resend replaces it. */
  codes: Record<string, ActiveCode>;
  /** WhatsApp sends the "provider" accepted this month. Telegram never counts. */
  used: number;
  /** Per-phone send timestamps, trailing hour, both channels. */
  sends: Record<string, number[]>;
  /** Timestamps of every authenticated call, sliding minute. */
  calls: number[];
  /** Phones that have connected to the telegram bot. */
  linked: string[];
  /**
   * Demo control: makes the next send behave as if the provider refused it —
   * a number that is not on WhatsApp, or a chat the user blocked. The gateway
   * answers this with `502 delivery_failed` and `retryable: false`, which is
   * the flag an integrator must branch on.
   */
  providerRejects: boolean;
  /** Bumped on every state change so React can re-render on mutation. */
  revision: number;
}

/** The installation defaults, from `backend/docs/api.md` → limits. */
export const LIMITS = {
  monthlyCap: 500,
  codeTtlSeconds: 300,
  attemptsPerCode: 3,
  perPhonePerHour: 5,
  callsPerMinute: 10
} as const;

export function initialState(): SimState {
  return {
    codes: {},
    used: 42,
    sends: {},
    calls: [],
    linked: [],
    providerRejects: false,
    revision: 0
  };
}

const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

export const resetUtc = (now: number): string => {
  const d = new Date(now);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString();
};

export const secondsUntilReset = (now: number): number =>
  Math.max(60, Math.ceil((new Date(resetUtc(now)).getTime() - now) / 1000));

const digitsOnly = (raw: string): string | null => {
  let out = '';
  for (const ch of raw) {
    if (ch >= '0' && ch <= '9') out += ch;
    // A digit from another numbering system is refused rather than dropped:
    // dropping it would silently turn one number into a different, valid one.
    else if (/\d/.test(ch)) return null;
  }
  return out;
};

/**
 * Mirrors `app/core/security.py::normalize_phone`. Kept in step deliberately:
 * a demo that accepts numbers the gateway rejects is worse than no demo.
 */
export function normalizePhone(raw: string): string | null {
  if (!raw) return null;
  let digits = digitsOnly(raw);
  if (digits === null || digits === '') return null;
  if (digits.startsWith('00') && digits.length > 2) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 10) digits = '91' + digits;
  if (digits.length < 10 || digits.length > 15) return null;
  return digits;
}

const randomId = (): string =>
  Array.from({ length: 16 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');

const randomCode = (): string => String(Math.floor(100000 + Math.random() * 900000));

/** A placeholder bot handle. The real one comes from the installation's env. */
const BOT_USERNAME = 'waotp_demo_bot';
const linkUrl = (token: string) => `https://t.me/${BOT_USERNAME}?start=${token}`;

const invalidRequest = (detail: unknown): SimResult => ({
  status: 400,
  headers: {},
  body: { ok: false, error: 'invalid_request', detail }
});

/** Sliding 60-second window, per key, all authenticated endpoints combined. */
function checkRate(state: SimState, now: number): SimResult | null {
  const recent = state.calls.filter((t) => now - t < MINUTE_MS);
  if (recent.length >= LIMITS.callsPerMinute) {
    return {
      status: 429,
      headers: { 'Retry-After': '60' },
      body: {
        ok: false,
        error: 'rate_limited',
        retry_after_seconds: 60
      }
    };
  }
  return null;
}

export interface SendInput {
  to: string;
  channel: Channel;
  code?: string;
}

export function send(state: SimState, input: SendInput, now: number): SimOutcome {
  const next: SimState = {
    ...state,
    codes: { ...state.codes },
    sends: { ...state.sends },
    calls: [...state.calls],
    linked: [...state.linked]
  };

  // A rejected request does not count toward the window — documented.
  const limited = checkRate(state, now);
  if (limited) return { state, result: limited };
  next.calls = [...state.calls.filter((t) => now - t < MINUTE_MS), now];

  if (input.code !== undefined && !/^[A-Za-z0-9]{4,10}$/.test(input.code)) {
    return {
      state,
      result: invalidRequest([
        {
          loc: ['body', 'code'],
          msg: 'String should match pattern',
          type: 'string_pattern_mismatch'
        }
      ])
    };
  }

  const phone = normalizePhone(input.to);
  if (!phone) {
    return {
      state,
      result: invalidRequest('to must be a valid phone number (E.164, e.g. 919876543210)')
    };
  }

  // A telegram send to an unlinked phone bounces once, and costs nothing: no
  // code stored, no quota, no throttle. This is the whole linking mechanism.
  if (input.channel === 'telegram' && !next.linked.includes(phone)) {
    return {
      state: next,
      event: 'telegram-not-linked',
      result: {
        status: 409,
        headers: {},
        body: { ok: false, error: 'user_not_linked', link_url: linkUrl(randomId()) }
      }
    };
  }

  const hour = (next.sends[phone] ?? []).filter((t) => now - t < HOUR_MS);
  if (hour.length >= LIMITS.perPhonePerHour) {
    return {
      state: next,
      result: {
        status: 429,
        headers: { 'Retry-After': '3600' },
        body: { ok: false, error: 'phone_throttled', retry_after_seconds: 3600 }
      }
    };
  }

  // The cap is whatsapp-only. Telegram is never metered against it.
  if (input.channel === 'whatsapp' && next.used >= LIMITS.monthlyCap) {
    return {
      state: next,
      result: {
        status: 429,
        headers: { 'Retry-After': String(secondsUntilReset(now)) },
        body: {
          ok: false,
          error: 'quota_exceeded',
          used: next.used,
          limit: LIMITS.monthlyCap,
          reset_utc: resetUtc(now)
        }
      }
    };
  }

  const code = input.code ?? randomCode();

  // The provider refused this one. A rejected send is never counted — not
  // against the monthly cap, not against the per-phone window — but the two
  // flags below are the difference between "retry" and "stop".
  if (next.providerRejects) {
    return {
      state: next,
      result: {
        status: 502,
        headers: {},
        body: {
          ok: false,
          error: 'delivery_failed',
          channel: input.channel,
          detail:
            input.channel === 'whatsapp'
              ? 'recipient is not on whatsapp, or is not in the test-number allow-list'
              : 'the user has blocked this bot',
          retryable: false
        }
      }
    };
  }

  // Newest wins: a resend replaces the active code rather than adding one.
  next.codes[phone] = {
    code,
    expiresAt: now + LIMITS.codeTtlSeconds * 1000,
    attemptsLeft: LIMITS.attemptsPerCode
  };
  next.sends[phone] = [...hour, now];
  if (input.channel === 'whatsapp') next.used += 1;
  next.revision += 1;

  return {
    state: next,
    event: 'sent',
    result: {
      status: 200,
      headers: {},
      body: {
        ok: true,
        channel: input.channel,
        request_id: 'm' + randomId(),
        message_id: input.channel === 'whatsapp' ? 'wamid.' + randomId().toUpperCase() : randomId(),
        expires_in: LIMITS.codeTtlSeconds,
        used: next.used,
        limit: LIMITS.monthlyCap,
        reset_utc: resetUtc(now)
      }
    }
  };
}

export interface VerifyInput {
  to: string;
  code: string;
}

export function verify(state: SimState, input: VerifyInput, now: number): SimOutcome {
  const next: SimState = { ...state, codes: { ...state.codes }, calls: [...state.calls] };

  const limited = checkRate(state, now);
  if (limited) return { state, result: limited };
  next.calls = [...state.calls.filter((t) => now - t < MINUTE_MS), now];

  const phone = normalizePhone(input.to);
  if (!phone) {
    return {
      state,
      result: invalidRequest('to must be a valid phone number (E.164, e.g. 919876543210)')
    };
  }
  if (!input.code || input.code.length > 10) {
    return {
      state,
      result: invalidRequest([{ loc: ['body', 'code'], msg: 'Field required', type: 'missing' }])
    };
  }

  const active = next.codes[phone];
  if (!active || active.expiresAt <= now) {
    if (active) delete next.codes[phone];
    return {
      state: next,
      result: {
        status: 400,
        headers: {},
        body: { ok: false, verified: false, error: 'code_expired', detail: 'request a new code' }
      }
    };
  }

  if (active.code !== input.code) {
    active.attemptsLeft -= 1;
    if (active.attemptsLeft <= 0) {
      delete next.codes[phone];
      next.revision += 1;
      return {
        state: next,
        event: 'code-burned',
        result: {
          status: 400,
          headers: {},
          body: { ok: false, verified: false, error: 'too_many_attempts', attempts_left: 0 }
        }
      };
    }
    next.revision += 1;
    return {
      state: next,
      result: {
        status: 400,
        headers: {},
        body: {
          ok: false,
          verified: false,
          error: 'wrong_code',
          attempts_left: active.attemptsLeft
        }
      }
    };
  }

  // Single-use: the code dies the moment it verifies. Re-verifying the same
  // code returns code_expired, which is the behaviour that surprises people.
  delete next.codes[phone];
  next.revision += 1;
  return {
    state: next,
    event: 'verified',
    result: { status: 200, headers: {}, body: { ok: true, verified: true } }
  };
}

/** The code the demo "sent", for the simulated handset. Null when none is live. */
export function liveCode(state: SimState, phone: string, now: number): string | null {
  const active = state.codes[phone];
  if (!active || active.expiresAt <= now) return null;
  return active.code;
}

export function linkPhone(state: SimState, phone: string): SimState {
  return {
    ...state,
    linked: state.linked.includes(phone) ? state.linked : [...state.linked, phone],
    revision: state.revision + 1
  };
}
