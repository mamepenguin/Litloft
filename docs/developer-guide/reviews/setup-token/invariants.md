# Invariants — setup token

Declared before the first review round (R-0).

1. With `data/setup_completed` absent, a config write carrying no token, or a
   wrong one, is refused and the file on disk is byte-identical afterwards.
   This holds for drives, passwords and addon policy.
2. With the sentinel absent, `POST /complete-setup` without a valid token is
   refused and no sentinel is written.
3. With the sentinel present, the token grants nothing: every config write still
   requires admin, and a caller holding only the token is refused.
4. The token never appears in an HTTP response body — not in `setup-status`, not
   in an error body, not in the verify endpoint's answer.
5. A wizard run that supplies the token completes exactly as it does today:
   the same writes, in the same order, with the same bodies.
6. `GET /setup-status` stays reachable with no token, and still returns `drives`
   only while the sentinel is absent.
7. An install that has already completed setup is unchanged by the upgrade: no
   token is minted, and nothing is logged.
8. `LITLOFT_SETUP_TOKEN` from the environment is used as given; a token is minted
   only when that variable is unset.
9. `configure.py` writes a token that the backend container actually receives,
   and the URL it prints carries that same token.

TOTAL: 9 invariants
