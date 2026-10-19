# knowledge #48 invariants (R-0, approved by the supervisor 2026-09-14)

1. While focus is in an input (any type, including the search field and the depth slider), textarea, select or contenteditable, pressing `+`, `=` or `-` does not change the graph's zoom, and the character goes into the field.
2. While no editing element has focus, `+` / `=` zoom in and `-` zooms out, as before.
3. Graph selection clearing (Escape, `knowledge-graph-selection`) is unchanged: with a node selected, Escape clears it even while the search field has focus (editingOnly: false).
4. Non-key zoom paths (zoom buttons, wheel, pinch) are unchanged.
5. After the graph unmounts, `+` / `-` do nothing on any screen (no registration left behind).
6. What the `?` shortcut cheat sheet lists is unchanged.

Accepted behaviour change: Cmd/Ctrl with `-` / `=` no longer zooms the graph along with the browser.
