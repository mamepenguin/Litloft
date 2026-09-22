# Invariants — #343, the captions choice

Declared before the first reviewer was launched, and the list r1 was briefed
with.

1. A viewer who explicitly turned captions off does not get them back while
   watching that file — not when the detail answer lands, not after a rename,
   not after a title edit. **Revised after r1: while Litloft draws the
   controls.** See below.
2. A viewer who has never chosen keeps each backend's own default: native
   honours `<track default>`, YouTube stays off through `cc_load_policy`.
   Nothing is asserted for them.
3. Pressing the switch in the settings sheet always reaches the player,
   including when the value pressed for equals the one already stored.
4. The switch's drawn state keeps coming from the player, not from the stored
   preference.
5. A track chosen in the subtitle track picker stays chosen; turning captions
   off and on again does not silently move to another track.
6. A file with subtitle tracks does not lose them because of a metadata edit.
7. Playback position and watch history are untouched by any of this.

## Revision, after r1

**1 names the control surface.** r1 measured the unqualified sentence false
under the browser's own controls: captions off, hand the frame over, the detail
answer lands, and the new track shows. It reproduces identically on the parent
commit, so it is not this change's doing — the change enforces the choice on
one surface rather than none.

Qualified rather than closed, on the user's decision: the rule is that the
surface which records the viewer's choice is the surface that enforces it, and
the browser's captions menu never writes `captionsPreferred`. Asserting a
stored preference there would undo a choice made in that menu. The gap is in
`known-issues.md`.

The two additions r1 proposed — that nothing outlive the player, and that a
press leave the YouTube controller with exactly one reassert interval — were
declined for this change. Both hold today; neither is tested.
