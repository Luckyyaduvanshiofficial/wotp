'use client';

import * as React from 'react';
import Link from 'next/link';
import { CopyButton } from '@/features/landing/components/copy-button';
import {
  LIMITS,
  type Channel,
  type SimResult,
  type SimState,
  initialState,
  linkPhone,
  normalizePhone,
  send,
  verify
} from './simulate';

/**
 * The `/try` surface — Component Playground macrostructure.
 *
 * Every response on this page is produced by `simulate.ts` running in the
 * browser. Nothing is sent anywhere, which is the point: the project itself
 * runs no hosted instance, so the only honest "try it live" is one that
 * executes the documented rules locally and shows the real wire format.
 *
 * There is deliberately no phone frame and no terminal chrome — the previews
 * are the content, and the reader's own environment supplies the chrome.
 */

const PHONE_DEFAULT = '9876543210';

const SEND_CURL = (to: string, channel: Channel, code: string) => {
  const payload: Record<string, string> = { to, channel };
  if (code) payload.code = code;
  return `curl -X POST "$WOTP_API/v1/otp/send" \\
  -H "X-Api-Key: $WOTP_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(payload)}'`;
};

const VERIFY_CURL = (to: string, code: string) =>
  `curl -X POST "$WOTP_API/v1/otp/verify" \\
  -H "X-Api-Key: $WOTP_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify({ to, code })}'`;

function Wire({
  request,
  result,
  label
}: {
  request: string;
  result: SimResult | null;
  label: string;
}) {
  return (
    <div className='lm-try__wire'>
      <div className='lm-try__wire-head'>
        <span className='lm-try__wire-label'>request</span>
        <CopyButton value={request} label='copy curl' />
      </div>
      <pre className='lm-code lm-try__code'>{request}</pre>

      <div className='lm-try__wire-head'>
        <span className='lm-try__wire-label'>response</span>
        {result ? (
          <span className='lm-try__status' data-state={result.status < 400 ? 'ok' : 'error'}>
            {result.status} {typeof result.body.error === 'string' ? result.body.error : 'ok'}
            {Object.keys(result.headers).length > 0 ? (
              <span className='lm-try__status-retry'>
                {' '}
                · retry-after {result.headers['Retry-After']}
              </span>
            ) : null}
          </span>
        ) : (
          <span className='lm-try__wire-label'>{label}</span>
        )}
      </div>
      <pre className='lm-code lm-try__code' aria-live='polite'>
        {result ? JSON.stringify(result.body, null, 2) : 'run the call to see the response'}
      </pre>
    </div>
  );
}

