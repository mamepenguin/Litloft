# Decisions

decision:
ran_in_app: not-applicable
at: 5fadc09f14f50ca36735814a3278baa1026c2982
by: agent
evidence: Checked git diff origin/develop...HEAD (commits 1ad690fe8, 5fadc09f1). It touches only eight test files: two Playwright specs, frontend/e2e-components/justified-hold-desktop.spec.ts (locator click instead of a measured centre click) and frontend/e2e-epub/typography.spec.ts (polls for each "turned" message instead of waitForTimeout(250)), and six Vitest files under __tests__: frontend/src/__tests__/inboxActions.test.tsx, frontend/src/components/__tests__/FileActions.test.tsx, FileDetailFullScreen.inboxNav.test.tsx, FileDetailFullScreen.smartCollection.test.tsx, GlobalSearch.inSmartCollection.test.tsx and frontend/src/components/sidebar/__tests__/sidebarNameInUse.test.tsx (findBy/waitFor in place of synchronous queries and settle(), and one request filter excluding the once-per-drive image-availability probe). The only new import, getCollectionOnEnded from CollectionPanel, is an existing export read by a test; no production file changed. The runtime stage of frontend/Dockerfile copies only .next/standalone, .next/static, public, server.js, server-routes.js and a few node_modules, so none of these files is part of the served app. git diff --submodule=short origin/develop...HEAD -- addons is empty, so no addon gitlink moved. Nothing a Litloft user can observe changed, so the application was not started.
pending: none
