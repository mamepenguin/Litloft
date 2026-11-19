"""SPEC-CORE-149: the browser suites run in the Playwright image, split across jobs.

Reads .github/workflows/ci.yml and frontend/pnpm-lock.yaml; nothing runs.
"""
from __future__ import annotations

import re
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parent.parent
CI = ROOT / ".github" / "workflows" / "ci.yml"
LOCKFILE = ROOT / "frontend" / "pnpm-lock.yaml"

COMPONENTS = "frontend-components"
LAYOUT_EPUB = "frontend-layout-epub"
BROWSER_JOBS = (COMPONENTS, LAYOUT_EPUB)
REMOVED_NAME = "frontend (layout invariants and components in a browser)"

COMPONENTS_TEST = (
    "pnpm exec playwright test --config=playwright-components.config.ts"
    " --shard=${{ matrix.shard }}/2"
)
EPUB_IF = "${{ !cancelled() && steps.browsers.outcome == 'success' }}"
BROWSER_CHECK = {
    COMPONENTS: "node scripts/check-playwright-browsers.mjs chromium chromium-headless-shell",
    LAYOUT_EPUB: "node scripts/check-playwright-browsers.mjs chromium chromium-headless-shell webkit",
}


def _workflow() -> dict:
    return yaml.safe_load(CI.read_text())


def _job(job_id: str) -> dict:
    jobs = _workflow()["jobs"]
    assert job_id in jobs, f"ci.yml has no job {job_id!r}"
    return jobs[job_id]


def _norm(text: object) -> str:
    return " ".join(str(text).split())


def _run(step: dict) -> str:
    return _norm(step.get("run", ""))


def _uses(step: dict, action: str) -> bool:
    return str(step.get("uses", "")).startswith(f"{action}@")


def _workdir(job: dict, step: dict) -> str | None:
    if "working-directory" in step:
        return step["working-directory"]
    return job.get("defaults", {}).get("run", {}).get("working-directory")


def _is_test_step(step: dict) -> bool:
    run = _run(step)
    return "playwright test" in run or "test:e2e" in run


def _test_steps(job: dict) -> list[dict]:
    return [s for s in job["steps"] if _is_test_step(s)]


def _index(steps: list[dict], predicate, what: str) -> int:
    hits = [i for i, s in enumerate(steps) if predicate(s)]
    assert len(hits) == 1, f"expected one step that {what}, found {len(hits)}"
    return hits[0]


def _lockfile_playwright_version() -> str:
    lock = yaml.safe_load(LOCKFILE.read_text())
    entry = lock["importers"]["."]["devDependencies"]["@playwright/test"]
    return str(entry["version"]).split("(")[0]


# SPEC-CORE-149 item 2 (check names)
def test_browser_check_names() -> None:
    components = _job(COMPONENTS)
    assert components["name"] == "frontend (browser components ${{ matrix.shard }}/2)"
    assert components["strategy"]["matrix"]["shard"] == [1, 2]
    assert _job(LAYOUT_EPUB)["name"] == "frontend (layout invariants and EPUB reader in a browser)"


# SPEC-CORE-149 item 2, I7 (the removed job is gone from ci.yml)
def test_single_browser_job_is_removed() -> None:
    jobs = _workflow()["jobs"]
    assert "frontend-layout" not in jobs
    assert REMOVED_NAME not in {str(j.get("name")) for j in jobs.values()}


# SPEC-CORE-149 I9, item 2: one image tag, equal to the lockfile's @playwright/test
@pytest.mark.parametrize("job_id", BROWSER_JOBS)
def test_browser_job_runs_in_the_lockfile_playwright_image(job_id: str) -> None:
    job = _job(job_id)
    version = _lockfile_playwright_version()
    assert job["runs-on"] == "ubuntu-latest"
    container = job["container"]
    assert container["image"] == f"mcr.microsoft.com/playwright:v{version}-noble"
    assert _norm(container["options"]) == "--user 1001"


# SPEC-CORE-149 I9: the same literal tag in every browser job
def test_browser_jobs_share_one_image() -> None:
    images = {_job(j)["container"]["image"] for j in BROWSER_JOBS}
    assert len(images) == 1


# SPEC-CORE-149 I9, item 3: Node 20 through setup-node with the pnpm cache
@pytest.mark.parametrize("job_id", BROWSER_JOBS)
def test_browser_job_tests_on_node_20(job_id: str) -> None:
    steps = _job(job_id)["steps"]
    setup = steps[_index(steps, lambda s: _uses(s, "actions/setup-node"), "sets up Node")]
    assert str(setup["with"]["node-version"]) == "20"
    assert setup["with"]["cache"] == "pnpm"
    assert setup["with"]["cache-dependency-path"] == "frontend/pnpm-lock.yaml"


