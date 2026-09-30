/// <reference path="../pb_data/types.d.ts" />
/**
 * WA OTP control-plane schema (PRD §5).
 *
 * ISOLATION — read this before editing.
 * This PocketBase instance may be shared with other projects, so every
 * collection this migration touches lives under a prefix. The prefix is read
 * from WAOTP_PB_COLLECTIONS_PREFIX and defaults to "waotp_" — the same default
 * as `pb_collections_prefix` in `app/core/config.py` and
 * PB_COLLECTIONS_PREFIX in `frontend/src/lib/pb.ts`. All three must agree, or
 * the app will address collections that do not exist.
 *
 * With a prefix set (the default, and the only safe mode on a shared
 * instance) wa-otp gets its OWN auth collection, `{prefix}users`, and the
 * stock `users` collection — which belongs to whatever other project lives on
 * this instance — is NEVER read or modified. With the prefix explicitly set to
 * empty (dedicated instance), `status` is added to the stock `users`
 * collection instead, matching `scripts/provision_pb.py`.
 *
 * Index NAMES embed the physical collection name on purpose: SQLite index
 * names are unique across the whole database file, so an unprefixed
 * `idx_api_keys_hash` would collide with another project's identically-named
 * index and fail to apply.
 *
 * All collections are admin-only (list/view/create/update/delete rules = null):
 * FastAPI holds the superuser token; end users never touch PocketBase records
 * directly. The dashboard reads via FastAPI's /v1/keys and /v1/usage.
 *
 * Gotcha (PocketBase v0.40): collections created inside migrations must declare
 * `created`/`updated` as explicit autodate fields, or indexes referencing them
 * fail to apply.
 */
