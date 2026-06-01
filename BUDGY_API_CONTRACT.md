# Budgy — API Contract
Version: 1.0.0 | Derived from PRD v1.0 (LOCKED) + Schema v1.0.0
Status: DRAFT — Pending founder review

---

## Conventions

- All endpoints are prefixed `/api/v1`
- All requests/responses are `application/json`
- Authentication: `Authorization: Bearer <access_token>` (JWT, 15min TTL)
- All timestamps: ISO 8601 UTC strings (`2026-06-02T10:30:00.000Z`)
- All monetary amounts: strings (not floats) to prevent floating-point precision loss (`"2200.00"`)
- All currency codes: ISO 4217 uppercase strings (`"USD"`, `"PHP"`, `"NGN"`)
- Pagination: cursor-based via `cursor` + `limit` query params (no offset pagination)
- Error shape is consistent across all endpoints (see Error Responses section)
- Tier enforcement happens in a NestJS `TierGuard` — not scattered in service logic

---

## Error Responses

Every error follows this shape:

```json
{
  "statusCode": 400,
  "error": "BAD_REQUEST",
  "message": "Human-readable description",
  "details": {}
}
```

Standard error codes used:

| Code | HTTP Status | Meaning |
|---|---|---|
| `UNAUTHORIZED` | 401 | Missing or invalid JWT |
| `FORBIDDEN` | 403 | Authenticated but not permitted (wrong role, wrong tier) |
| `NOT_FOUND` | 404 | Resource does not exist or not in user's workspace |
| `CONFLICT` | 409 | Duplicate resource (e.g. category name already exists) |
| `UNPROCESSABLE` | 422 | Validation error on request body |
| `TIER_LIMIT` | 403 | Action blocked by subscription tier |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL` | 500 | Unexpected server error |

---

## Auth Module

### POST `/api/v1/auth/register`

Creates a new User and a solo Workspace for them. Seeds default categories.

**Request:**
```json
{
  "displayName": "Aisha Bello",
  "email": "aisha@example.com",
  "password": "SuperSecret123!",
  "baseCurrency": "USD",
  "timezone": "Asia/Manila"
}
```

**Response `201`:**
```json
{
  "user": {
    "id": "cuid",
    "displayName": "Aisha Bello",
    "email": "aisha@example.com",
    "emailVerified": false,
    "timezone": "Asia/Manila"
  },
  "workspace": {
    "id": "cuid",
    "name": "Aisha's Finances",
    "slug": "aisha-finances-xxxx",
    "tier": "FREE",
    "baseCurrency": "USD"
  },
  "accessToken": "eyJ...",
  "refreshToken": "eyJ..."
}
```

---

### POST `/api/v1/auth/login`

**Request:**
```json
{
  "email": "aisha@example.com",
  "password": "SuperSecret123!"
}
```

**Response `200`:**
```json
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "user": { "id": "cuid", "displayName": "Aisha Bello", "email": "...", "timezone": "..." },
  "workspace": { "id": "cuid", "name": "...", "tier": "FREE", "baseCurrency": "USD" }
}
```

---

### POST `/api/v1/auth/refresh`

Rotates refresh token. Old token is revoked on use.

**Request:**
```json
{ "refreshToken": "eyJ..." }
```

**Response `200`:**
```json
{ "accessToken": "eyJ...", "refreshToken": "eyJ..." }
```

---

### POST `/api/v1/auth/logout`

Revokes the supplied refresh token.

**Request:**
```json
{ "refreshToken": "eyJ..." }
```

**Response `204`:** No body.

---

### POST `/api/v1/auth/forgot-password`

**Request:** `{ "email": "aisha@example.com" }`
**Response `200`:** `{ "message": "If that email exists, a reset link has been sent." }`

> Always return 200 regardless of whether email exists — prevents user enumeration.

---

### POST `/api/v1/auth/reset-password`

**Request:**
```json
{ "token": "reset-token-from-email", "newPassword": "NewSecret456!" }
```
**Response `200`:** `{ "message": "Password updated successfully." }`

---

## User Module

### GET `/api/v1/users/me`

Returns the authenticated user's profile and their workspace memberships.

**Response `200`:**
```json
{
  "id": "cuid",
  "displayName": "Aisha Bello",
  "email": "aisha@example.com",
  "emailVerified": true,
  "timezone": "Asia/Manila",
  "avatarUrl": null,
  "workspaces": [
    {
      "workspaceId": "cuid",
      "workspaceName": "Aisha's Finances",
      "role": "OWNER",
      "tier": "FREE",
      "baseCurrency": "USD"
    }
  ]
}
```

---

### PATCH `/api/v1/users/me`

**Request (all fields optional):**
```json
{
  "displayName": "Aisha B.",
  "timezone": "Africa/Lagos",
  "avatarUrl": "https://..."
}
```
**Response `200`:** Updated user object (same shape as GET /me).

---

### PATCH `/api/v1/users/me/password`

**Request:**
```json
{ "currentPassword": "...", "newPassword": "..." }
```
**Response `200`:** `{ "message": "Password updated." }`

---

## Workspace Module

### GET `/api/v1/workspaces/:workspaceId`

Returns workspace details. Requester must be a member.

**Response `200`:**
```json
{
  "id": "cuid",
  "name": "Aisha's Finances",
  "slug": "aisha-finances-xxxx",
  "tier": "FREE",
  "baseCurrency": "USD",
  "maxMembers": 1,
  "memberCount": 1
}
```

---

### PATCH `/api/v1/workspaces/:workspaceId`

OWNER only.

**Request (all fields optional):**
```json
{ "name": "Aisha & Marco's Finances", "baseCurrency": "USD" }
```

> Changing `baseCurrency` does NOT retroactively alter stored `amountBase` on transactions. It only affects future transactions. The API must warn the caller of this via a `warning` field in the response.

**Response `200`:**
```json
{
  "workspace": { "...updated fields..." },
  "warning": "Base currency changed. Historical transactions retain their original base currency conversion. Only future transactions will use USD."
}
```

---

### GET `/api/v1/workspaces/:workspaceId/members`

**Response `200`:**
```json
{
  "members": [
    {
      "userId": "cuid",
      "displayName": "Aisha Bello",
      "email": "aisha@example.com",
      "role": "OWNER",
      "joinedAt": "2026-06-01T00:00:00.000Z"
    }
  ]
}
```

---

### POST `/api/v1/workspaces/:workspaceId/members/invite`

OWNER only. Family tier required for inviting beyond 1 member.

**Request:**
```json
{ "email": "marco@example.com", "role": "CO_MANAGER" }
```

**Response `201`:**
```json
{ "message": "Invite sent to marco@example.com.", "inviteToken": "opaque-token" }
```

**Error if not Family tier:** `TIER_LIMIT` — "Inviting members requires the Family plan."

---

### POST `/api/v1/workspaces/:workspaceId/members/accept-invite`

**Request:** `{ "inviteToken": "opaque-token" }`
**Response `200`:** Workspace + membership object.

---

### PATCH `/api/v1/workspaces/:workspaceId/members/:userId`

OWNER only. Change a member's role.

**Request:** `{ "role": "VIEWER" }`
**Response `200`:** Updated member object.

---

### DELETE `/api/v1/workspaces/:workspaceId/members/:userId`

OWNER only. Remove a member. Cannot remove self (use leave endpoint).

**Response `204`:** No body.

---

## Accounts Module

### GET `/api/v1/workspaces/:workspaceId/accounts`

**Response `200`:**
```json
{
  "accounts": [
    {
      "id": "cuid",
      "name": "BDO Peso Savings",
      "currency": "PHP",
      "accountType": "BANK",
      "balance": "45200.00",
      "color": "#1A7A4A",
      "icon": "bank",
      "isArchived": false
    }
  ]
}
```

---

### POST `/api/v1/workspaces/:workspaceId/accounts`

**Request:**
```json
{
  "name": "Wise USD",
  "currency": "USD",
  "accountType": "EWALLET",
  "initialBalance": "1200.00",
  "color": "#4A90D9",
  "icon": "wallet"
}
```
**Response `201`:** Created account object.

---

### PATCH `/api/v1/workspaces/:workspaceId/accounts/:accountId`

**Request (all fields optional):** name, color, icon, isArchived.
**Response `200`:** Updated account object.

> Balance is never directly editable via this endpoint. It is managed by the transaction ledger only.

---

## Categories Module

### GET `/api/v1/workspaces/:workspaceId/categories`

**Response `200`:**
```json
{
  "categories": [
    { "id": "cuid", "name": "Groceries", "color": "#...", "icon": "cart", "isDefault": true, "isArchived": false }
  ]
}
```

---

### POST `/api/v1/workspaces/:workspaceId/categories`

Free tier: max 5 custom (non-default) categories. Enforced by `TierGuard`.

**Request:** `{ "name": "Side Hustle", "color": "#...", "icon": "briefcase" }`
**Response `201`:** Created category object.

**Error if Free tier at limit:** `TIER_LIMIT` — "Free plan supports up to 5 custom categories. Upgrade to Pro for unlimited."

---

### PATCH `/api/v1/workspaces/:workspaceId/categories/:categoryId`

Cannot edit `isDefault` categories' names. Can archive them.

**Response `200`:** Updated category.

---

## Transactions Module

### GET `/api/v1/workspaces/:workspaceId/transactions`

Cursor-based pagination. Supports filtering.

**Query params:**
- `cursor` — cuid of last seen transaction
- `limit` — default 20, max 50
- `type` — `EXPENSE | INCOME | TRANSFER | INVESTMENT`
- `categoryId` — filter by category
- `fromDate` / `toDate` — ISO 8601 date range
- `currency` — filter by original currency
- `search` — full-text search on merchant + description

**Response `200`:**
```json
{
  "transactions": [
    {
      "id": "cuid",
      "type": "EXPENSE",
      "status": "CONFIRMED",
      "amountOriginal": "2200.00",
      "currencyOriginal": "PHP",
      "amountBase": "38.42",
      "currencyBase": "USD",
      "fxRateUsed": "57.26",
      "merchant": "SM Supermarket",
      "description": "Weekly groceries",
      "category": { "id": "cuid", "name": "Groceries" },
      "account": { "id": "cuid", "name": "BDO Peso Savings" },
      "transactionDate": "2026-06-01T00:00:00.000Z",
      "tags": [],
      "aiConfidence": 0.95,
      "loggedByUserId": "cuid",
      "createdAt": "2026-06-01T10:23:00.000Z"
    }
  ],
  "nextCursor": "cuid-of-last-item",
  "hasMore": true
}
```

**Note on history limits:** Free tier: 3 months max. Enforced in the query layer — `fromDate` is capped at `now() - 90 days` for FREE workspaces.

---

### POST `/api/v1/workspaces/:workspaceId/transactions`

Manual entry fallback. Same validation as AI tool-created transactions.

**Request:**
```json
{
  "type": "EXPENSE",
  "amountOriginal": "2200.00",
  "currencyOriginal": "PHP",
  "categoryId": "cuid",
  "accountId": "cuid",
  "merchant": "SM Supermarket",
  "description": "Weekly groceries",
  "transactionDate": "2026-06-01",
  "tags": ["weekly-shop"]
}
```

**Response `201`:** Created transaction object (includes computed `amountBase`, `fxRateUsed`).

> The API fetches the current FX rate from Redis cache (or Frankfurter if cache miss) and computes `amountBase` server-side. The client never sends `amountBase`.

---

### PATCH `/api/v1/workspaces/:workspaceId/transactions/:transactionId`

Editable fields: `categoryId`, `merchant`, `description`, `transactionDate`, `tags`, `status`.

> `amountOriginal` and `currencyOriginal` are NOT editable after creation. Void and re-log instead. This preserves the audit trail.

**Response `200`:** Updated transaction.

---

### DELETE `/api/v1/workspaces/:workspaceId/transactions/:transactionId`

Soft-delete: sets `status = VOID`. Never hard-deletes. Reverses account balance and budget spend atomically.

**Response `200`:** `{ "message": "Transaction voided." }`

---

## Budgets Module

### GET `/api/v1/workspaces/:workspaceId/budgets`

**Query params:** `periodStart` (ISO date, defaults to current month start)

**Response `200`:**
```json
{
  "budgets": [
    {
      "id": "cuid",
      "category": { "id": "cuid", "name": "Groceries" },
      "amountLimit": "15000.00",
      "amountSpent": "9800.00",
      "currency": "USD",
      "utilizationPercent": 65.3,
      "period": "MONTHLY",
      "periodStart": "2026-06-01T00:00:00.000Z",
      "periodEnd": "2026-06-30T23:59:59.999Z",
      "isActive": true
    }
  ]
}
```

---

### POST `/api/v1/workspaces/:workspaceId/budgets`

**Request:**
```json
{
  "categoryId": "cuid",
  "amountLimit": "15000.00",
  "period": "MONTHLY",
  "periodStart": "2026-06-01"
}
```
**Response `201`:** Created budget object.

---

### PATCH `/api/v1/workspaces/:workspaceId/budgets/:budgetId`

Editable: `amountLimit`, `isActive`.
**Response `200`:** Updated budget.

---

## Portfolio Module

### GET `/api/v1/workspaces/:workspaceId/portfolio`

Pro tier required. Free tier returns `TIER_LIMIT`.

**Response `200`:**
```json
{
  "holdings": [
    {
      "id": "cuid",
      "ticker": "AAPL",
      "name": "Apple Inc.",
      "exchange": "NASDAQ",
      "quantity": "10",
      "avgCostBasis": "178.50",
      "costCurrency": "USD",
      "currentPrice": "191.20",
      "currentValue": "1912.00",
      "gainLossAmount": "127.00",
      "gainLossPercent": 7.12,
      "marketDataTimestamp": "2026-06-02T14:00:00.000Z",
      "isActive": true
    }
  ],
  "summary": {
    "totalCostBasis": "5400.00",
    "totalCurrentValue": "5930.00",
    "totalGainLoss": "530.00",
    "totalGainLossPercent": 9.81,
    "currency": "USD"
  }
}
```

---

### POST `/api/v1/workspaces/:workspaceId/portfolio/events`

Logs a buy/sell/dividend event. Updates holding quantity and avgCostBasis atomically.

**Request:**
```json
{
  "ticker": "AAPL",
  "action": "BUY",
  "quantity": "5",
  "pricePerUnit": "189.00",
  "currency": "USD",
  "eventDate": "2026-05-28",
  "notes": "Added to position on dip"
}
```
**Response `201`:** Updated holding + the event record.

---

### GET `/api/v1/workspaces/:workspaceId/portfolio/:holdingId/events`

Full event history for a holding.

**Response `200`:** `{ "events": [...] }`

---

## Analytics Module

All analytics endpoints return data in the workspace's `baseCurrency` unless `currency` param is specified.

### GET `/api/v1/workspaces/:workspaceId/analytics/summary`

**Query params:** `from`, `to` (ISO dates)

**Response `200`:**
```json
{
  "period": { "from": "2026-06-01", "to": "2026-06-30" },
  "totalIncome": "3200.00",
  "totalExpenses": "1840.00",
  "netSavings": "1360.00",
  "savingsRate": 42.5,
  "currency": "USD",
  "transactionCount": 47
}
```

---

### GET `/api/v1/workspaces/:workspaceId/analytics/by-category`

**Query params:** `from`, `to`, `type` (default `EXPENSE`)

**Response `200`:**
```json
{
  "breakdown": [
    { "category": { "id": "cuid", "name": "Groceries" }, "total": "420.00", "percent": 22.8, "transactionCount": 12 }
  ],
  "currency": "USD"
}
```

---

### GET `/api/v1/workspaces/:workspaceId/analytics/trend`

Monthly trend for the past N months.

**Query params:** `months` (default 6, max 12 for FREE, unlimited for Pro+)

**Response `200`:**
```json
{
  "trend": [
    { "month": "2026-06", "income": "3200.00", "expenses": "1840.00", "savings": "1360.00" }
  ],
  "currency": "USD"
}
```

---

### GET `/api/v1/workspaces/:workspaceId/analytics/net-worth`

Pro tier required.

**Response `200`:**
```json
{
  "cashTotal": "4200.00",
  "portfolioTotal": "5930.00",
  "netWorth": "10130.00",
  "currency": "USD",
  "snapshot": "2026-06-02T15:00:00.000Z"
}
```

---

## Conversations Module

### GET `/api/v1/workspaces/:workspaceId/conversations`

Lists conversations for the authenticated user in this workspace.

**Response `200`:**
```json
{
  "conversations": [
    { "id": "cuid", "title": "June spending", "messageCount": 34, "updatedAt": "..." }
  ]
}
```

---

### POST `/api/v1/workspaces/:workspaceId/conversations`

Creates a new conversation.

**Response `201`:** `{ "id": "cuid", "title": null, "createdAt": "..." }`

---

### POST `/api/v1/workspaces/:workspaceId/conversations/:conversationId/messages`

**The core endpoint. Sends a user message, runs the LLM pipeline, returns the response.**

**Request:**
```json
{ "content": "I spent ₱2,200 on groceries at SM Supermarket yesterday" }
```

**Response `200`:**
```json
{
  "message": {
    "id": "cuid",
    "role": "ASSISTANT",
    "content": "Logged ₱2,200 under Groceries (≈ $38.42 at today's rate). That brings your grocery spend this month to ₱9,800 — you're 65% through your ₱15,000 monthly food budget. On track 👍",
    "createdAt": "2026-06-02T10:23:00.000Z"
  },
  "actions": [
    {
      "type": "TRANSACTION_CREATED",
      "transactionId": "cuid",
      "preview": {
        "amount": "2200.00",
        "currency": "PHP",
        "merchant": "SM Supermarket",
        "category": "Groceries"
      }
    }
  ],
  "pendingConfirmations": []
}
```

The `actions` array tells the client what the AI did so the UI can surface inline confirmations, undo buttons, or highlights without re-fetching.

`pendingConfirmations` contains any low-confidence extractions that need user approval before committing:

```json
{
  "pendingConfirmations": [
    {
      "confirmationId": "temp-cuid",
      "question": "I think you spent around $40 on something — can you confirm the exact amount and category?",
      "draft": { "amountOriginal": "40.00", "currencyOriginal": "USD", "merchant": null, "category": null }
    }
  ]
}
```

---

### GET `/api/v1/workspaces/:workspaceId/conversations/:conversationId/messages`

**Query params:** `cursor`, `limit` (default 30)

**Response `200`:**
```json
{
  "messages": [
    { "id": "cuid", "role": "USER", "content": "...", "createdAt": "..." },
    { "id": "cuid", "role": "ASSISTANT", "content": "...", "createdAt": "..." }
  ],
  "nextCursor": "cuid",
  "hasMore": false
}
```

Note: `TOOL_CALL` and `TOOL_RESULT` messages are stored in DB but **not returned** to the client by default. They are internal AI plumbing. Pass `?includeToolMessages=true` for debug purposes only.

---

## Alerts Module

### GET `/api/v1/workspaces/:workspaceId/alerts`

**Query params:** `status` (`UNREAD | READ | DISMISSED`), `cursor`, `limit`

**Response `200`:**
```json
{
  "alerts": [
    {
      "id": "cuid",
      "type": "BUDGET_75_PERCENT",
      "status": "UNREAD",
      "title": "Dining budget at 75%",
      "body": "You've spent $37.50 of your $50 dining budget this month. 8 days left.",
      "createdAt": "..."
    }
  ],
  "unreadCount": 3
}
```

---

### PATCH `/api/v1/workspaces/:workspaceId/alerts/:alertId`

**Request:** `{ "status": "READ" }` or `{ "status": "DISMISSED" }`
**Response `200`:** Updated alert.

---

### PATCH `/api/v1/workspaces/:workspaceId/alerts/mark-all-read`

**Response `200`:** `{ "updated": 3 }`

---

## Market Data Module (Proxy)

These endpoints proxy Alpha Vantage so the API key never touches the client.
Redis cache: 15-minute TTL for quotes, 24-hour TTL for company info.

### GET `/api/v1/market/quote/:ticker`

Pro tier required.

**Response `200`:**
```json
{
  "ticker": "AAPL",
  "name": "Apple Inc.",
  "price": "191.20",
  "currency": "USD",
  "change": "1.40",
  "changePercent": 0.74,
  "volume": 52430100,
  "marketCap": "2.93T",
  "dataTimestamp": "2026-06-02T20:00:00.000Z",
  "isDelayed": true
}
```

---

### GET `/api/v1/market/search`

**Query params:** `q` — ticker or company name search

**Response `200`:**
```json
{
  "results": [
    { "ticker": "AAPL", "name": "Apple Inc.", "exchange": "NASDAQ", "type": "Equity" }
  ]
}
```

---

## FX Rates Module

### GET `/api/v1/fx/rate`

**Query params:** `from` (ISO 4217), `to` (ISO 4217), `date` (optional — defaults to today)

**Response `200`:**
```json
{
  "from": "PHP",
  "to": "USD",
  "rate": "0.01747",
  "inverseRate": "57.24",
  "date": "2026-06-02",
  "source": "frankfurter",
  "isCached": true
}
```

---

## Subscription Module

### GET `/api/v1/workspaces/:workspaceId/subscription`

**Response `200`:**
```json
{
  "tier": "FREE",
  "status": "ACTIVE",
  "currentPeriodEnd": null,
  "cancelAtPeriodEnd": false,
  "billingProvider": null
}
```

---

### POST `/api/v1/workspaces/:workspaceId/subscription/checkout`

Initiates a Stripe or Paystack checkout session.

**Request:** `{ "targetTier": "PRO", "billingProvider": "STRIPE" }`

**Response `200`:**
```json
{ "checkoutUrl": "https://checkout.stripe.com/..." }
```

---

### POST `/api/v1/workspaces/:workspaceId/subscription/cancel`

**Response `200`:** `{ "cancelAtPeriodEnd": true, "currentPeriodEnd": "2026-07-02T..." }`

---

### POST `/api/v1/webhooks/stripe`
### POST `/api/v1/webhooks/paystack`

Internal webhook handlers. Verify signature, update subscription status, upgrade/downgrade tier. No auth header required — signature verification replaces JWT here.

**Response `200`:** `{ "received": true }`

---

---

# LLM Tool Definitions

These are the structured tool definitions passed to the LLM on every `/conversations/:id/messages` call. The LLM invokes these tools; the NestJS `ChatService` executes them against the database.

**Design principle:** The LLM is the router and the voice. NestJS is the executor. The LLM never writes to the database directly — it calls a tool, NestJS executes it, returns the result, and the LLM generates a natural language response from that result.

---

## Tool: `log_expense`

Logs an expense transaction.

```json
{
  "name": "log_expense",
  "description": "Log an expense. Use when the user mentions spending money on something.",
  "input_schema": {
    "type": "object",
    "properties": {
      "amountOriginal": {
        "type": "string",
        "description": "The amount spent as a decimal string. e.g. '2200.00'"
      },
      "currencyOriginal": {
        "type": "string",
        "description": "ISO 4217 currency code. Infer from context (user's location, account, or explicit mention). e.g. 'PHP', 'USD', 'NGN'"
      },
      "merchant": {
        "type": "string",
        "description": "The merchant or vendor name. e.g. 'SM Supermarket', 'Shein', 'Grab Food'"
      },
      "categoryName": {
        "type": "string",
        "description": "Best-guess category from the workspace's category list. e.g. 'Groceries', 'Dining', 'Transport'"
      },
      "transactionDate": {
        "type": "string",
        "description": "ISO 8601 date. Infer from context ('yesterday', 'last Tuesday'). Default to today if not mentioned."
      },
      "description": {
        "type": "string",
        "description": "Optional free-text note extracted from the user message."
      },
      "accountName": {
        "type": "string",
        "description": "Account used for this expense, if mentioned. e.g. 'GCash', 'BDO'"
      },
      "confidence": {
        "type": "number",
        "description": "Your confidence in the extraction, 0.0 to 1.0. Be conservative — if the amount is ambiguous or currency unclear, score below 0.7."
      }
    },
    "required": ["amountOriginal", "currencyOriginal", "transactionDate", "confidence"]
  }
}
```

---

## Tool: `log_income`

```json
{
  "name": "log_income",
  "description": "Log an income event. Use when the user mentions receiving money — salary, freelance payment, dividend, etc.",
  "input_schema": {
    "type": "object",
    "properties": {
      "amountOriginal": { "type": "string" },
      "currencyOriginal": { "type": "string" },
      "source": { "type": "string", "description": "Income source. e.g. 'Salary', 'Upwork', 'Dividends', 'Freelance'" },
      "categoryName": { "type": "string" },
      "transactionDate": { "type": "string" },
      "description": { "type": "string" },
      "accountName": { "type": "string" },
      "confidence": { "type": "number" }
    },
    "required": ["amountOriginal", "currencyOriginal", "transactionDate", "confidence"]
  }
}
```

---

## Tool: `log_transfer`

```json
{
  "name": "log_transfer",
  "description": "Log a transfer between two accounts or currencies. Use when the user moves money between accounts they own.",
  "input_schema": {
    "type": "object",
    "properties": {
      "amountOriginal": { "type": "string" },
      "currencyOriginal": { "type": "string" },
      "fromAccountName": { "type": "string" },
      "toAccountName": { "type": "string" },
      "transactionDate": { "type": "string" },
      "description": { "type": "string" },
      "confidence": { "type": "number" }
    },
    "required": ["amountOriginal", "currencyOriginal", "transactionDate", "confidence"]
  }
}
```

---

## Tool: `log_investment_event`

```json
{
  "name": "log_investment_event",
  "description": "Log a portfolio investment action — buying, selling, receiving dividends, etc. No brokerage execution — record only.",
  "input_schema": {
    "type": "object",
    "properties": {
      "ticker": { "type": "string", "description": "Stock/ETF ticker symbol. e.g. 'AAPL', 'VOO'" },
      "action": {
        "type": "string",
        "enum": ["BUY", "SELL", "DIVIDEND", "SPLIT", "ADD"],
        "description": "The type of investment action."
      },
      "quantity": { "type": "string", "description": "Number of shares/units as decimal string." },
      "pricePerUnit": { "type": "string", "description": "Price per share/unit as decimal string." },
      "currency": { "type": "string", "description": "Currency of pricePerUnit." },
      "eventDate": { "type": "string" },
      "notes": { "type": "string" },
      "confidence": { "type": "number" }
    },
    "required": ["ticker", "action", "quantity", "pricePerUnit", "currency", "eventDate", "confidence"]
  }
}
```

---

## Tool: `set_budget`

```json
{
  "name": "set_budget",
  "description": "Create or update a monthly budget for a spending category.",
  "input_schema": {
    "type": "object",
    "properties": {
      "categoryName": { "type": "string" },
      "amountLimit": { "type": "string", "description": "Budget limit as decimal string in the workspace base currency." },
      "period": { "type": "string", "enum": ["MONTHLY", "WEEKLY", "QUARTERLY"], "default": "MONTHLY" },
      "periodStart": { "type": "string", "description": "ISO date for period start. Defaults to start of current month." }
    },
    "required": ["categoryName", "amountLimit"]
  }
}
```

---

## Tool: `query_analytics`

```json
{
  "name": "query_analytics",
  "description": "Fetch spending or income analytics to answer user questions like 'what did I spend most on this month?' or 'how much did I earn last quarter?'",
  "input_schema": {
    "type": "object",
    "properties": {
      "queryType": {
        "type": "string",
        "enum": ["SUMMARY", "BY_CATEGORY", "TREND", "TOP_MERCHANTS", "NET_WORTH"],
        "description": "The type of analytics to retrieve."
      },
      "fromDate": { "type": "string", "description": "ISO date. Start of period." },
      "toDate": { "type": "string", "description": "ISO date. End of period." },
      "transactionType": { "type": "string", "enum": ["EXPENSE", "INCOME", "ALL"], "default": "ALL" }
    },
    "required": ["queryType", "fromDate", "toDate"]
  }
}
```

---

## Tool: `get_market_data`

```json
{
  "name": "get_market_data",
  "description": "Fetch current market price and basic data for a stock or ETF ticker. Use when user asks about a stock price, or wants investment insights for a specific ticker.",
  "input_schema": {
    "type": "object",
    "properties": {
      "ticker": { "type": "string", "description": "Stock or ETF ticker symbol. e.g. 'AAPL', 'VOO', 'TSLA'" },
      "includeInsight": {
        "type": "boolean",
        "description": "If true, fetch enough data to generate a hold/sell/compound recommendation. Triggers additional fundamental data fetch.",
        "default": false
      }
    },
    "required": ["ticker"]
  }
}
```

---

## Tool: `get_fx_rate`

```json
{
  "name": "get_fx_rate",
  "description": "Get the exchange rate between two currencies. Use when user asks about currency conversion or when logging a transaction in an unusual currency.",
  "input_schema": {
    "type": "object",
    "properties": {
      "from": { "type": "string", "description": "Source currency. ISO 4217. e.g. 'PHP'" },
      "to": { "type": "string", "description": "Target currency. ISO 4217. e.g. 'USD'" },
      "date": { "type": "string", "description": "ISO date for historical rate. Omit for current rate." }
    },
    "required": ["from", "to"]
  }
}
```

---

## LLM System Prompt Template

This is the system prompt injected on every conversation API call. Variables in `{{ }}` are populated server-side before the request is sent to the LLM.

```
You are Budgy, a friendly and sharp personal finance assistant.
You help {{ user.displayName }} manage their money through natural conversation.

