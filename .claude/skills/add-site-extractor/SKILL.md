---
name: add-site-extractor
description: "Add or fix a site-specific Web Clip extractor in the knowledge addon, for a site the generic trafilatura/readability pipeline mangles. Use when a clipped page loses its body, keeps ads and related-post blocks, fuses fields together, or drops a section entirely. Covers measuring the page first, choosing between faithful-article and structured-record output, the registry contract, fixtures and goldens, and the traps that make a broken parser look like a thin page."
---

# Adding a Web Clip site extractor

Web Clip lives in `addons/knowledge`, a **submodule with its own
repository**. Nothing here touches core. Read `CLAUDE.md`'s Git section
before committing: the addon merges first, then the core repo bumps the
gitlink in a second PR.

```
addons/knowledge/app/services/
  extractor.py                       dispatcher + public API
  extractors/base.py                 contract, host matching, size ceiling
  extractors/preprocess.py           repairs shared by many sites
  extractors/generic.py              trafilatura -> readability
  extractors/shapes/recipe.py        a record type and its Markdown
  extractors/sites/<site>.py         one site
  extractors/__init__.py             REGISTRY
```

## 1. Measure before designing

Never write a parser from a theory about the site. Fetch the page and
run the current pipeline over it.

```bash
cd /Users/libre/Sources/video_share/addons/knowledge
curl -sSL -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) \
AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36" \
  "https://example.com/article/1" -o /tmp/page.html

docker build -f Dockerfile.test -t knowledge-test .
docker run --rm -v /tmp:/data:ro knowledge-test python -c "
from app.services.extractor import extract_article
a = extract_article(open('/data/page.html', encoding='utf-8', errors='replace').read(),
                    'https://example.com/article/1')
print(a.title); print(a.markdown)
"
```

Write down what is **missing**, not just what is ugly. A page that keeps
its ads is annoying; a page whose method or body section is gone is
unclippable, and that is the thing to fix.

### Measure more than one page, from different years

**This is the failure that has actually happened.** A parser was built
from a 2018 post, passed its tests and its golden, and was partially
broken on the site's current layout — which is the layout that gets
clipped.

Long-lived sites replace their template without regenerating old posts,
so two or more layouts coexist permanently. Pick one old post and one
recent post at minimum. Watch for:

- content moving into or out of a wrapper (`<section>`, `<article>`)
- field values gaining a wrapper (a name inside `<a href="/?s=...">`)
- sub-headings appearing (`<strong>` rows inside a list)
- a metadata block disappearing entirely
- `<img>` becoming `<picture>` + `<source data-srcset>`
- structured data going from empty frames to fully populated, or back

Each of these breaks a parser **silently and partially**. Nothing
raises, no fallback runs, and the output looks like a page that simply
had fewer ingredients or no notes. That is far worse than a crash.

### Check the structured data, but do not trust it

Look for `application/ld+json`. Sites frequently emit the frame and
never fill it:

```json
"recipeIngredient": [""],
"recipeInstructions": [{"@type": "HowToStep", "text": ""}]
```

One site's `__NEXT_DATA__` or JSON-LD being useful is not evidence that
a generic "read the embedded JSON" path will work anywhere else. That
generalisation has already been tried and falsified.

## 2. Decide the output shape

Two kinds of extractor, and the choice is not about the genre:

> **Reconstruct when the site imposes a fixed structure on its authors.
> Follow the source when the body is written into an open frame.**

- **Rigid site** — authors fill in fields; the page is a rendering of a
  record, so re-rendering it loses nothing and reordering recovers an
  order the page flattened. Use or add a shape in `extractors/shapes/`.
- **Loose site** — the order is authorial and carries meaning. Convert
  the body faithfully, like `sites/zenn.py`.

A rigid site does not have to be a recipe (a product page, an event
listing, a paper abstract are equally rigid). A loose recipe blog gets
the article treatment — there is no record to recover and guessing at
one fabricates structure.

**When unsure, follow the source.** Preserving order loses nothing;
reconstruction invents.

If you add a new shape, keep it site-agnostic: **headings and labels
come from the page**, carried on the record. The site module supplies a
label only for something the page states without naming, because
knowing what language the site is written in is the site module's job.

## 3. Write the module

```python
class ExampleExtractor:
    def matches(self, url: str | None) -> bool:
        return host_matches(url, _HOSTNAMES)

    def extract(self, html: str, url: str) -> Optional[ExtractedArticle]:
        ...
```

Rules:

- **`extract` returns `None` rather than raising.** Site DOMs change
  without notice; a dead site path must degrade to the generic pipeline,
  not take Web Clip down. The dispatcher has a catch-all as a second
  layer, but do not lean on it.
- **Return `None` when the page is not the kind you handle.** Sites
  serve index and category pages under the same host. A record-shaped
  document with no rows is worse than generic output.
