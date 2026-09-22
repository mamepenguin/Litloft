# PR #345 — opening, numbering and colouring source files

Two rounds. `invariants.md` is the list each round was briefed with, including
the revision the supervisor approved after round 1.

Round 1 ran two reviewers in parallel on `3411c56c`, briefed on different
axes so they would not return the same shape of finding: one on the line
splitter and the language table, one on the boundaries the change crosses —
the markup sink, the citation search, the capture basket, and whether the
tests could fail.

They agreed on one defect, found independently: a file broken with bare CR
came out as one line on the uncoloured path and many on the coloured one,
because the coloured path goes through an HTML parse that folds CR itself.

Each found one the other did not. The size limit was not a time limit:
several grammars are quadratic in an unbroken alphanumeric run, and 400K of
bare base64 under `ini` took twelve minutes on the main thread, well inside
the limit. And the gutter was too narrow for a three-digit number, which
wrapped inside its own box and made every line from 100 onward two rows tall
— the user hit that one first, by opening a 1206-line file.

That second defect is why `invariants.md` has a revision. The twelve declared
invariants were all on one axis, what is *in* the block's text, which was the
right axis for the risk the change carried and on which the change was clean.
But the change's purpose was to draw something new beside the text, and
nothing in the list said anything about what is drawn. The one region the
change added was the only region with no invariant over it.

Round 2 reviewed the fix commit alone and answered the trajectory question:
the CR fold *removes* a branch rather than adding one, and the gutter's five
declarations are one mechanism rather than five patches — but the limits in
`decorate` are a second answer to the same question, and the second is also
short. A file passing every limit still costs about twenty seconds. That is
recorded in `known-issues.md` rather than answered with a fourth guard.

Round 2 also found that the fold reached two render paths of three, that the
test written for the new invariant allowed a range wide enough to pass the
violation it was written for, and that nothing at all held the CRLF invariant.

Read the code for what the system does now. These files quote it as it stood
at the SHA each round reviewed.