migrate((app) => {
  const PREFIX = ($os.getenv("WAOTP_PB_COLLECTIONS_PREFIX") || "waotp_").trim()
  const physical = (logical) => PREFIX + logical

  const CREATED = { name: "created", type: "autodate", onCreate: true }
  const UPDATED = { name: "updated", type: "autodate", onCreate: true, onUpdate: true }

  // ---- operator auth collection --------------------------------------------
  // Prefixed: wa-otp's own login pool, separate from every other app's users.
  // Unprefixed (dedicated instance): extend the stock `users` collection.
  //
  // This installation is operator-owned: there is no public signup, so
  // `createRule` is null and accounts are created out-of-band by the operator
  // (`scripts/create_admin.py`, or the PocketBase admin UI). An open create
  // rule here would let any visitor register and mint an API key against the
  // operator's own WhatsApp account.
  // Self-service update rule. `id = @request.auth.id` alone is a record
  // filter, not a field allowlist: it would let a signed-in user PATCH their
  // own `status` (the only gate on a suspended account's keys) or `verified`.
  // `:changed = false` is PocketBase's documented modifier for forbidding a
  // change to a specific field while still accepting a client that round-trips
  // the current value.
  const SELF_UPDATE_RULE =
    "id = @request.auth.id" +
    " && @request.body.status:changed = false" +
    " && @request.body.verified:changed = false"

  let users
  if (PREFIX) {
    try {
      users = app.findCollectionByNameOrId(physical("users"))
    } catch (e) {
      users = new Collection({
        name: physical("users"),
        type: "auth",
        listRule: "id = @request.auth.id",
        viewRule: "id = @request.auth.id",
        // operator-only: accounts are provisioned, never self-registered
        createRule: null,
        updateRule: SELF_UPDATE_RULE,
        deleteRule: null,
        passwordAuth: { enabled: true, identityFields: ["email"] },
        authRule: "",
        manageRule: null,
        fields: [
          {
            name: "status",
            type: "select",
            values: ["active", "suspended"],
            maxSelect: 1,
          },
        ],
        indexes: [
          `CREATE UNIQUE INDEX idx_${physical("users")}_tokenKey ON \`${physical("users")}\` (\`tokenKey\`)`,
          `CREATE UNIQUE INDEX idx_${physical("users")}_email ON \`${physical("users")}\` (\`email\`) WHERE \`email\` != ''`,
        ],
      })
      app.save(users)
    }
  } else {
    users = app.findCollectionByNameOrId("users")
    if (!users.fields.getByName("status")) {
      users.fields.add(new Field({
        name: "status",
        type: "select",
        values: ["active", "suspended"],
        maxSelect: 1,
      }))
    }
    // Same operator-only rule as the prefixed branch. The stock `users`
    // collection ships with an open create rule, which on a dedicated install
    // is the same signup hole; close it here too, and apply the same
    // self-update guard.
    users.createRule = null
    users.updateRule = SELF_UPDATE_RULE
    app.save(users)
  }
  const usersId = users.id

  // ---- api_keys ------------------------------------------------------------
  const apiKeys = new Collection({
    name: physical("api_keys"),
    type: "base",
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      CREATED,
      UPDATED,
      { name: "owner", type: "relation", collectionId: usersId, cascadeDelete: true, maxSelect: 1, required: true },
      { name: "key_hash", type: "text", required: true, min: 64, max: 64 },
      { name: "last4", type: "text", max: 4 },
      { name: "label", type: "text", max: 50 },
      { name: "active", type: "bool" },
    ],
    indexes: [
      `CREATE UNIQUE INDEX idx_${physical("api_keys")}_hash ON \`${physical("api_keys")}\` (\`key_hash\`)`,
    ],
  })
  app.save(apiKeys)
  const apiKeysId = apiKeys.id

  // ---- otp_codes -----------------------------------------------------------
  app.save(new Collection({
    name: physical("otp_codes"),
    type: "base",
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      CREATED,
      UPDATED,
      { name: "owner", type: "relation", collectionId: usersId, cascadeDelete: true, maxSelect: 1, required: true },
      { name: "api_key", type: "relation", collectionId: apiKeysId, cascadeDelete: true, maxSelect: 1 },
      { name: "phone", type: "text", required: true, max: 15 },
      { name: "code_hash", type: "text", required: true, min: 64, max: 64 },
      { name: "expires", type: "date", required: true },
      { name: "attempts", type: "number", onlyInt: true },
    ],
    indexes: [
      `CREATE INDEX idx_${physical("otp_codes")}_lookup ON \`${physical("otp_codes")}\` (\`owner\`, \`phone\`, \`created\`)`,
    ],
  }))

  // ---- messages (append-only audit; quota source) ---------------------------
  app.save(new Collection({
    name: physical("messages"),
    type: "base",
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      CREATED,
      UPDATED,
      { name: "owner", type: "relation", collectionId: usersId, cascadeDelete: true, maxSelect: 1, required: true },
      { name: "api_key", type: "relation", collectionId: apiKeysId, cascadeDelete: true, maxSelect: 1 },
      { name: "phone", type: "text", required: true, max: 15 },
      // provider message id: WhatsApp "wamid..." or Telegram message id
      { name: "wa_message_id", type: "text", max: 128 },
      { name: "channel", type: "select", values: ["whatsapp", "telegram"], maxSelect: 1 },
      // "sent" is written by the send path; the rest arrive later from the
      // provider's status webhook. Quota does NOT count this field — see
      // `billable` below and 1789430500_immutable_billable_usage.pb.js.
      { name: "status", type: "select",
        values: ["sent", "delivered", "read", "failed"], maxSelect: 1 },
      // Written once by the send path when the provider accepted the message
      // and never updated afterwards. Added by the billable migration on
      // installs created before it existed.
      { name: "billable", type: "bool" },
      { name: "error", type: "text", max: 500 },
    ],
    // idx_owner_created serves the quota count (owner + created range);
    // idx_wa_message_id serves the webhook's lookup by provider message id.
    indexes: [
      `CREATE INDEX idx_${physical("messages")}_owner_created ON \`${physical("messages")}\` (\`owner\`, \`created\`)`,
      `CREATE INDEX idx_${physical("messages")}_wa_message_id ON \`${physical("messages")}\` (\`wa_message_id\`)`,
    ],
  }))

  // ---- tg_links (platform-wide phone -> Telegram mapping) -------------------
  app.save(new Collection({
    name: physical("tg_links"),
    type: "base",
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      CREATED,
      UPDATED,
      { name: "phone", type: "text", required: true, max: 15 },
      { name: "chat_id", type: "text", required: true, max: 32 },
      { name: "tg_user_id", type: "text", max: 32 },
      { name: "linked_at", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: [
      `CREATE UNIQUE INDEX idx_${physical("tg_links")}_phone ON \`${physical("tg_links")}\` (\`phone\`)`,
    ],
  }))

  // ---- settings (single operator-edited row) ---------------------------------
  const settings = new Collection({
    name: physical("settings"),
    type: "base",
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      CREATED,
      UPDATED,
      { name: "meta_phone_number_id", type: "text", max: 64 },
      // Fernet-encrypted at rest; even a PB dump should not leak the Meta token.
      { name: "meta_token_enc", type: "text", max: 500 },
      // Also encrypted: this verifies inbound webhook signatures, so leaking it
      // would let an attacker forge delivery-status callbacks.
      { name: "meta_app_secret_enc", type: "text", max: 500 },
      // Echoed back during Meta's subscription handshake. Read from the merged
      // config, so setting it here works without a redeploy.
      { name: "meta_verify_token", type: "text", max: 128 },
      { name: "meta_template", type: "text", max: 64 },
      { name: "meta_template_lang", type: "text", max: 16 },
      { name: "tg_bot_token", type: "text", max: 128 },
      { name: "tg_bot_username", type: "text", max: 64 },
      // Monthly WhatsApp send cap for THIS installation. 0 means "no cap":
      // the operator is sending from their own Meta account, so there is no
      // tier to enforce — the cap exists as a runaway/spend guard.
      { name: "monthly_send_quota", type: "number", onlyInt: true },
      { name: "per_phone_hourly", type: "number", onlyInt: true },
      { name: "code_ttl_seconds", type: "number", onlyInt: true },
      { name: "max_attempts", type: "number", onlyInt: true },
      { name: "ratelimit_per_min", type: "number", onlyInt: true },
      // Per-source-IP request cap. Bounds a single caller from cycling API
      // keys or probing the verify endpoint.
      { name: "ratelimit_per_ip_per_min", type: "number", onlyInt: true },
      // Minimum seconds between two sends to the same number. 0 disables it
      // (the hourly throttle still applies).
      { name: "resend_cooldown_seconds", type: "number", onlyInt: true },
      { name: "otp_length", type: "number", onlyInt: true },
    ],
  })
  app.save(settings)

  // seed the single settings row with the documented defaults
  const seed = new Record(settings)
  seed.set("meta_phone_number_id", "")
  seed.set("meta_token_enc", "")
  seed.set("meta_template", "verification_code")
  seed.set("meta_template_lang", "en_US")
  seed.set("tg_bot_token", "")
  seed.set("tg_bot_username", "")
  seed.set("monthly_send_quota", 0)
  seed.set("per_phone_hourly", 5)
  seed.set("code_ttl_seconds", 300)
  seed.set("max_attempts", 3)
  seed.set("ratelimit_per_min", 10)
  seed.set("ratelimit_per_ip_per_min", 30)
  seed.set("resend_cooldown_seconds", 0)
  seed.set("otp_length", 6)
  app.save(seed)
}, (app) => {
  const PREFIX = ($os.getenv("WAOTP_PB_COLLECTIONS_PREFIX") || "waotp_").trim()
  const physical = (logical) => PREFIX + logical

  // down: drop wa-otp's own collections, prefixed like the up-migration
  for (const logical of ["settings", "tg_links",
                         "messages", "otp_codes", "api_keys"]) {
    try {
      app.delete(app.findCollectionByNameOrId(physical(logical)))
    } catch (e) {
      // already gone
    }
  }

  if (PREFIX) {
    // wa-otp's own auth collection goes with them
    try {
      app.delete(app.findCollectionByNameOrId(physical("users")))
    } catch (e) {
      // already gone
    }
  } else {
    // dedicated instance: only undo what we added to the stock `users`
    try {
      const users = app.findCollectionByNameOrId("users")
      users.fields.removeByName("status")
      app.save(users)
    } catch (e) {
      // fields already gone
    }
  }
})
