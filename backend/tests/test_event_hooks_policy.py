"""Per-listener policy filtering in event_hooks dispatch."""

import json

import pytest

import app.config as config
from app.services import event_hooks


@pytest.fixture()
def fake_drives(tmp_path, monkeypatch):
    path = tmp_path / "drives.json"
    path.write_text(json.dumps([
        {"name": "open", "path": str(tmp_path / "open")},
        {"name": "off", "path": str(tmp_path / "off"),
         "addons": {"intelligence": False}},
        {"name": "no-rag", "path": str(tmp_path / "no-rag"),
         "addons": {"intelligence": {"index": True, "rag": False}}},
    ]))
    monkeypatch.setattr(config, "DRIVES_CONFIG", path)
    monkeypatch.setattr(config, "_drives_cache", None)
    yield
    monkeypatch.setattr(config, "_drives_cache", None)


def test_listener_without_addon_passes_through(fake_drives):
    hook = {"url": "http://x"}
    payload = event_hooks._filter_payload_for_listener(
        {"drive": "off", "added": 1}, hook,
    )
    assert payload == {"drive": "off", "added": 1}


def test_drive_payload_dropped_when_feature_disabled(fake_drives):
    hook = {"url": "http://x", "addon": "intelligence", "feature": "index"}
    assert event_hooks._filter_payload_for_listener(
        {"drive": "off", "added": 1}, hook,
    ) is None


def test_drive_payload_passes_when_feature_enabled(fake_drives):
    hook = {"url": "http://x", "addon": "intelligence", "feature": "index"}
    payload = event_hooks._filter_payload_for_listener(
        {"drive": "open", "added": 1}, hook,
    )
    assert payload == {"drive": "open", "added": 1}


def test_drive_payload_feature_distinct(fake_drives):
    """rag=False but index=True → an index listener still gets the event."""
    hook_index = {"url": "...", "addon": "intelligence", "feature": "index"}
    hook_rag = {"url": "...", "addon": "intelligence", "feature": "rag"}
    data = {"drive": "no-rag", "added": 1}
    assert event_hooks._filter_payload_for_listener(data, hook_index) == data
    assert event_hooks._filter_payload_for_listener(data, hook_rag) is None


def test_file_ids_filtered_by_per_file_drive(fake_drives, monkeypatch):
    monkeypatch.setattr(
        event_hooks, "_file_ids_to_drives",
        lambda ids: {"f1": "open", "f2": "off", "f3": "open"},
    )
    hook = {"url": "...", "addon": "intelligence", "feature": "index"}
    out = event_hooks._filter_payload_for_listener(
        {"file_ids": ["f1", "f2", "f3"], "type": "soft_delete"}, hook,
    )
    assert out == {"file_ids": ["f1", "f3"], "type": "soft_delete"}


def test_file_ids_event_dropped_when_all_disabled(fake_drives, monkeypatch):
    monkeypatch.setattr(
        event_hooks, "_file_ids_to_drives",
        lambda ids: {"f1": "off", "f2": "off"},
    )
    hook = {"url": "...", "addon": "intelligence", "feature": "index"}
    assert event_hooks._filter_payload_for_listener(
        {"file_ids": ["f1", "f2"]}, hook,
    ) is None


def test_file_ids_event_unchanged_when_resolution_fails(
    fake_drives, monkeypatch,
):
    """If DB lookup returns nothing we conservatively forward the payload.

    This matches existing graceful-degradation behaviour: addons can still
    apply their own WHERE filter. Failing closed would cause silent data
    loss whenever a file row was deleted before the webhook fired.
    """
    monkeypatch.setattr(event_hooks, "_file_ids_to_drives", lambda ids: {})
    hook = {"url": "...", "addon": "intelligence", "feature": "index"}
    payload = event_hooks._filter_payload_for_listener(
        {"file_ids": ["f1", "f2"]}, hook,
    )
    assert payload == {"file_ids": ["f1", "f2"]}
