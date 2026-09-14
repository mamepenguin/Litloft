# media_import IME Enter guard invariants (R-0, approved by the supervisor 2026-09-14)

1. In the Composer URL field, an Enter within the grace window after `compositionend` does not start an import (0 requests). Nor does an `isComposing: true` / `keyCode 229` Enter.
2. In the Composer URL field, an Enter after the grace window starts one import.
3. In the Import from URL dialog's URL field, the same as 1 (no send on the confirming, composing or 229 Enter).
4. In the Import from URL dialog's URL field, an Enter after the grace window sends once. Pressing Enter repeatedly while it is pending still sends once.
5. Everything else about input (typing resets needsSubscription, Escape closes the dialog, and so on) is unchanged.
