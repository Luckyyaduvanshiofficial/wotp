import type { InfobarContent } from '@/components/ui/infobar';

/**
 * Help panels for the dashboard pages, rendered by `PageContainer`'s
 * `infoContent` prop (see `src/components/layout/info-sidebar.tsx`).
 *
 * These are operator- and developer-facing explanations, not marketing copy —
 * keep them accurate to what the page actually does.
 */

export const overviewInfoContent: InfobarContent = {
  title: 'Overview',
  sections: [
    {
      title: 'What this page shows',
      description:
        'Your OTP usage for the current monthly cycle, a copy-ready quick start, and your most recent API keys. Everything here reads from the FastAPI backend with your PocketBase session — no keys are created or changed on this page.',
      links: [{ title: 'Integrator reference', url: '/docs' }]
    },
    {
      title: 'Reading your usage',
      description:
        'The usage counter tracks WhatsApp-delivered OTPs only. Telegram is unlimited and does not count against your monthly allowance, so routing a test through Telegram costs you nothing. Failed sends are never billed to the quota.',
      links: [{ title: 'Full API reference', url: '/docs' }]
    },
    {
      title: 'Quick start',
      description:
        'The snippets show the two calls your backend needs: POST /v1/otp/send to deliver a code, and POST /v1/otp/verify to check it. Replace the placeholder key with a real one before copying — a key is only shown in full once, at creation.'
    }
  ]
};

export const keysInfoContent: InfobarContent = {
  title: 'API Keys',
  sections: [
    {
      title: 'What a key is',
      description:
        'An API key is a spending credential. Anyone holding it can send OTPs against your quota, so treat it like a password and keep it server-side. Never ship one in frontend code or a mobile app bundle.',
      links: [
        {
          title: 'Security policy',
          url: 'https://github.com/Luckyyaduvanshiofficial/wotp/blob/main/SECURITY.md'
        }
      ]
    },
    {
      title: 'Keys are shown once',
      description:
        'The plaintext key appears exactly once, when it is created. Only a sha256 hash is stored, so it cannot be recovered later — if you lose one, rotate instead of hunting for it.'
    },
    {
      title: 'Rotating',
      description:
        'Regenerate replaces the active key with a new one. The old key stops working immediately, so deploy the new value to your backend before you rotate if you can, or accept a short window of failed sends.'
    },
    {
      title: 'Key limit',
      description:
        'There is a cap on active keys per account. Deactivating a key frees a slot but cannot be undone — the key is retired permanently.'
    }
  ]
};

export const testerInfoContent: InfobarContent = {
  title: 'OTP Tester',
  sections: [
    {
      title: 'What this does',
      description:
        'Sends a real OTP through the live API to a phone number you control, then verifies it. This is the same path your integrators use, so a success here means the channel genuinely works — it is not a simulation.',
      links: [{ title: 'API reference', url: '/docs' }]
    },
    {
      title: 'Choose the channel deliberately',
      description:
        'WhatsApp sends count against your monthly quota. Telegram is unlimited and free, but the number has to be linked to a Telegram account first — an unlinked number returns user_not_linked along with a deep link to connect it.',
      links: [{ title: 'Telegram link flow', url: '/docs' }]
    },
    {
      title: 'Reading the response',
      description:
        'The raw JSON the API returned is shown in full, including error bodies. Codes are hashed at rest and expire, so a verify attempt against a stale code reports an expired or mismatched code rather than succeeding.',
      links: [{ title: 'Error codes', url: '/docs' }]
    }
  ]
};

export const settingsInfoContent: InfobarContent = {
  title: 'Settings',
  sections: [
    {
      title: 'Profile and password',
      description:
        'Your name and password are stored in PocketBase, which is the only identity provider this dashboard uses. Your email address identifies the account and is what the backend uses to attribute keys and usage.',
      links: [{ title: 'Privacy', url: 'https://github.com/Luckyyaduvanshiofficial/wotp#privacy' }]
    },
    {
      title: 'Appearance',
      description:
        'The theme choice is stored locally in your browser and never leaves it. It affects only how the dashboard looks to you — it has no effect on your account or your API behaviour.'
    }
  ]
};
