# Invariants — /setup Protected saves a password

Declared before the first review round (R-0).

1. Finishing `/setup` with Protected chosen leaves a `passwords.json` holding
   the typed password, and that password's groups carry `__admin__`.
2. After that, `/admin` is reachable only by a viewer who unlocked with a
   password carrying `__admin__`.
3. A config write the backend rejects stops the wizard: no later config write
   is sent, `complete-setup` is not called, `setup_completed` is not written,
   and the rejection's own message is on screen.
4. A group naming no drive and not the sentinel is still rejected as
   `unknown_group`, by both `PUT /passwords` and `POST /passwords/append`.
5. A failed unlock at the end of the wizard does not undo or repeat the
   password write, and does not stop setup from completing.
6. Public mode writes no password entry at all.

TOTAL: 6 invariants