# SPEC-CORE-149 item 3 (step order), I5
@pytest.mark.parametrize("job_id", BROWSER_JOBS)
def test_browser_job_step_order(job_id: str) -> None:
    job = _job(job_id)
    steps = job["steps"]
    checkout = _index(steps, lambda s: _uses(s, "actions/checkout"), "checks out")
    addons = _index(steps, lambda s: _run(s) == "./setup-addons.sh", "runs setup-addons.sh")
    pnpm = _index(steps, lambda s: _uses(s, "pnpm/action-setup"), "sets up pnpm")
    node = _index(steps, lambda s: _uses(s, "actions/setup-node"), "sets up Node")
    install = _index(
        steps, lambda s: _run(s) == "pnpm install --frozen-lockfile", "installs dependencies"
    )
    browsers = _index(steps, lambda s: s.get("id") == "browsers", "has id browsers")
    tests = [i for i, s in enumerate(steps) if _is_test_step(s)]

    assert steps[checkout]["with"]["submodules"] == "recursive"
    assert _workdir(job, steps[install]) == "frontend"
    assert tests, "no test step"
    assert checkout < addons < pnpm < node < install < browsers < min(tests)


# SPEC-CORE-149 item 3: no translation merge step in a browser job
@pytest.mark.parametrize("job_id", BROWSER_JOBS)
def test_browser_job_has_no_translation_merge(job_id: str) -> None:
    for step in _job(job_id)["steps"]:
        assert "merge-addon-messages" not in _run(step)


# SPEC-CORE-149 item 4, I4 (wiring): the browser check, its names, and that it gates every test step
@pytest.mark.parametrize("job_id", BROWSER_JOBS)
def test_browser_check_step(job_id: str) -> None:
    job = _job(job_id)
    steps = job["steps"]
    check = steps[_index(steps, lambda s: s.get("id") == "browsers", "has id browsers")]
    assert _run(check) == BROWSER_CHECK[job_id]
    assert _workdir(job, check) == "frontend"
    assert "if" not in check
    assert "continue-on-error" not in check


# SPEC-CORE-149 I1, item 2: the component shards, exactly 1/2 and 2/2, unfiltered
def test_component_job_runs_both_shards_of_the_component_config() -> None:
    job = _job(COMPONENTS)
    tests = _test_steps(job)
    assert len(tests) == 1
    assert _run(tests[0]) == COMPONENTS_TEST
    assert _workdir(job, tests[0]) == "frontend"
    assert "if" not in tests[0]


# SPEC-CORE-149 I1, I8, item 2: layout then EPUB, package scripts, EPUB runs after a layout failure
def test_layout_epub_job_runs_both_suites() -> None:
    job = _job(LAYOUT_EPUB)
    tests = _test_steps(job)
    assert [_run(s) for s in tests] == ["pnpm test:e2e:layout", "pnpm test:e2e:epub"]
    layout, epub = tests
    assert _workdir(job, layout) == "frontend"
    assert _workdir(job, epub) == "frontend"
    assert "if" not in layout
    assert _norm(epub.get("if")) == EPUB_IF


# SPEC-CORE-149 I1: no filter on any browser test command
@pytest.mark.parametrize("job_id", BROWSER_JOBS)
@pytest.mark.parametrize("flag", ["--project", "--grep", "--grep-invert", "--pass-with-no-tests"])
def test_browser_test_commands_carry_no_filter(job_id: str, flag: str) -> None:
    tests = _test_steps(_job(job_id))
    assert tests
    for step in tests:
        assert flag not in _run(step)


# SPEC-CORE-149 I2: a failing case turns the job red
@pytest.mark.parametrize("job_id", BROWSER_JOBS)
def test_browser_failures_are_not_swallowed(job_id: str) -> None:
    job = _job(job_id)
    assert "continue-on-error" not in job
    for step in job["steps"]:
        assert "continue-on-error" not in step
    tests = _test_steps(job)
    assert tests
    for step in tests:
        assert not re.search(r"(?<!\|)\|(?!\|)", _run(step)), _run(step)


# SPEC-CORE-149 I2
def test_component_matrix_does_not_fail_fast() -> None:
    assert _job(COMPONENTS)["strategy"]["fail-fast"] is False


# SPEC-CORE-149 I3, item 5: nothing installs browsers or system packages; no browser cache
@pytest.mark.parametrize("job_id", BROWSER_JOBS)
def test_browser_job_installs_nothing(job_id: str) -> None:
    for step in _job(job_id)["steps"]:
        run = _run(step)
        assert "apt-get" not in run
        assert "playwright install" not in run
        assert "ms-playwright" not in _norm(step.get("with", ""))


# SPEC-CORE-149 I10, item 6: this test runs in bootstrap, with PyYAML installed
def test_bootstrap_installs_pyyaml_and_runs_tests() -> None:
    job = _job("bootstrap")
    assert job["name"] == "bootstrap (configure.py)"
    runs = [_run(s) for s in job["steps"]]
    assert "pip install pytest PyYAML==6.0.2" in runs
    assert any(r.startswith("python -m pytest tests") for r in runs)