- Register in `extractors/__init__.py`. Keep hostnames disjoint.
- Use `host_matches` — never write your own hostname check, or
  `evil-example.com.attacker.test` will match.

### Shared or site-specific?

Put a repair in `preprocess.py` only when it fixes **a mechanism many
sites share** (a WordPress plugin, a lazy-load convention) and you have
seen it on more than one host. Anything narrower stays in the site
module. Burying a shared mechanism in one site guarantees rediscovering
the same bug on the next site.

Preprocessing runs **after** the registry loop, never before dispatch:
`sites/zenn` finds `__NEXT_DATA__` by raw string search, and
re-serialising the document ahead of it can re-escape script contents
and silently push Zenn pages onto the generic path.

## 4. Fixture and golden

One site is one module, one fixture and one test.

- **Prune the fixture** to what the parser reads. The raw page is
  100 KB+ of navigation and ads, and it is someone else's copyrighted
  content. Keep one representative item, one of each structural variant
  you handle, and enough of the tail to prove the cut-off works.
- **Keep the fixture internally consistent.** If you prune the DOM, prune
  the embedded JSON to match. A fixture whose JSON-LD lists eleven rows
  while its DOM has five reads as a bug to every later reviewer.
- **One fixture per layout generation.**
- **The golden is not a recording of current output.** Check it by hand
  against what the page actually says before saving it, then let the
  test pin it.

## 5. Traps

Every one of these has been hit in this codebase.

- **Mutating a tree while `doc.iter()` walks it truncates the walk.**
  Removing a sibling mid-iteration silently skips everything after the
  first removal. Materialise first: `for el in list(doc.iter(...))`.
  A single-element fixture cannot catch this — **use at least two**.
- **`etree.Element` vs `lhtml.Element`.** Elements moved into a tree
  built by the plain `etree` factory lose their HTML element class, and
  with it `text_content()`. Use `lxml.html`'s factory throughout.
- **Blank lines between images are meaningful.** Litloft's preview lays
  consecutive image lines out as columns; a blank line stacks them
  instead. Images in one section belong on adjacent lines.
- **A URL you write straight into Markdown skips the sanitizer.** The
  bleach protocol allowlist only guards what passes through
  `sanitize_html`. A hero image or link taken from JSON-LD and formatted
  by a renderer must be checked for `http(s)` yourself — the fetched
  page is untrusted content.
- **JSON-LD fields are polymorphic.** `image` may be a string, a list or
  an `ImageObject`; a `Recipe` may sit inside an array or an `@graph`.
  Calling a string method on one raises into the catch-all and discards
  a page that otherwise parsed perfectly. Normalise, never assume.
- **Test edits that do not land.** `page.replace('"image": "..."', ...)`
  against a fixture whose JSON has no space after the colon replaces
  nothing, and the test then asserts against an unmodified page and
  passes vacuously. **Assert the edit landed** before testing its
  effect.
- **Stale bytecode in mounted runs.** Mounting `app/` over the image
  leaves root-owned `__pycache__` behind and you will debug a result the
  current code did not produce. Use
  `-e PYTHONDONTWRITEBYTECODE=1 ... python -B`, and treat a clean
  `docker build` as the authoritative run.

## 6. Verify

```bash
cd /Users/libre/Sources/video_share/addons/knowledge
docker build -f Dockerfile.test -t knowledge-test . && docker run --rm knowledge-test
```

Beyond green tests:

- Run the **full unpruned real pages** (every layout generation) through
  `extract_article` and read the output.
- Mutation-check the tests that matter. Emptying `REGISTRY` must fail
  your new tests — otherwise they are passing through the generic
  fallback and prove nothing.
- Existing site tests must pass unmodified.

Then `codex review --uncommitted`, per `~/.claude/CLAUDE.md`. Save
design-relevant findings to hako.

## 7. Land it

1. Branch, commit and PR **inside `addons/knowledge`**.
2. After merge, in the core repo: `git -C addons/knowledge checkout main
   && git -C addons/knowledge merge --ff-only origin/main`, then
   `git add addons/knowledge` and commit the gitlink on its own branch.
   A squash merge means `--ff-only` from your feature branch will not
   work; fast-forward `main` to `origin/main` instead and confirm the
   squashed tree matches with `git diff --quiet <branch> main`.
3. Skipping step 2 leaves a fresh clone pairing current core with the
   old addon.
4. The knowledge container has **no source mount**, so nothing takes
   effect until `docker compose up -d --build knowledge`.

## Related

- `.claude/rules/design-decisions.md` — addon boundaries, Web Clip trust
  tier (clips land unverified; there are no exceptions)
- `.claude/rules/backend-conventions.md` — why a language's vocabulary
  must not stand in for a concept. Reading a label/value split the site
  provides is structural and fine; matching the label's text is not.
