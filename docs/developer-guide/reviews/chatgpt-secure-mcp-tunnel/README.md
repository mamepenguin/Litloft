# ChatGPT Secure MCP Tunnel review

Two rounds reviewed the change against `invariants.md`.

- **r1**, on `75a39c7`: the implementation was correct, but three test gaps
  allowed registration, idempotency, or Ask disclosure mutations to survive.
  Fix commit `a3e4b7b` moved registration into an importable server factory and
  asserted the real `tools/list` result.
- **r2**, on `a3e4b7b`: every r1 mutation was killed. One remaining test-only
  gap accepted the opposite privacy claim when it preserved two keywords; the
  assertion now holds the complete transfer disclosure. The review found no
  repeated branch, state, or prediction patching.

Bucket A is empty. The last fix changes only the test assertion, so it does not
require another review round under `review-workflow.md`.
