# Exceptions

A record of each time a rule of this process was bypassed and could not be reverted, for
example a push made with `--no-verify`. One entry per bypass, newest last. An entry says
what was bypassed, why, and who decided.

Fields of an entry:

- Date: when it happened (YYYY-MM-DD).
- Bypassed: the check or rule, and the commit or push involved.
- Why: the reason, in one or two sentences.
- Who: the person or agent that did it, and the human who knows.

<!--
Example entry:

## 2026-01-15

- Date: 2026-01-15
- Bypassed: pre-push hook (`git push --no-verify`), branch fix/typo, commit abc1234
- Why: the hook failed on a gate that was broken on main; the fix landed in the next commit.
- Who: the implementing agent, reported to the repository owner.
-->

## 2026-11-15

- Date: 2026-11-15
- Bypassed: pre-push hook (`git push --no-verify`), branch chore/renumber-drive-hide-entries-114, commit 19cdbc0b7 and the commit that records this entry
- Why: the frontend gate fails on origin/develop itself with the same 9 test files and 21 tests (checked on a clean worktree of origin/develop). The change renames spec IDs and touches none of them, so it cannot cause the failure, and the gate cannot pass until that failure is fixed separately.
- Who: the implementing agent, with the repository owner's approval given in the session.
