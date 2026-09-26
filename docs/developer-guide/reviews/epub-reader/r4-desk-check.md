# Round 4, task 3: text/html sections, checked by reading

Reviewed at `a0f0bb38e`. The dynamic check (running a public sanitizer test
corpus through the reader with the CSP removed) was stopped twice by a safety
classifier and then dropped by the user in favour of this reading.

## The difference in question

The sanitizer parses an HTML-fallback section with `DOMParser`, whose documents
have scripting disabled; the browser parses the served `text/html` blob with
scripting enabled. In the HTML parsing algorithm the scripting flag changes one
thing: whether `<noscript>` content is raw text or markup (in head and in
body). Nothing else in tokenization or tree construction reads it.

## Why the difference cannot reach the output

- `noscript` is in the sanitizer's drop set and is removed with its content, so
  the tree that is serialized holds none.
- The output is produced by the HTML serializer from that tree. Element names
  come only from the allowlists; text is escaped (`<` as `&lt;`); attribute
  values are escaped; comment data from the HTML parser cannot contain a comment
  terminator. So the serialized text contains no `<noscript` start tag for the
  scripting-enabled parse to treat differently.
- Every other construct (foreign content and integration points, rawtext
  elements, table foster-parenting, `select`) is parsed identically under both
  flags. For those, the convergence pass is the check: it re-parses the output
  as `text/html` and refuses the section if sanitizing again changes anything.
- Most HTML-fallback sections never take this path: foliate has already
  serialized its own HTML fallback as XML, so the sanitizer receives
  well-formed XML and serves XHTML. `text/html` is served only when that text
  still fails as XML (control characters, an element named `parsererror`).

## Backstop

Independently of the sanitizer, the section document inherits the reader's
CSP: no inline script, no event handler, no eval, scripts only from
`/epub-reader/`. Round-1 and later e2e hold that the CSP alone stops every
script route in the hostile book in Chromium and WebKit.

## Not covered

No corpus of known sanitizer bypasses was run against the reader. The claim
above rests on the parsing specification and on the code at this SHA.
