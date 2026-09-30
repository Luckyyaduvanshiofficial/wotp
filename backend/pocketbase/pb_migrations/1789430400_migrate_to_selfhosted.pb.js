/// <reference path="../pb_data/types.d.ts" />
/**
 * Upgrade an EXISTING wa-otp install to the self-hosted schema.
 *
 * Why this file exists: `1757750400_init_waotp.pb.js` was rewritten in place
 * when this project stopped being a hosted service (dropped the free/paid tier,
 * closed public signup, added the webhook + per-IP limit fields). A fresh clone
 * is correct, but PocketBase records an applied migration by filename and will
 * never re-run the edited init file — so an install that was provisioned before
 * the change keeps the old schema forever, quietly ignoring the new code.
 * This migration brings such an install forward. On a fresh clone it is a no-op
 * (every branch checks first), which is why it is safe to ship unconditionally.
 *
 * Every step is guarded and idempotent for the same reason: a partially-applied
 * migration that is re-run must not fail on work it already did.
 *
 * Irreversible in one place: dropping `plan` and `cost_type` deletes whatever
 * they held. Neither was ever read by application code, so nothing depends on
 * the values — but they cannot be restored by the down migration either.
 */
migrate((app) => {
  const PREFIX = ($os.getenv("WAOTP_PB_COLLECTIONS_PREFIX") || "waotp_").trim()
  const physical = (logical) => PREFIX + logical

  const CREATED = { name: "created", type: "autodate", onCreate: true }
  const UPDATED = { name: "updated", type: "autodate", onCreate: true, onUpdate: true }

  // ---- 1. close public signup ---------------------------------------------
  // The single most important step: an install provisioned under the hosted
  // model has createRule "" on its auth collection, so any visitor who finds
  // the box can register, mint an API key, and send OTPs from the operator's
  // own Meta account. Prefixed installs own `{prefix}users`; an unprefixed
  // (dedicated) install uses the stock `users`, which has the same problem.
  const usersName = PREFIX ? physical("users") : "users"
  try {
    const users = app.findCollectionByNameOrId(usersName)
    if (users.createRule !== null) {
      users.createRule = null
      app.save(users)
    }
    // ---- 2. drop the SaaS tier marker -------------------------------------
    // `plan` was stored, echoed by /v1/usage, and branched on by nothing.
    if (users.fields.getByName("plan")) {
      users.fields.removeByName("plan")
      app.save(users)
    }
  } catch (e) {
    // No auth collection yet — a fresh install; the init migration handles it.
  }

  // ---- 3. drop the unimplemented billing collections ----------------------
  // Neither is referenced by any application code: no route, no service, no
  // webhook reads or writes them. Remove them, and if billing ever returns,
  // re-add them from the schema in PRD.md rather than resurrecting dead tables.
  for (const logical of ["wallet_txns", "rate_cards"]) {
    try {
      app.delete(app.findCollectionByNameOrId(physical(logical)))
    } catch (e) {
      // already gone (fresh install, or a previous run of this migration)
    }
  }

  // ---- 4. messages: webhook lookup index + newer status values ------------
  try {
    const messages = app.findCollectionByNameOrId(physical("messages"))
    let dirty = false

    // The status webhook looks rows up by provider message id; without this
    // index every callback scans the table.
    const waIndexName = `idx_${physical("messages")}_wa_message_id`
    const hasWaIndex = (messages.indexes || []).some(
      (sql) => typeof sql === "string" && sql.indexOf(waIndexName) !== -1
    )
    if (!hasWaIndex) {
      messages.indexes = (messages.indexes || []).concat([
        `CREATE INDEX ${waIndexName} ON \`${physical("messages")}\` (\`wa_message_id\`)`,
      ])
      dirty = true
    }

    // Older installs only allowed ["sent", "failed"]; the webhook now records
    // delivered/read too. A select would reject the callback without this.
    const statusField = messages.fields.getByName("status")
    if (statusField) {
      const want = ["sent", "delivered", "read", "failed"]
      const have = statusField.values || []
      const missing = want.filter((v) => have.indexOf(v) === -1)
      if (missing.length) {
        statusField.values = have.concat(missing)
        dirty = true
      }
    }

    // Billing remnant: written by the old send path, read by nothing.
    if (messages.fields.getByName("cost_type")) {
      messages.fields.removeByName("cost_type")
      dirty = true
    }

    if (dirty) app.save(messages)
  } catch (e) {
    // No messages collection: fresh install, nothing to upgrade.
  }

  // ---- 5. settings: quota field rename + new limiter fields ---------------
  try {
    const settings = app.findCollectionByNameOrId(physical("settings"))
    let dirty = false

    // `free_monthly_limit` named a free tier that no longer exists. The value
    // is real (it is the operator's runaway-spend cap), so it is carried across
    // rather than reset to the default.
    const hadFreeField = !!settings.fields.getByName("free_monthly_limit")
    if (hadFreeField) {
      settings.fields.add(new Field({
        name: "monthly_send_quota",
        type: "number",
        onlyInt: true,
      }))
      dirty = true
    }

    const newFields = [
      // Per-source-IP cap: bounds one caller cycling API keys or probing verify.
      { name: "ratelimit_per_ip_per_min", type: "number", onlyInt: true, seed: 30 },
      // Minimum seconds between two sends to the same number; 0 disables.
      { name: "resend_cooldown_seconds", type: "number", onlyInt: true, seed: 0 },
      { name: "otp_length", type: "number", onlyInt: true, seed: 6 },
    ]
    const added = []
    for (const f of newFields) {
      if (!settings.fields.getByName(f.name)) {
        settings.fields.add(new Field({
          name: f.name, type: "number", onlyInt: true,
        }))
        added.push(f)
        dirty = true
      }
    }

    if (dirty) app.save(settings)

    // Backfill the existing rows after the schema is in place.
    if (hadFreeField || added.length) {
      const rows = app.findRecordsByFilter(physical("settings"), "", "", 100, 0)
      for (const row of rows) {
        if (hadFreeField) {
          const carried = row.get("free_monthly_limit")
          row.set("monthly_send_quota", carried === null || carried === undefined ? 0 : carried)
        }
        for (const f of added) row.set(f.name, f.seed)
        app.save(row)
      }
      // Drop the old field only after its values have been copied, so a failure
      // above leaves the data recoverable rather than silently zeroed.
      if (hadFreeField) {
        const after = app.findCollectionByNameOrId(physical("settings"))
        if (after.fields.getByName("free_monthly_limit")) {
          after.fields.removeByName("free_monthly_limit")
          app.save(after)
        }
      }
    } else {
      // Fresh install: the init migration already seeded the single row.
      const rows = app.findRecordsByFilter(physical("settings"), "", "", 100, 0)
      for (const row of rows) {
        for (const f of newFields) {
          const current = row.get(f.name)
          if (current === null || current === undefined || current === 0) {
            row.set(f.name, f.seed)
          }
        }
        app.save(row)
      }
    }
  } catch (e) {
    // No settings collection: fresh install, nothing to upgrade.
  }
}, (app) => {
  const PREFIX = ($os.getenv("WAOTP_PB_COLLECTIONS_PREFIX") || "waotp_").trim()
  const physical = (logical) => PREFIX + logical

  const CREATED = { name: "created", type: "autodate", onCreate: true }
  const UPDATED = { name: "updated", type: "autodate", onCreate: true, onUpdate: true }

  // settings: put the old quota field name back, drop the limiter fields
  try {
    const settings = app.findCollectionByNameOrId(physical("settings"))
    const retired = ["ratelimit_per_ip_per_min", "resend_cooldown_seconds", "otp_length"]
    let dirty = false
    for (const name of retired) {
      if (settings.fields.getByName(name)) {
        settings.fields.removeByName(name)
        dirty = true
      }
    }
    if (settings.fields.getByName("monthly_send_quota")) {
      settings.fields.add(new Field({
        name: "free_monthly_limit", type: "number", onlyInt: true,
      }))
      dirty = true
    }
    if (dirty) app.save(settings)

    const rows = app.findRecordsByFilter(physical("settings"), "", "", 100, 0)
    for (const row of rows) {
      if (row.get("monthly_send_quota") !== null && row.get("monthly_send_quota") !== undefined) {
        row.set("free_monthly_limit", row.get("monthly_send_quota"))
        app.save(row)
      }
    }
    const after = app.findCollectionByNameOrId(physical("settings"))
    if (after.fields.getByName("monthly_send_quota")) {
      after.fields.removeByName("monthly_send_quota")
      app.save(after)
    }
  } catch (e) {
    // nothing to undo
  }

  // messages: drop the webhook index and the widened status values
  try {
    const messages = app.findCollectionByNameOrId(physical("messages"))
    const waIndexName = `idx_${physical("messages")}_wa_message_id`
    messages.indexes = (messages.indexes || []).filter(
      (sql) => typeof sql !== "string" || sql.indexOf(waIndexName) === -1
    )
    app.save(messages)
  } catch (e) {
    // nothing to undo
  }

  // users: `plan` and an open create rule are NOT restored. Reopening public
  // signup would re-create the spam-gateway hole this migration exists to close,
  // so the down migration deliberately restores the schema shape only.
  const usersName = PREFIX ? physical("users") : "users"
  try {
    const users = app.findCollectionByNameOrId(usersName)
    if (!users.fields.getByName("plan")) {
      users.fields.add(new Field({
        name: "plan",
        type: "select",
        values: ["free", "paid"],
        maxSelect: 1,
      }))
      app.save(users)
    }
  } catch (e) {
    // nothing to undo
  }

  // Re-create the billing collections empty. Their rows are gone for good;
  // this restores the shape so a rollback does not leave code that expects them
  // addressing a missing collection.
  const usersForBilling = (() => {
    try {
      return app.findCollectionByNameOrId(usersName)
    } catch (e) {
      return null
    }
  })()
  if (usersForBilling) {
    for (const logical of ["wallet_txns", "rate_cards"]) {
      try {
        app.findCollectionByNameOrId(physical(logical))
        continue // still there
      } catch (e) {
        // recreate below
      }
      app.save(new Collection({
        name: physical(logical),
        type: "base",
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          CREATED,
          UPDATED,
          { name: "owner", type: "relation", collectionId: usersForBilling.id, cascadeDelete: true, maxSelect: 1 },
          { name: "amount", type: "number" },
          { name: "note", type: "text", max: 200 },
        ],
      }))
    }
  }
})
