# Connecting your WhatsApp Business account

Everything WhatsApp in this project runs under **your own** Meta Business
account. This project has no shared number, no shared app and no way to send
through anyone else's. That is the design, and it means this is the one part of
the setup you cannot skip or delegate.

> [!IMPORTANT]
> This page describes **what the code requires**, which is stable. Meta's
> dashboard is not — button labels and menu names move. Where a step is
> UI-specific, follow Meta's documentation rather than this page:
> [WhatsApp Cloud API — Get started](https://developers.facebook.com/docs/whatsapp/cloud-api/get-started).
> If a step here disagrees with Meta's current UI, Meta is right.

Telegram needs none of this. If you want to evaluate the software today without
touching Meta, set up a bot and skip to the end of this page.

---

## What you are building

```
your app ──▶ WA OTP API ──▶ Meta Cloud API ──▶ your user's WhatsApp
                  ▲
                  └── status callbacks (sent / delivered / read / failed)
```

Two credentials come out of this process, and they are different things:

| Credential | What it is | Where it goes |
|---|---|---|
| **Access token** | Authorises sending messages as your number | `META_ACCESS_TOKEN` |
| **App secret** | Verifies that inbound webhooks really came from Meta | `META_APP_SECRET` |
| **Verify token** | A string *you invent*; Meta echoes it during subscription | `META_VERIFY_TOKEN` |

The app secret is not optional in production. Without it, webhook signatures
cannot be checked, so anyone who learns your webhook URL could forge delivery
statuses — and the app refuses to start rather than let that pass silently.

## Steps

### 1. A Meta app with the WhatsApp product

Create an app of type **Business** at
[developers.facebook.com](https://developers.facebook.com/apps), then add the
**WhatsApp** product to it.

### 2. A WhatsApp Business Account and a phone number

You need a WABA and a phone number registered to it. The number **must not be
active on the WhatsApp consumer app** — a number in use on a normal phone has to
be deleted from WhatsApp first, and that is one-way. Use a dedicated SIM.

There is no way around this requirement, and any guide claiming otherwise is
misleading you about how Meta works.

### 3. An authentication template

This is the message your users receive. It must be a
**category: authentication** template, and it needs:

- a **body** containing one variable — the code
- a **Copy Code** button bound to that same variable

The code is sent in **both** places, because that is what Meta requires for an
authentication template to render its button. Both the body parameter and the
button parameter carry the same value; you configure nothing for this, but if
you edit the template and remove the button, delivery will start failing.

Authentication templates normally require an approved business portfolio. Meta's
[templates reference](https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates)
is authoritative on category rules and approval.

Then set:

```
META_TEMPLATE=your_template_name
META_TEMPLATE_LANG=en_US
```

The name is the template's **technical** name, not its display name.

### 4. A permanent access token

The token shown in the API Setup panel expires in about 24 hours and is for
testing. For a real install, create a **System User** with the
`whatsapp_business_messaging` permission and generate a token for it. System
user tokens do not expire on their own.

Put it in `backend/.env` as `META_ACCESS_TOKEN`, or — better for rotation —
encrypt it into the `settings` row so you can replace it from the admin UI
without a redeploy:

```bash
cd backend
.venv/bin/python -c "from app.core.security import encrypt_secret; print(encrypt_secret('YOUR_META_TOKEN'))"
```

Paste the result into the `meta_token_enc` field, and set
`meta_phone_number_id` to your phone number ID. The settings row wins over the
environment, so a value there takes precedence.

### 5. The webhook

Your URL is derived from `APP_URL`:

```
{APP_URL}/webhooks/whatsapp
```

Meta calls `GET` on it once, echoing `hub.verify_token` and expecting
`hub.challenge` back verbatim. Set `META_VERIFY_TOKEN` to a random string you
choose, paste the same value into the Meta app's webhook configuration, and
subscribe to the **`messages`** field. A wrong or missing verify token is
rejected with `403`, and `/health/ready` reports `verify_token_configured`.

`POST` to the same URL carries delivery statuses. Set `META_APP_SECRET` (App
settings → Basic) so each one is authenticated by its `X-Hub-Signature-256`
header. The app compares in constant time and rejects a bad or missing signature
with `403`.

### 6. Where the values go

| Variable | Value |
|---|---|
| `META_PHONE_NUMBER_ID` | WhatsApp → API Setup → phone number ID |
| `META_ACCESS_TOKEN` | Your system user token |
| `META_TEMPLATE` | Your authentication template's technical name |
| `META_TEMPLATE_LANG` | Its language code, e.g. `en_US` |
| `META_VERIFY_TOKEN` | A random string **you** invent and also paste into Meta's UI |
| `META_APP_SECRET` | App settings → Basic → App secret |
| `META_SANDBOX_TEMPLATE` | Optional; see below |

Verify with:

```bash
curl -fsS https://api.example.com/health/ready
```

It reports which variables are missing **by name** and never their values.

## Testing against Meta's test number

Until your own number and template are approved, Meta's test number is a
genuinely useful sandbox: it delivers only to recipients you allow-list, which
is exactly what you want while wiring a flow.

Two things to know:

- **Allow-list every recipient.** A send to a non-allow-listed number is
  rejected by Meta, which surfaces as `502 delivery_failed` with
  `retryable: false`. That flag is deliberate — retrying will not help.
- **The sandbox sample template has a different shape.** It takes three body
  parameters instead of one. If you are sending with Meta's sample template
  rather than your own authentication template, name it in
  `META_SANDBOX_TEMPLATE` and this app will use the matching payload shape.
  Leave it unset for any real install.

## Constraints that will shape your product

These are Meta's rules, not this app's. None of them can be worked around in
code, and each one has bitten somebody:

- **Business-initiated messages need a template.** A free-form text message can
  only be delivered inside an open 24-hour customer service window. OTP sends are
  business-initiated, which is why the code path always uses a template.
- **Messaging limits are tiered and grow with quality.** A new number starts on
  a low daily unique-recipient limit and climbs as your quality rating stays
  healthy. Business verification unlocks the higher tiers. Plan a launch around
  this rather than discovering it during one.
- **WhatsApp costs money.** Meta bills you, directly, at Meta's rates. See
  [Meta's pricing](https://developers.facebook.com/docs/whatsapp/pricing).
  This project does not resell messaging or bundle credits.
- **A bad quality rating throttles or blocks you.** Authentication-category
  traffic with a real user base is normally safe; marketing-shaped content is
  what gets numbers flagged. Keep it strictly to codes.

## Telegram instead

A Telegram bot needs one token from [@BotFather](https://t.me/BotFather), no
business verification, no payment method and no approval process:

1. Send `/newbot` to @BotFather, pick a name, and copy the token.
2. Put it in `TELEGRAM_BOT_TOKEN` and set `TELEGRAM_BOT_USERNAME` to the bot's
   username **without** the leading `@`.
3. Register the webhook:

   ```bash
   cd backend
   .venv/bin/python scripts/set_telegram_webhook.py https://api.example.com
   ```

The bot can only message people who have started it, so a first-time send
returns a `409 user_not_linked` with a deep link instead of a code. That is
covered in the main [README](../README.md#the-telegram-link-flow).
