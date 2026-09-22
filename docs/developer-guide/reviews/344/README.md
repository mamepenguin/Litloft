# PR #344 — marking a quote that crosses elements

Two rounds. `invariants.md` is the list each round was briefed with, including
the revision the supervisor approved after round 2.

Round 1 reviewed `57f3f03d` and found the implementation correct: 800
randomised DOM shapes lost no character and produced no empty or discontiguous
mark. Its nine findings were about the tests — five guards the change added
were held by nothing, and one of the new tests derived its expected value from
the observation and so could not fail. It also found the visual defect that
became invariant 8.

Round 2 reviewed the fix commit `83c3b86c` on its own and answered the
trajectory question: both rounds' fixes added a prediction about how many
elements one passage becomes — round 1 gave the scroll anchor a count, round 2
gave the drawing one. The supervisor ruled it was not a C: the alternative
named in the design material (the CSS Custom Highlight API) carries no such
prediction but is invisible to jsdom, which would trade a measurable design for
an unmeasurable one. Round 2's five findings were again tests, including one
that mattered: the seam fix was measured only inside a `pre`, where the rule
that zeroes horizontal padding made half of it inert.

Read the code for what the system does now. These files quote it as it stood at
the SHA each round reviewed.