Your job is to:
1. Listen for financial events (spending, income, transfers, investments) and log them using the appropriate tool
2. Answer questions about spending, budgets, and portfolio using the query tools
3. Give immediate, honest, contextual feedback after every logged event
4. Be warm and direct — like a knowledgeable friend, not a financial robot

WORKSPACE CONTEXT:
- Base currency: {{ workspace.baseCurrency }}
- Active accounts: {{ accounts | names and currencies }}
- Active categories: {{ categories | names }}
- Current month budget utilization: {{ budgets | category name, spent, limit }}
- Subscription tier: {{ workspace.tier }}

USER CONTEXT:
- Name: {{ user.displayName }}
- Timezone: {{ user.timezone }}
- Today's date: {{ today | in user timezone }}

{% if rollingContextSummary %}
FINANCIAL HISTORY SUMMARY:
{{ rollingContextSummary }}
{% endif %}

TOOL USE RULES:
- Always use a tool when a financial event is mentioned — never just acknowledge without logging
- If confidence < 0.7, still call the tool but set confidence accordingly — the system will handle confirmation
- Never guess a currency if genuinely unclear — ask one short question first
- For analytics questions, always use query_analytics before responding — never answer from memory
- For stock questions, always use get_market_data — never quote prices from memory

RESPONSE RULES:
- After logging a transaction, always include: what was logged, running budget status for that category, and a brief comment
- Be concise — 2-4 sentences is ideal for most responses
- Use the user's local currency when quoting amounts back (show base currency equivalent in parentheses)
- If something seems off (unusually large spend, wrong currency), flag it gently
- Never lecture. One insight per response maximum.
```

---

## Chat Pipeline: Request → Response Flow

```
Client sends POST /conversations/:id/messages
          │
          ▼
