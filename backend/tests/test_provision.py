"""Provisioning payloads.

These assert the *intent encoded in the payloads* — that a fresh install is
created with operator-only signup and a self-update rule that cannot touch
`status`/`verified`. PocketBase's own rule evaluation is not exercised here:
that would need a live PocketBase, and is covered instead by the migration of
the same name running against a real instance.
"""


def test_auth_collection_is_operator_owned():
    from scripts.provision_pb import auth_collection_payload

    payload = auth_collection_payload("waotp_users")

    # No public signup: accounts are provisioned out of band.
    assert payload["createRule"] is None
    assert payload["deleteRule"] is None
    # Users may see and edit their own record...
    assert payload["listRule"] == "id = @request.auth.id"
    assert payload["viewRule"] == "id = @request.auth.id"


def test_auth_collection_self_update_cannot_change_status_or_verified():
    """`status` is the only gate on a suspended account's API keys, and the
    update rule is a record filter rather than a field allowlist — so without
    an explicit guard a user could un-suspend themselves."""
    from scripts.provision_pb import SELF_UPDATE_RULE, auth_collection_payload

    payload = auth_collection_payload("waotp_users")

    assert payload["updateRule"] == SELF_UPDATE_RULE
    assert "@request.body.status:changed = false" in SELF_UPDATE_RULE
    assert "@request.body.verified:changed = false" in SELF_UPDATE_RULE
    # still scoped to the user's own record
    assert SELF_UPDATE_RULE.startswith("id = @request.auth.id")


def test_status_field_is_a_closed_set():
    from scripts.provision_pb import USER_STATUS_FIELD

    assert USER_STATUS_FIELD["values"] == ["active", "suspended"]
    assert USER_STATUS_FIELD["maxSelect"] == 1


def test_messages_collection_carries_the_billable_usage_flag():
    """Usage is counted from `billable`, which must exist on the collection."""
    from scripts.provision_pb import collection_payload

    ids = {"users": "users_id", "api_keys": "keys_id"}
    messages = collection_payload("messages", "waotp_messages", ids)
    billable = next(f for f in messages["fields"] if f["name"] == "billable")
    assert billable["type"] == "bool"

    # The webhook looks rows up by provider message id; without the index every
    # callback scans the table.
    assert any("_wa_message_id" in idx for idx in messages["indexes"])
