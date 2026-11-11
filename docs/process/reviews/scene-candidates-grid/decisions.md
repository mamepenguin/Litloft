spec: docs/specs/scene-candidates-grid.md

ran_in_app: yes
at: core a9ee5622f / intelligence 78a055fb
by: agent

Independent R-5 used the actual SceneCandidatesSection, shared cardGrid helper, next-intl catalogue and compiled application CSS in a temporary React browser harness. Only API data and navigation were mocked. Chromium at 375px, 1280px and a 375px pane preserved ranked results, expanded 8→20 and collapsed to 8 without a new fetch, accepted Enter/Space, and exposed all candidates through vertical scroll with no horizontal overflow. Long unbroken filenames stayed within two lines. No page errors were observed.

Local evidence: /private/tmp/scene-grid-review/results.json and {375,1280}-{loading,collapsed,expanded,recollapsed}.png plus 1280-narrow-pane.png. These temporary files are not permanent PR artifacts.

Validation: full Vitest suite 8,728 passed, two todo; TypeScript passed; ESLint zero errors with existing warnings; eight Chromium layout cases passed. Independent fixed-commit review found zero defects (review.md).

Pending: full Next route against the live backend, real household devices, and actual video playback were not exercised. The companion core PR remains draft until the addon PR is merged and its submodule pin updated.

decision:
