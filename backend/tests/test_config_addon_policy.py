import json

import pytest

import app.config as config


@pytest.fixture()
def drives_file(tmp_path, monkeypatch):
    """Write a drives.json with mixed policies and reset cache around test."""
    path = tmp_path / "drives.json"
    path.write_text(json.dumps([
        {"name": "plain", "path": str(tmp_path / "plain")},
        {
            "name": "off",
            "path": str(tmp_path / "off"),
            "addons": {"intelligence": False},
        },
        {
            "name": "fine",
            "path": str(tmp_path / "fine"),
            "addons": {
                "intelligence": {
                    "index": True,
                    "search": True,
                    "auto_tags": False,
                    "summaries": False,
                    "rag": False,
                },
            },
        },
    ]))
    monkeypatch.setattr(config, "DRIVES_CONFIG", path)
    monkeypatch.setattr(config, "_drives_cache", None)
    yield path
    monkeypatch.setattr(config, "_drives_cache", None)


def test_default_drive_has_all_features_enabled(drives_file):
    assert config.is_addon_feature_enabled("plain", "intelligence", "index")
    assert config.is_addon_feature_enabled("plain", "intelligence", "rag")
    assert config.get_drive_addon_policy("plain", "intelligence") == {}


def test_bool_shorthand_disables_every_feature(drives_file):
    assert not config.is_addon_feature_enabled("off", "intelligence", "index")
    assert not config.is_addon_feature_enabled("off", "intelligence", "search")
    assert not config.is_addon_feature_enabled("off", "intelligence", "rag")
    assert config.get_drive_addon_policy("off", "intelligence") == {"_all": False}


def test_per_feature_dict_respected(drives_file):
    assert config.is_addon_feature_enabled("fine", "intelligence", "index")
    assert config.is_addon_feature_enabled("fine", "intelligence", "search")
    assert not config.is_addon_feature_enabled("fine", "intelligence", "auto_tags")
    assert not config.is_addon_feature_enabled("fine", "intelligence", "rag")


def test_unknown_feature_defaults_true(drives_file):
    assert config.is_addon_feature_enabled("fine", "intelligence", "future_feature")


def test_unknown_addon_defaults_true(drives_file):
    assert config.is_addon_feature_enabled("fine", "knowledge", "anything")


def test_unknown_drive_raises(drives_file):
    with pytest.raises(ValueError):
        config.is_addon_feature_enabled("nope", "intelligence", "index")


def test_invalid_addons_type_rejected(tmp_path, monkeypatch):
    path = tmp_path / "drives.json"
    path.write_text(json.dumps([
        {"name": "x", "path": "/x", "addons": "broken"},
    ]))
    monkeypatch.setattr(config, "DRIVES_CONFIG", path)
    monkeypatch.setattr(config, "_drives_cache", None)
    with pytest.raises(ValueError, match="addons"):
        config.load_drives()


def test_invalid_addon_value_rejected(tmp_path, monkeypatch):
    path = tmp_path / "drives.json"
    path.write_text(json.dumps([
        {"name": "x", "path": "/x", "addons": {"intelligence": "yes"}},
    ]))
    monkeypatch.setattr(config, "DRIVES_CONFIG", path)
    monkeypatch.setattr(config, "_drives_cache", None)
    with pytest.raises(ValueError, match="intelligence"):
        config.load_drives()
