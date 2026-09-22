"""The setup token is what holds the first-run config window."""

import json

import pytest
from fastapi.testclient import TestClient

import app.auth as auth
import app.config as config
import app.setup_token as setup_token


@pytest.fixture()
def first_run(tmp_path, monkeypatch):
    """A fresh install: drives seeded, no passwords, no sentinel."""
    drive_dir = tmp_path / "d"
    drive_dir.mkdir()
    data_dir = tmp_path / "data"
    data_dir.mkdir()

    drives_json = tmp_path / "drives.json"
    drives_json.write_text(json.dumps([{"name": "d", "path": str(drive_dir)}]))
    passwords_json = tmp_path / "passwords.json"
    passwords_json.write_text(json.dumps([]))

    monkeypatch.setattr(config, "DRIVES_CONFIG", drives_json)
    monkeypatch.setattr(config, "DATA_DIR", data_dir)
    monkeypatch.setattr(config, "THUMBNAILS_DIR", data_dir / "thumbnails")
    monkeypatch.setattr(config, "CONVERTED_DIR", data_dir / "converted")
    monkeypatch.setattr(config, "_drives_cache", None)
    monkeypatch.setattr(auth, "PASSWORDS_CONFIG", passwords_json)
    monkeypatch.setattr(auth, "_passwords_cache", None)
    monkeypatch.setattr(setup_token, "_token", None)
    monkeypatch.delenv(setup_token.ENV_VAR, raising=False)

    from app.main import app

    with TestClient(app) as c:
        sentinel = data_dir / "setup_completed"
        if sentinel.exists():
            sentinel.unlink()
        yield {
            "client": c,
            "drives_json": drives_json,
            "passwords_json": passwords_json,
            "data_dir": data_dir,
            "drive_path": str(drive_dir),
        }


def _writes(env):
    """Every config write the wizard makes, with a body the validators accept."""
    return [
        ("PUT", "/api/admin/config/drives",
         [{"name": "d", "path": env["drive_path"]}]),
        ("PUT", "/api/admin/config/passwords", []),
        ("PUT", "/api/admin/config/addon-policy", {}),
        ("POST", "/api/admin/config/complete-setup", None),
    ]


@pytest.mark.parametrize("header", [None, "wrong-token", ""])
def test_a_write_without_the_token_is_refused_and_changes_nothing(first_run, header):
    c = first_run["client"]
    before = (
        first_run["drives_json"].read_bytes(),
        first_run["passwords_json"].read_bytes(),
    )
    headers = {} if header is None else {setup_token.HEADER: header}

    for method, url, body in _writes(first_run):
        resp = c.request(method, url, json=body, headers=headers)
        assert resp.status_code == 403, f"{method} {url}: {resp.text}"
        assert "setup_token_invalid" in resp.text

    assert (
        first_run["drives_json"].read_bytes(),
        first_run["passwords_json"].read_bytes(),
    ) == before
    assert not (first_run["data_dir"] / "setup_completed").exists()


def test_every_write_is_accepted_with_the_token(first_run):
    c = first_run["client"]
    headers = {setup_token.HEADER: setup_token.setup_token()}

    for method, url, body in _writes(first_run):
        resp = c.request(method, url, json=body, headers=headers)
        assert resp.status_code == 200, f"{method} {url}: {resp.text}"

    assert (first_run["data_dir"] / "setup_completed").exists()


def test_the_token_grants_nothing_once_setup_is_complete(first_run):
    c = first_run["client"]
    (first_run["data_dir"] / "setup_completed").touch()
    # Two protected drives and a master password: admin is now earned, not free.
    first_run["drives_json"].write_text(
        json.dumps(
            [{"name": "d", "path": first_run["drive_path"], "access_group": "g1"}]
        )
    )
    first_run["passwords_json"].write_text(
        json.dumps([{"password": "master-pw", "groups": ["g1"]}])
    )
    config._drives_cache = None
    auth._passwords_cache = None

    resp = c.put(
        "/api/admin/config/drives",
        json=[{"name": "d", "path": first_run["drive_path"]}],
        headers={setup_token.HEADER: setup_token.setup_token()},
    )
    assert resp.status_code == 403, resp.text
    assert "setup_token_invalid" not in resp.text