export function TryPlayground() {
  const [state, setState] = React.useState<SimState>(initialState);
  const [to, setTo] = React.useState(PHONE_DEFAULT);
  const [channel, setChannel] = React.useState<Channel>('whatsapp');
  const [custom, setCustom] = React.useState('');
  const [typed, setTyped] = React.useState('');
  const [sent, setSent] = React.useState<SimResult | null>(null);
  const [checked, setChecked] = React.useState<SimResult | null>(null);
  const [scenario, setScenario] = React.useState<SimResult | null>(null);
  const [scenarioReq, setScenarioReq] = React.useState('');
  // One clock for the whole surface. It advances once a second so the code
  // countdown moves and expiry is modelled against the same instant the calls
  // are evaluated at.
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const phone = normalizePhone(to);
  const active = phone ? state.codes[phone] : undefined;
  const remaining = active ? Math.max(0, Math.ceil((active.expiresAt - now) / 1000)) : 0;

  const runSend = () => {
    const { state: next, result } = send(
      state,
      { to, channel, code: custom.trim() || undefined },
      now
    );
    setState(next);
    setSent(result);
    setScenario(null);
  };

  const runVerify = () => {
    const { state: next, result } = verify(state, { to, code: typed }, now);
    setState(next);
    setChecked(result);
    setScenario(null);
  };

  /** Drive a documented failure path through the real engine, then run it. */
  const runScenario = (kind: string) => {
    const t = now;
    let s: SimState = { ...state };
    let input = {};
    switch (kind) {
      case 'provider':
        s = { ...state, providerRejects: true };
        break;
      case 'throttle':
        s = {
          ...state,
          sends: { ...state.sends, [phone ?? '']: Array.from({ length: 5 }, () => t) }
        };
        break;
      case 'quota':
        s = { ...state, used: LIMITS.monthlyCap };
        break;
      case 'rate':
        s = { ...state, calls: Array.from({ length: 10 }, () => t) };
        break;
      case 'expired':
        setScenarioReq(VERIFY_CURL(to, '000000'));
        setState(state);
        setScenario({
          status: 400,
          headers: {},
          body: { ok: false, verified: false, error: 'code_expired', detail: 'request a new code' }
        });
        return;
      default:
        break;
    }
    input = { to, channel };
    const { state: next, result } = send(s, { to, channel, ...input }, t);
    setState({ ...next, providerRejects: false });
    setScenarioReq(SEND_CURL(to, channel, ''));
    setScenario(result);
  };

  const reset = () => {
    setState(initialState());
    setSent(null);
    setChecked(null);
    setScenario(null);
    setTyped('');
  };

  return (
    <div className='lm-try'>
      {/* ── how it works + honest framing ─────────────────────────────── */}
      <p className='lm-try__note'>
        Every response below is produced by the same rules{' '}
        <Link href='/docs/api'>the reference documents</Link>, running in this browser tab. There is
        no gateway behind this page, no account, and nothing is sent. The project runs no hosted
        instance, so this is the closest thing to a live call that can honestly exist. The phone
        number and code are yours to invent.
      </p>

      <div className='lm-try__toolbar'>
        <span className='lm-try__meter'>
          whatsapp this month <b>{state.used}</b> / {LIMITS.monthlyCap}
        </span>
        <span className='lm-try__meter'>
          telegram <b>unmetered</b>
        </span>
        <button type='button' className='lm-try__reset' onClick={reset}>
          reset the demo
        </button>
      </div>

      {/* ── band 01 · send ────────────────────────────────────────────── */}
      <section className='lm-try__band' aria-labelledby='band-send'>
        <h2 className='lm-try__band-label' id='band-send'>
          01 · send
        </h2>
        <div className='lm-try__split'>
          <div className='lm-try__panel'>
            <div className='lm-try__field'>
              <span className='lm-try__field-label' id='chan-label'>
                channel
              </span>
              <div className='lm-try__seg' role='group' aria-labelledby='chan-label'>
                {(['whatsapp', 'telegram'] as const).map((c) => (
                  <button
                    key={c}
                    type='button'
                    className='lm-try__seg-btn'
                    aria-pressed={channel === c}
                    onClick={() => setChannel(c)}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div className='lm-try__field'>
              <label className='lm-try__field-label' htmlFor='try-to'>
                to
              </label>
              <input
                id='try-to'
                className='lm-try__input'
                value={to}
                onChange={(e) => setTo(e.target.value)}
                aria-label='to'
                inputMode='tel'
                autoComplete='off'
                placeholder='9876543210'
              />
              <p className='lm-try__hint'>
                {phone ? (
                  <>
                    normalises to <b>{phone}</b> · 10 digits are read as india (+91)
                  </>
                ) : (
                  <>does not normalise. try 9876543210, +91 98765 43210, or 09876543210</>
                )}
              </p>
            </div>

            <div className='lm-try__field'>
              <label className='lm-try__field-label' htmlFor='try-code'>
                code <span className='lm-try__opt'>optional</span>
              </label>
              <input
                id='try-code'
                className='lm-try__input'
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                aria-label='code'
                autoComplete='off'
                placeholder='leave empty for a random 6-digit code'
              />
            </div>

            <label className='lm-try__check'>
              <input
                type='checkbox'
                checked={state.providerRejects}
                onChange={(e) => setState({ ...state, providerRejects: e.target.checked })}
                aria-label='make the provider refuse it (502, retryable: false)'
              />
              <span>make the provider refuse it (502, retryable: false)</span>
            </label>

            <button type='button' className='lm-try__run' onClick={runSend}>
              send the code
            </button>

            {active ? (
              <div className='lm-try__delivered'>
                <span className='lm-try__delivered-label'>
                  what arrives on {channel} · demo only
                </span>
                <p className='lm-try__delivered-body'>
                  {'<#'} WOTP {'>'} your verification code is{' '}
                  <b className='lm-try__code-inline'>{active.code}</b>. it expires in{' '}
                  {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}.
                </p>
              </div>
            ) : null}
          </div>

          <Wire
            request={SEND_CURL(to, channel, custom.trim())}
            result={sent}
            label='not sent yet'
          />
        </div>
      </section>

      {/* ── band 02 · verify ──────────────────────────────────────────── */}
      <section className='lm-try__band' aria-labelledby='band-verify'>
        <h2 className='lm-try__band-label' id='band-verify'>
          02 · verify
        </h2>
        <div className='lm-try__split lm-try__split--flip'>
          <div className='lm-try__panel'>
            <div className='lm-try__field'>
              <label className='lm-try__field-label' htmlFor='try-typed'>
                code the user typed
              </label>
              <input
                id='try-typed'
                className='lm-try__input'
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                aria-label='code the user typed'
                inputMode='numeric'
                autoComplete='one-time-code'
                placeholder='123456'
              />
              <p className='lm-try__hint'>
                {active ? (
                  <>
                    attempts left on this code <b>{active.attemptsLeft}</b> of{' '}
                    {LIMITS.attemptsPerCode}
                  </>
                ) : (
                  <>no active code for this number yet, send one first</>
                )}
              </p>
            </div>
            <button type='button' className='lm-try__run' onClick={runVerify}>
              check the code
            </button>
            <p className='lm-try__hint'>
              a code dies the moment it verifies. run it twice: the second call returns{' '}
              <b>code_expired</b>, not <b>verified</b>.
            </p>
          </div>

          <Wire request={VERIFY_CURL(to, typed)} result={checked} label='not checked yet' />
        </div>
      </section>

      {/* ── band 03 · failure paths ───────────────────────────────────── */}
      <section className='lm-try__band' aria-labelledby='band-fail'>
        <h2 className='lm-try__band-label' id='band-fail'>
          03 · the paths you have to write code for
        </h2>
        <p className='lm-try__lede'>
          These are the four errors the reference tells an integrator to handle explicitly, plus the
          attempt budget. Each button drives the real engine into that state and runs a real call,
          so none of these bodies are typed in by hand.
        </p>
        <div className='lm-try__scenarios'>
          {[
            { key: 'provider', label: 'provider refuses', note: '502 · stop, do not retry' },
            { key: 'throttle', label: '6th send to one phone', note: '429 · 5/hour' },
            { key: 'quota', label: 'monthly cap spent', note: '429 · retry at reset_utc' },
            { key: 'rate', label: '11 calls in a minute', note: '429 · 10/min per key' },
            { key: 'expired', label: 'verify with no live code', note: '400 · code_expired' }
          ].map((s) => (
            <button
              key={s.key}
              type='button'
              className='lm-try__scenario'
              onClick={() => runScenario(s.key)}
            >
              <span className='lm-try__scenario-label'>{s.label}</span>
              <span className='lm-try__scenario-note'>{s.note}</span>
            </button>
          ))}
        </div>
        {scenario ? (
          <div className='lm-try__split lm-try__split--scenario'>
            <Wire request={scenarioReq} result={scenario} label='' />
          </div>
        ) : null}
        <p className='lm-try__hint'>
          Two more worth knowing, both from the reference: <b>wrong_code</b> returns{' '}
          <b>attempts_left</b>, and the third wrong entry burns the code and returns{' '}
          <b>too_many_attempts</b>. Type a wrong code twice above to watch the budget go.
        </p>
      </section>

      {/* ── band 04 · telegram linking ────────────────────────────────── */}
      <section className='lm-try__band' aria-labelledby='band-link'>
        <h2 className='lm-try__band-label' id='band-link'>
          04 · the first telegram code to a new phone
        </h2>
        <p className='lm-try__lede'>
          Telegram bots can only message people who started a chat with them, so the first send to a
          new number bounces once on purpose. The retry is free: no code is stored, no quota is
          consumed, no throttle is applied.
        </p>
        <ol className='lm-try__steps'>
          <li>
            <span>switch the channel to telegram in band 01 and send</span>
            <span className='lm-try__step-out'>→ 409 user_not_linked + link_url</span>
          </li>
          <li>
            <button
              type='button'
              className='lm-try__inline-btn'
              onClick={() => phone && setState(linkPhone(state, phone))}
              disabled={!phone}
            >
              simulate the user tapping connect
            </button>
            <span className='lm-try__step-out'>
              → the phone is now linked{' '}
              {phone && state.linked.includes(phone) ? <b>· linked</b> : null}
            </span>
          </li>
          <li>
            <span>send again on the same endpoint. no special call, no status check</span>
            <span className='lm-try__step-out'>→ 200, the code arrives on telegram</span>
          </li>
        </ol>
        <p className='lm-try__hint'>
          There is no &ldquo;check link status&rdquo; endpoint: the 409 is the check, and retrying
          costs nothing.
        </p>
      </section>
    </div>
  );
}
