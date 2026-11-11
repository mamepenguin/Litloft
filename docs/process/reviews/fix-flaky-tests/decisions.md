# Decisions

decision:
ran_in_app: not-applicable
at: f23f56e6621fd14183222d83aa6dbcede78a2fa5
by: agent
evidence: git diff origin/develop...HEAD in core touches only frontend/e2e-components/sheet-gesture.spec.ts, a Playwright spec: the CDP swipe helper now passes explicit `timestamp` values on touchStart/touchMove/touchEnd and FLICK's gap is derived from SHEET_PULL_DISMISS_VELOCITY * 4 instead of 0. The runtime stage of frontend/Dockerfile copies only .next/standalone, .next/static, public, server.js, server-routes.js and a few node_modules, so the spec is not part of the served app; the sheet hook it drives is unchanged. In addons/media_import (branch fix/deterministic-delay-test, 8bae8a54518e480227ebad39a5c0f99031202879, not yet pinned by the core gitlink), git diff origin/main...HEAD touches only backend/tests/test_subscription_item_outcomes.py: TestInterItemDelay monkeypatches time.sleep to record calls in the provider's event order and asserts that order instead of wall-clock gaps. No production module in either repository changed, so nothing a Litloft user observes can change. The application was not started.
pending: none
