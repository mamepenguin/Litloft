# Codex workflow

For development work, read `docs/process/principles.md`, `workflow.md`, `PROJECT.md`
and the process rules in `.claude/rules/process.md`. Read the other process documents
when their conditions apply. Follow the skips in `workflow.md`.

For new behavior, use the steps in `.claude/commands/spec.md` as a workflow, not as a
required slash command: research, draft the spec and ledger, arrange an independent
spec review, and obtain the human's explicit approval before implementation. Record the
approved hash and ledger state as prescribed. The author does not approve on the human's
behalf. Follow the independent acceptance-test writer's instructions in
`.claude/agents/acceptance-test-writer.md` and run the tests red before implementation.

Before review, arrange R-5 by someone other than the author when applicable, using
`.claude/agents/r5-runner.md`. Follow `.claude/commands/review.md` as a workflow: review a
fixed commit, run `scripts/process/review.sh`, present the complete triage and preserve
human decisions. The configured review engine remains unchanged.

When the current environment cannot provide a required independent reviewer, isolated
test writer, real environment, or required approval, report the limitation and stop at
that step. Do not claim independence or substitute the author's own check. Hooks and CI
are additional checks; they do not enforce every process instruction. See
`docs/process/limitations.md`.
