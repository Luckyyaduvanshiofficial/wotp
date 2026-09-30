/// <reference path="../pb_data/types.d.ts" />
/**
 * Add the two Meta credentials the settings row was missing.
 *
 * WHY THIS EXISTS
 * `services/settings.py` merges `meta_app_secret` and `meta_verify_token` from
 * the settings row over the environment, and every reader now goes through that
 * merged config — but neither field existed on the collection:
 *
 * - `meta_app_secret_enc` never existed at all, so the app secret could only
 *   ever come from the environment. Rotating it meant a redeploy, and
 *   /health/ready reported the env value while the webhook verified against it.
 * - `meta_verify_token` was *read* by the merge but never created, so setting
 *   it in the admin UI silently did nothing and the handshake kept failing with
 *   a token the operator could see right there in the row.
 *
 * Both are credentials, so the app secret is stored encrypted (Fernet, like
 * `meta_token_enc`) — it authenticates inbound webhook calls, and a leaked one
 * lets an attacker forge delivery statuses.
 *
 * `meta_verify_token` is not a secret in the same sense (Meta echoes it back),
 * but it is compared in constant time against a caller-supplied value, so it is
 * stored as plain text like the template name.
 *
 * Idempotent: each field is only added when missing, so it is a no-op on an
 * install created after the init migration gained them.
 */
migrate((app) => {
  const PREFIX = ($os.getenv("WOTP_PB_COLLECTIONS_PREFIX") ||
    $os.getenv("WAOTP_PB_COLLECTIONS_PREFIX") ||
    "waotp_").trim()
  const physical = (logical) => PREFIX + logical

  let settings
  try {
    settings = app.findCollectionByNameOrId(physical("settings"))
  } catch (e) {
    return // no settings collection: fresh install handled by the init migration
  }

  let dirty = false
  const wanted = [
    { name: "meta_app_secret_enc", type: "text", max: 500 },
    { name: "meta_verify_token", type: "text", max: 128 },
  ]
  for (const f of wanted) {
    if (!settings.fields.getByName(f.name)) {
      settings.fields.add(new Field(f))
      dirty = true
    }
  }
  if (dirty) app.save(settings)
}, (app) => {
  const PREFIX = ($os.getenv("WOTP_PB_COLLECTIONS_PREFIX") ||
    $os.getenv("WAOTP_PB_COLLECTIONS_PREFIX") ||
    "waotp_").trim()
  const physical = (logical) => PREFIX + logical

  try {
    const settings = app.findCollectionByNameOrId(physical("settings"))
    let dirty = false
    for (const name of ["meta_app_secret_enc", "meta_verify_token"]) {
      if (settings.fields.getByName(name)) {
        settings.fields.removeByName(name)
        dirty = true
      }
    }
    // Dropping these discards the encrypted app secret and the verify token.
    // They are re-enterable from the admin UI, and the env values still apply.
    if (dirty) app.save(settings)
  } catch (e) {
    // nothing to undo
  }
})
