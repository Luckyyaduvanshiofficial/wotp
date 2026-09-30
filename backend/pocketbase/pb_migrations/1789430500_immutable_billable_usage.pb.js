/// <reference path="../pb_data/types.d.ts" />
/**
 * Make monthly usage immutable: add `messages.billable`.
 *
 * WHY THIS EXISTS
 * The monthly cap used to be counted as `messages` rows with status="sent".
 * But status is not a property of the send — it is a property of what the
 * provider later reported. Meta's status callback flips a row from "sent" to
 * "delivered", and every delivered message therefore dropped out of the count:
 * the cap silently under-counted and handed the operator back quota as their
 * messages succeeded. A spend guard that decreases when sends succeed is not a
 * spend guard.
 *
 * `billable` is written exactly once, by the send path, when the provider
 * accepts the message, and is never written again. Status callbacks touch
 * `status`/`error` only. Counting a single append-only field is what makes the
 * cap stable.
 *
 * SEMANTICS (deliberate, and slightly different from before)
 * - A message the provider accepted counts, even if a later callback reports
 *   it failed. Meta accepted it, so it may well be billed; under-counting is
 *   the failure mode that costs the operator money.
 * - A message the provider rejected outright never counts: the send path
 *   writes those rows with billable=false (and they are the only rows with an
 *   empty wa_message_id).
 *
 * BACKFILL
 * Existing rows predate the field, so they are set from the only signal
 * available: a non-empty wa_message_id means the provider accepted the
 * message. Rows are paged through rather than fetched in one shot, because a
 * busy install can have a large messages table.
 *
 * Idempotent: the field is only added when missing, and the backfill only
 * writes rows where billable still differs from what it should be.
 */
migrate((app) => {
  const PREFIX = ($os.getenv("WOTP_PB_COLLECTIONS_PREFIX") ||
    $os.getenv("WAOTP_PB_COLLECTIONS_PREFIX") ||
    "waotp_").trim()
  const physical = (logical) => PREFIX + logical

  let messages
  try {
    messages = app.findCollectionByNameOrId(physical("messages"))
  } catch (e) {
    // No messages collection: fresh install, the init migration handles it.
    return
  }

  if (!messages.fields.getByName("billable")) {
    messages.fields.add(new Field({
      name: "billable",
      type: "bool",
    }))
    app.save(messages)
  }

  // Backfill in pages. `limit` is the page size, `offset` walks forward.
  const PAGE = 200
  let offset = 0
  for (;;) {
    const rows = app.findRecordsByFilter(physical("messages"), "", "created", PAGE, offset)
    if (!rows || rows.length === 0) break

    for (const row of rows) {
      // A provider message id only exists once the provider accepted the send.
      const shouldBe = !!row.get("wa_message_id")
      const current = row.get("billable")
      if (current !== shouldBe) {
        row.set("billable", shouldBe)
        app.save(row)
      }
    }

    offset += rows.length
    if (rows.length < PAGE) break
  }
}, (app) => {
  const PREFIX = ($os.getenv("WOTP_PB_COLLECTIONS_PREFIX") ||
    $os.getenv("WAOTP_PB_COLLECTIONS_PREFIX") ||
    "waotp_").trim()
  const physical = (logical) => PREFIX + logical

  try {
    const messages = app.findCollectionByNameOrId(physical("messages"))
    if (messages.fields.getByName("billable")) {
      // Values are lost; they are re-derivable from wa_message_id, which is
      // what the up migration used in the first place.
      messages.fields.removeByName("billable")
      app.save(messages)
    }
  } catch (e) {
    // nothing to undo
  }
})
