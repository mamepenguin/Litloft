# Decisions

decision:
ran_in_app: not-applicable
at: ac703453d96e4db2357c384777d4d2da70388299
by: agent
evidence: git diff origin/develop...HEAD touches only process/reviewers.conf (one added row: claude-deep | claude | read | CRITICAL | scope,submodules,persistence,concurrency). The only code that reads reviewers.conf is scripts/process/review.sh; no backend, frontend, mcp-server, iOS, addon, Dockerfile or docker-compose file references process/, so the file is not part of any built image or runtime. The change adds a reviewer to /review for CRITICAL-risk changes and cannot alter anything a Litloft user observes. The application was not started.
pending: none