ChatService.handleMessage()
  1. Load conversation (with rolling summary + recent messages)
  2. Assemble LLM context:
       - System prompt (populated with workspace/user context)
       - rollingContextSummary (if exists)
       - Recent messages (isInActiveWindow = true, up to token budget)
       - New user message
  3. Call Claude API with tool definitions
          │
          ▼
  LLM responds with one of:
    A) Text only — no tool call needed (e.g. "Good morning!")
    B) Tool call(s) — one or more tools to execute
          │
          ▼
  4. If tool call(s):
       - Execute each tool against NestJS services
       - Collect tool results
       - Send results back to LLM for final response generation
  5. Save all messages (USER, TOOL_CALL, TOOL_RESULT, ASSISTANT) to DB
  6. Update conversation.messageCount
  7. Check memory window — if Free tier, mark old messages isInActiveWindow = false
  8. Trigger async: budget alert check, anomaly detection
  9. Return AssistantMessage + actions array to client
```

---

## Tier Enforcement Matrix

| Endpoint / Feature | FREE | PRO | PREMIUM | FAMILY |
|---|---|---|---|---|
| Chat messages/day | 20 | Unlimited | Unlimited | Unlimited |
| Transaction history query | 3 months | Unlimited | Unlimited | Unlimited |
| Custom categories | 5 | Unlimited | Unlimited | Unlimited |
| Currencies | 1 | Unlimited | Unlimited | Unlimited |
| Analytics trend months | 3 | Unlimited | Unlimited | Unlimited |
| Portfolio endpoints | Blocked | ✅ | ✅ | ✅ |
| Net worth endpoint | Blocked | ✅ | ✅ | ✅ |
| Market data endpoints | Blocked | ✅ | ✅ | ✅ |
| Workspace member invites | Blocked | Blocked | Blocked | ✅ (up to 5) |
| Data export | Blocked | ✅ | ✅ | ✅ |
| Proactive AI coaching alerts | Blocked | Blocked | ✅ | ✅ |

---

*End of API Contract v1.0.0*
*Next artifact: Monorepo Structure → Claude Code handoff prompt*
