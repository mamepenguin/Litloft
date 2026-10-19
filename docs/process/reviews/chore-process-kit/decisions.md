# Decisions

decision: ship (r1, HUMAN_REVIEW_REQUIRED for protected paths; stated by the user)
ran_in_app: not-applicable
by: author
evidence: no user-visible app behaviour changes. The tooling was exercised instead: precheck --profile local (frontend gate skipped, secret-scan pass), check-traceability ok, update.sh --status clean, and review.sh produced r1.