def test_the_token_is_in_no_response_body(first_run):
    c = first_run["client"]
    token = setup_token.setup_token()

    bodies = [
        c.get("/api/admin/config/setup-status").text,
        c.put("/api/admin/config/drives", json=[]).text,
        c.post("/api/admin/config/setup-token/verify", json={"token": "no"}).text,
        c.post(
            "/api/admin/config/setup-token/verify", json={"token": token}
        ).text,
    ]
    for body in bodies:
        assert token not in body


def test_setup_status_still_answers_without_a_token(first_run):
    resp = first_run["client"].get("/api/admin/config/setup-status")
    assert resp.status_code == 200, resp.text
    assert resp.json()["completed"] is False
    assert [d["name"] for d in resp.json()["drives"]] == ["d"]


class TestVerify:
    def test_the_right_token_is_accepted(self, first_run):
        resp = first_run["client"].post(
            "/api/admin/config/setup-token/verify",
            json={"token": setup_token.setup_token()},
        )
        assert resp.status_code == 200, resp.text
        assert resp.json() == {"ok": True}

    def test_a_wrong_token_is_refused(self, first_run):
        resp = first_run["client"].post(
            "/api/admin/config/setup-token/verify", json={"token": "nope"}
        )
        assert resp.status_code == 403, resp.text

    def test_a_non_ascii_token_is_refused_not_a_server_error(self, first_run):
        resp = first_run["client"].post(
            "/api/admin/config/setup-token/verify", json={"token": "あいうえお"}
        )
        assert resp.status_code == 403, resp.text

    def test_a_missing_token_is_a_validation_error(self, first_run):
        resp = first_run["client"].post(
            "/api/admin/config/setup-token/verify", json={}
        )
        assert resp.status_code == 422, resp.text


class TestWhereTheTokenComesFrom:
    def test_the_environment_wins(self, monkeypatch):
        monkeypatch.setattr(setup_token, "_token", None)
        monkeypatch.setenv(setup_token.ENV_VAR, "from-the-compose-file")
        assert setup_token.setup_token() == "from-the-compose-file"

    def test_one_is_minted_when_the_variable_is_unset(self, monkeypatch):
        monkeypatch.setattr(setup_token, "_token", None)
        monkeypatch.delenv(setup_token.ENV_VAR, raising=False)
        minted = setup_token.setup_token()
        assert len(minted) >= 24
        assert setup_token.setup_token() == minted

    def test_a_near_miss_does_not_match(self, monkeypatch):
        monkeypatch.setattr(setup_token, "_token", None)
        monkeypatch.setenv(setup_token.ENV_VAR, "abcdef")
        assert setup_token.matches("abcdef") is True
        for near in ("abcde", "abcdefg", "ABCDEF", " abcdef", "abcdef ", "", None):
            assert setup_token.matches(near) is False, near

    def test_a_non_ascii_candidate_is_refused_rather_than_raising(self, monkeypatch):
        monkeypatch.setattr(setup_token, "_token", None)
        monkeypatch.setenv(setup_token.ENV_VAR, "abcdef")
        for pasted in ("あいうえお", "tokén", "🔑"):
            assert setup_token.matches(pasted) is False, pasted

    def test_a_non_ascii_token_can_be_configured(self, monkeypatch):
        monkeypatch.setattr(setup_token, "_token", None)
        monkeypatch.setenv(setup_token.ENV_VAR, "あいうえお")
        assert setup_token.matches("あいうえお") is True
        assert setup_token.matches("あいうえ") is False
