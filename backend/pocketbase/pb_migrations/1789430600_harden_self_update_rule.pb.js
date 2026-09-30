/// <reference path="../pb_data/types.d.ts" />
/**
 * Stop a user editing their own `status` (or `verified`).
 *
 * WHY THIS EXISTS
 * The auth collection's update rule was `id = @request.auth.id`. A PocketBase
 * API rule is a record filter, not a field allowlist, so that rule let a
 * signed-in user PATCH *any* field on their own record with their own session
 * token — including `status`. `status` is the only thing that gates a
 * suspended account's API keys (`resolve_api_key` returns 403 key_disabled when
 * the owner is suspended), so a suspended operator could simply un-suspend
 * themselves against the PocketBase REST API. `verified` was writable the same
 * way.
 *
 * THE FIX
 * PocketBase's documented `:changed` modifier is true only when the client
 * submitted the field AND its value differs from the stored one:
 *
 *     @request.body.status:changed = false
 *
 * which permits a client that round-trips the current value but rejects a real
 * change to it. That keeps ordinary profile updates (name) working while
 * closing the escalation.
 *
 * This migration matters for installs that already exist: provision_pb.py is
 * idempotent by design and never modifies a collection that is already there,
 * so without this the guard would only ever apply to fresh installs.
 *
 * Applies to both deployment shapes — `{prefix}users` on a shared instance and
 * the stock `users` collection on a dedicated one — because the init migration
 * gives both the same permissive rule.
 */
migrate((app) => {
  const PREFIX = ($os.getenv("WAOTP_PB_COLLECTIONS_PREFIX") || "waotp_").trim()
  const physical = (logical) => PREFIX + logical

  const GUARDED =
    "id = @request.auth.id" +
    " && @request.body.status:changed = false" +
    " && @request.body.verified:changed = false"

  const names = PREFIX ? [physical("users")] : ["users"]

  for (const name of names) {
    let users
    try {
      users = app.findCollectionByNameOrId(name)
    } catch (e) {
      continue // not provisioned on this instance
    }

    // Only upgrade the permissive self-service rule. A locked rule (null) is
    // already stricter than this migration, and a rule someone wrote by hand is
    // not ours to overwrite.
    if (users.updateRule === "id = @request.auth.id") {
      users.updateRule = GUARDED
      app.save(users)
    }
  }
}, (app) => {
  const PREFIX = ($os.getenv("WAOTP_PB_COLLECTIONS_PREFIX") || "waotp_").trim()
  const physical = (logical) => PREFIX + logical

  const GUARDED =
    "id = @request.auth.id" +
    " && @request.body.status:changed = false" +
    " && @request.body.verified:changed = false"

  const names = PREFIX ? [physical("users")] : ["users"]

  for (const name of names) {
    try {
      const users = app.findCollectionByNameOrId(name)
      if (users.updateRule === GUARDED) {
        // Restores the previous rule only; the escalation it allowed comes back
        // with it, which is why a down migration is not a supported state.
        users.updateRule = "id = @request.auth.id"
        app.save(users)
      }
    } catch (e) {
      // nothing to undo
    }
  }
})
