# Invariants — setup token

Declared before the first review round (R-0).

1. With `data/setup_completed` absent, a config write carrying no token, or a
   wrong one, is refused and the file on disk is byte-identical afterwards.
   This holds for **every** write route under `/api/admin/config`, not only the
   four the wizard sends. **Revised after round 1 (finding 5): the enumeration
   missed `passwords/append` and `DELETE passwords/{index}`.**
2. With the sentinel absent, `POST /complete-setup` without a valid token is
   refused and no sentinel is written.
3. With the sentinel present, the token grants nothing: every config write still
   requires admin, and a caller holding only the token is refused.
4. The token never appears in an HTTP response body — not in `setup-status`, not
   in an error body, not in the verify endpoint's answer.
5. A wizard run that supplies the token completes exactly as it does today:
   the same writes, in the same order, with the same bodies — each carrying the
   token that was verified, not a value that differs from it.
6. `GET /setup-status` stays reachable with no token, and still returns `drives`
   only while the sentinel is absent.
7. An install that has already completed setup is unchanged by the upgrade: no
   token is minted, and nothing is logged — including when an unauthenticated
   caller asks `setup-token/verify` about one. **Revised after round 1
   (finding 1): the endpoint reached `matches()`, which mints on demand.**
8. `LITLOFT_SETUP_TOKEN` from the environment is used as given; a token is minted
   only when that variable is unset.
9. `configure.py` writes a token that the backend container actually receives,
   and the URL it prints carries that same token.

10. **Added after round 2 (finding 1).** Whether setup is complete is asked
    through `config.setup_completed_sentinel()` and nowhere else. Round 1's
    finding 1 was a call site that invented its own check and forgot to make
    one; round 2's was a detector that could not see call sites at all.

TOTAL: 10 invariants
