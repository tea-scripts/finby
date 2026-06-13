-- ============================================================
-- FINBY — Reset User Data (clean slate for demos / re-testing)
-- ============================================================
-- WHAT THIS DOES
--   Wipes all financial ACTIVITY for the workspaces a given user OWNS,
--   while preserving their identity, configuration, and billing:
--
--   DELETED  : transactions, budgets, conversations + messages,
--              alerts, portfolio holdings + investment events,
--              FX rate snapshots, and CUSTOM categories.
--   RESET    : account balances -> 0, spending streak counters -> 0.
--   PRESERVED: User row (email, name, password, preferences),
--              Workspace, WorkspaceMember, Subscription (your Pro plan),
--              default (system-seeded) categories, the accounts themselves,
--              refresh tokens / sessions, push subscriptions, feedback.
--
-- SCOPE
--   Only workspaces where the target user is the OWNER are touched.
--   Workspaces you were merely invited to (e.g. someone's Family plan)
--   are left completely untouched.
--
-- USAGE
--   1. Set the email below (or pass -v target_email=... on the CLI).
--   2. Run against the API database, e.g.:
--        psql "$DIRECT_DATABASE_URL" -f apps/api/prisma/scripts/reset-user-data.sql
--      or override the email inline:
--        psql "$DIRECT_DATABASE_URL" \
--          -v target_email="timmieprince@gmail.com" \
--          -f apps/api/prisma/scripts/reset-user-data.sql
--
--   The whole thing runs in ONE transaction. If anything fails (or no
--   owned workspace is found) it ROLLS BACK and changes nothing.
-- ============================================================

-- Default email (used only if -v target_email=... is not supplied).
\if :{?target_email}
\else
  \set target_email 'timmieprince@gmail.com'
\endif

\set ON_ERROR_STOP on

BEGIN;

-- Resolve the workspaces the user OWNS into a temp table so every step
-- shares the exact same target set.
CREATE TEMP TABLE _target_workspaces ON COMMIT DROP AS
SELECT w.id
FROM workspaces w
JOIN workspace_members wm ON wm."workspaceId" = w.id
JOIN users u            ON u.id = wm."userId"
WHERE lower(u.email) = lower(:'target_email')
  AND wm.role = 'OWNER';

-- Abort loudly if the email matched no owned workspace (typo guard).
DO $$
BEGIN
  IF (SELECT count(*) FROM _target_workspaces) = 0 THEN
    RAISE EXCEPTION 'No OWNED workspace found for the given email — nothing to do, rolling back.';
  END IF;
  RAISE NOTICE 'Targeting % owned workspace(s).', (SELECT count(*) FROM _target_workspaces);
END $$;

-- ------------------------------------------------------------
-- DELETE financial activity (children first to respect FKs)
-- ------------------------------------------------------------

-- Portfolio: events are children of holdings.
DELETE FROM investment_events
WHERE "holdingId" IN (
  SELECT id FROM portfolio_holdings
  WHERE "workspaceId" IN (SELECT id FROM _target_workspaces)
);

DELETE FROM portfolio_holdings
WHERE "workspaceId" IN (SELECT id FROM _target_workspaces);

-- Chat: messages are children of conversations.
DELETE FROM conversation_messages
WHERE "conversationId" IN (
  SELECT id FROM conversations
  WHERE "workspaceId" IN (SELECT id FROM _target_workspaces)
);

DELETE FROM conversations
WHERE "workspaceId" IN (SELECT id FROM _target_workspaces);

-- Transactions (must go before custom categories / account resets).
DELETE FROM transactions
WHERE "workspaceId" IN (SELECT id FROM _target_workspaces);

-- Budgets (reference categories; delete before pruning custom categories).
DELETE FROM budgets
WHERE "workspaceId" IN (SELECT id FROM _target_workspaces);

-- Alerts.
DELETE FROM alerts
WHERE "workspaceId" IN (SELECT id FROM _target_workspaces);

-- Cached FX snapshots (regenerated on demand).
DELETE FROM fx_rate_snapshots
WHERE "workspaceId" IN (SELECT id FROM _target_workspaces);

-- Custom categories only — keep system-seeded defaults.
DELETE FROM categories
WHERE "workspaceId" IN (SELECT id FROM _target_workspaces)
  AND "isDefault" = false;

-- ------------------------------------------------------------
-- RESET materialized/ledger state that is now stale
-- ------------------------------------------------------------

-- Account balances back to zero (ledger was cleared above).
UPDATE accounts
SET balance = 0, "updatedAt" = now()
WHERE "workspaceId" IN (SELECT id FROM _target_workspaces);

-- Spending streak counters on the user.
UPDATE users
SET "currentStreak" = 0,
    "longestStreak" = 0,
    "lastStreakDate" = NULL,
    "updatedAt" = now()
WHERE lower(email) = lower(:'target_email');

-- ------------------------------------------------------------
-- Post-run summary (what remains)
-- ------------------------------------------------------------
SELECT
  (SELECT count(*) FROM transactions      WHERE "workspaceId" IN (SELECT id FROM _target_workspaces)) AS transactions_left,
  (SELECT count(*) FROM budgets           WHERE "workspaceId" IN (SELECT id FROM _target_workspaces)) AS budgets_left,
  (SELECT count(*) FROM conversations     WHERE "workspaceId" IN (SELECT id FROM _target_workspaces)) AS conversations_left,
  (SELECT count(*) FROM alerts            WHERE "workspaceId" IN (SELECT id FROM _target_workspaces)) AS alerts_left,
  (SELECT count(*) FROM portfolio_holdings WHERE "workspaceId" IN (SELECT id FROM _target_workspaces)) AS holdings_left,
  (SELECT count(*) FROM categories        WHERE "workspaceId" IN (SELECT id FROM _target_workspaces)) AS categories_left,
  (SELECT count(*) FROM accounts          WHERE "workspaceId" IN (SELECT id FROM _target_workspaces)) AS accounts_kept;

COMMIT;
