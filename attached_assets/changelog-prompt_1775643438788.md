# Changelog Prompt for Replit Agents

Add this instruction to your project's `replit.md` under User Preferences to enforce changelog discipline across any project.

---

## Instruction for replit.md

Paste the following into your `replit.md`:

```
- **CHANGELOG.md**: Every single change — bug fix, feature, config update, refactor, dependency change — MUST be logged in `CHANGELOG.md` at the project root. Entries are grouped by date and category. This is non-negotiable; no change should be made without a corresponding changelog entry.
```

---

## CHANGELOG.md Starter Template

Create `CHANGELOG.md` in the project root with this content:

```markdown
# Changelog

All notable changes to this project are documented here.
Format: `[YYYY-MM-DD] Category — Description`

---
```

---

## Formatting Rules

1. **Group by date** — Use `## YYYY-MM-DD` headers. Most recent date first.
2. **Group by category** — Use `### Category Name` under each date. Use whatever categories fit your project (e.g., Backend, Frontend, Database, API, Infrastructure, UI, Auth, DevOps, Config, etc.).
3. **Bold the title** — Each entry starts with `- **Short descriptive title**:` followed by the details.
4. **Be specific** — Include actual values, not vague descriptions. Say "increased timeout from 30s to 120s" not "increased timeout." Say "added index on `users(email)`" not "added database index."
5. **Explain the why** — Don't just say what changed. Say why it was changed. "Login was failing for users with special characters in passwords" is better than "fixed login bug."
6. **Reference previous state** — Use "(was X)" or "previously Y" so the reader understands the before and after.
7. **Flag breaking/critical changes** — Prefix with `**BREAKING:**` or `**CRITICAL:**` for changes that significantly alter behavior or fix severe issues.
8. **One entry per logical change** — Don't combine unrelated changes into one bullet. Each distinct change gets its own entry.

---

## Example Entries

```markdown
## 2025-06-15

### Backend
- **Rate limiting on auth endpoints**: Added 5 requests/minute rate limit to `/api/login` and `/api/register`. Previously unlimited, which allowed brute-force attempts.
- **CRITICAL FIX: Session expiry not enforced**: Sessions were persisting indefinitely due to missing TTL check in middleware. Now expires after 24 hours (configurable via `SESSION_TTL_HOURS` env var).

### Frontend
- **Dark mode toggle**: Added theme toggle to settings page. Defaults to system preference. Persists choice in localStorage.
- **Mobile nav**: Hamburger menu now closes after selecting a link (was staying open, blocking content).

### Database
- **New index**: Added `users_email_idx` on `users(email)` to speed up login lookups. Query time reduced from ~200ms to ~5ms on 50K rows.
- **Archive old records**: Orders older than 90 days are now moved to `orders_archive` hourly (was never archived, table had 2M+ rows).

### Infrastructure
- **Health check endpoint**: Added `GET /health` returning `{ status: "ok", uptime, version }` for monitoring.
- **Env variable rename**: `DB_URL` renamed to `DATABASE_URL` for consistency with deployment platform. **BREAKING:** Update your `.env` file.
```
