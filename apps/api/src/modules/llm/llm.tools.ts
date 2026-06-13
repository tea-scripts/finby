import type { LlmToolDef } from './llm.types';

/**
 * Phase-2 tool definitions exposed to the LLM. The LLM calls these; ChatService
 * executes them against NestJS services. (set_budget / query_analytics /
 * get_market_data / log_investment_event arrive in later phases.)
 */
export const PHASE2_TOOLS: LlmToolDef[] = [
  {
    name: 'log_expense',
    description: 'Log an expense. Use when the user mentions spending money on something.',
    input_schema: {
      type: 'object',
      properties: {
        amountOriginal: { type: 'string', description: "Amount spent as a decimal string, e.g. '2200.00'" },
        currencyOriginal: {
          type: 'string',
          description: "ISO 4217 currency code inferred from context, e.g. 'PHP', 'USD', 'NGN'",
        },
        merchant: { type: 'string', description: "Merchant/vendor name, e.g. 'SM Supermarket'" },
        categoryName: { type: 'string', description: "Best-guess category from the workspace's category list" },
        transactionDate: { type: 'string', description: "ISO 8601 date. Default to today if not mentioned." },
        description: { type: 'string', description: 'Optional free-text note.' },
        accountName: { type: 'string', description: 'Account used, if mentioned.' },
        confidence: {
          type: 'number',
          description: 'Extraction confidence 0.0-1.0. Below 0.7 if amount/currency is ambiguous.',
        },
      },
      required: ['amountOriginal', 'currencyOriginal', 'transactionDate', 'confidence'],
    },
  },
  {
    name: 'log_income',
    description:
      'Log an income event. Use when the user mentions receiving money — salary, freelance payment, dividend, etc.',
    input_schema: {
      type: 'object',
      properties: {
        amountOriginal: { type: 'string' },
        currencyOriginal: { type: 'string' },
        source: { type: 'string', description: "Income source, e.g. 'Salary', 'Upwork'" },
        categoryName: { type: 'string' },
        transactionDate: { type: 'string' },
        description: { type: 'string' },
        accountName: { type: 'string' },
        confidence: { type: 'number' },
      },
      required: ['amountOriginal', 'currencyOriginal', 'transactionDate', 'confidence'],
    },
  },
  {
    name: 'log_transfer',
    description:
      'Log a transfer between two accounts or currencies the user owns. Use when money moves between their own accounts.',
    input_schema: {
      type: 'object',
      properties: {
        amountOriginal: { type: 'string' },
        currencyOriginal: { type: 'string' },
        fromAccountName: { type: 'string' },
        toAccountName: { type: 'string' },
        transactionDate: { type: 'string' },
        description: { type: 'string' },
        confidence: { type: 'number' },
      },
      required: ['amountOriginal', 'currencyOriginal', 'transactionDate', 'confidence'],
    },
  },
  {
    name: 'set_budget',
    description:
      'Create or update a budget for a spending category. Use when the user wants to allocate or cap spending, e.g. "budget ₱15,000 for groceries this month". To MOVE an existing budget to a different category (e.g. the user is clarifying the category of a budget you previously set under a placeholder like "Other"), set replacesCategoryName to the old category so the old budget is replaced instead of duplicated.',
    input_schema: {
      type: 'object',
      properties: {
        categoryName: { type: 'string', description: "Category to budget, e.g. 'Groceries'" },
        replacesCategoryName: {
          type: 'string',
          description:
            "The old category of a budget being re-categorized for the same period — pass this when the user clarifies or corrects the category of a budget you just set (e.g. moving it off the 'Other' placeholder). The old budget is removed and its spend carried over.",
        },
        amountLimit: {
          type: 'string',
          description: 'Budget limit as a decimal string in the workspace base currency.',
        },
        period: {
          type: 'string',
          enum: ['MONTHLY', 'WEEKLY', 'QUARTERLY'],
          description: 'Budget period. Defaults to MONTHLY.',
        },
        periodStart: {
          type: 'string',
          description: 'ISO date for period start. Defaults to current period.',
        },
      },
      required: ['categoryName', 'amountLimit'],
    },
  },
  {
    name: 'update_transaction',
    description:
      'Correct a transaction the user ALREADY logged — re-categorize it, fix the merchant, or fix the date. Use when the user fixes or clarifies a past entry ("that coffee was Dining, not Groceries", "the SM run was actually groceries"), NOT when they report a new spend. Targets the most recent matching transaction; pass matchMerchant/matchAmount to disambiguate which one. Re-categorizing automatically moves the budget spend to the correct budget.',
    input_schema: {
      type: 'object',
      properties: {
        categoryName: { type: 'string', description: 'New category to move the transaction to.' },
        merchant: { type: 'string', description: 'Corrected merchant/vendor name.' },
        transactionDate: { type: 'string', description: 'Corrected ISO 8601 date.' },
        matchMerchant: {
          type: 'string',
          description: 'Merchant of the transaction being corrected, to pick the right one.',
        },
        matchAmount: {
          type: 'string',
          description: 'Amount of the transaction being corrected, as a decimal string, to pick the right one.',
        },
        matchType: {
          type: 'string',
          enum: ['EXPENSE', 'INCOME'],
          description: 'Whether the transaction being corrected is an expense or income.',
        },
      },
      required: [],
    },
  },
  {
    name: 'correct_holding_ticker',
    description:
      'Fix the ticker symbol of an investment holding the user logged under the wrong/typo\'d symbol (e.g. "my APPL position is actually AAPL"). Moves the holding and all its events to the correct ticker. Use only to correct a symbol, not to log a new trade.',
    input_schema: {
      type: 'object',
      properties: {
        fromTicker: { type: 'string', description: "The wrong ticker currently on record, e.g. 'APPL'." },
        toTicker: { type: 'string', description: "The correct ticker, e.g. 'AAPL'." },
      },
      required: ['fromTicker', 'toTicker'],
    },
  },
  {
    name: 'query_analytics',
    description:
      "Fetch spending/income analytics to answer questions like 'what did I spend most on this month?' or 'how much did I save last quarter?'. Always use this before answering analytics questions — never answer from memory.",
    input_schema: {
      type: 'object',
      properties: {
        queryType: {
          type: 'string',
          enum: ['SUMMARY', 'BY_CATEGORY', 'TREND', 'TOP_MERCHANTS'],
          description: 'The type of analytics to retrieve.',
        },
        fromDate: { type: 'string', description: 'ISO date. Start of the period.' },
        toDate: { type: 'string', description: 'ISO date. End of the period.' },
        transactionType: {
          type: 'string',
          enum: ['EXPENSE', 'INCOME'],
          description: 'For BY_CATEGORY: which side to break down. Defaults to EXPENSE.',
        },
      },
      required: ['queryType', 'fromDate', 'toDate'],
    },
  },
  {
    name: 'log_investment_event',
    description:
      'Log a portfolio investment action — buying, selling, receiving dividends, etc. Record only; no brokerage execution.',
    input_schema: {
      type: 'object',
      properties: {
        ticker: { type: 'string', description: "Stock/ETF ticker symbol, e.g. 'AAPL', 'VOO'" },
        action: {
          type: 'string',
          enum: ['BUY', 'SELL', 'DIVIDEND', 'SPLIT', 'ADD'],
          description: 'The type of investment action.',
        },
        quantity: { type: 'string', description: 'Number of shares/units as a decimal string.' },
        pricePerUnit: { type: 'string', description: 'Price per share/unit as a decimal string.' },
        currency: { type: 'string', description: 'Currency of pricePerUnit. Defaults to USD.' },
        eventDate: { type: 'string', description: 'ISO date. Defaults to today.' },
        notes: { type: 'string' },
        confidence: { type: 'number', description: 'Extraction confidence 0.0-1.0.' },
      },
      required: ['ticker', 'action', 'quantity', 'pricePerUnit', 'currency', 'eventDate', 'confidence'],
    },
  },
  {
    name: 'get_market_data',
    description:
      'Fetch the current market price and basic data for a stock/ETF ticker. Use when the user asks about a stock price or wants investment insight. Never quote prices from memory.',
    input_schema: {
      type: 'object',
      properties: {
        ticker: { type: 'string', description: "Stock or ETF ticker symbol, e.g. 'AAPL', 'VOO'" },
        includeInsight: {
          type: 'boolean',
          description: 'If true, also fetch company fundamentals for a hold/sell/compound take.',
        },
      },
      required: ['ticker'],
    },
  },
  {
    name: 'get_fx_rate',
    description:
      'Get the exchange rate between two currencies. Use for conversions or when logging in an unusual currency.',
    input_schema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: "Source currency, ISO 4217, e.g. 'PHP'" },
        to: { type: 'string', description: "Target currency, ISO 4217, e.g. 'USD'" },
        date: { type: 'string', description: 'ISO date for a historical rate. Omit for current.' },
      },
      required: ['from', 'to'],
    },
  },
  {
    name: 'create_account',
    description:
      "Create a new account (bank, cash, e-wallet, brokerage, crypto, etc.) for the workspace. Use when the user wants to add or set up an account, e.g. 'add my GCash wallet' or 'create a BDO savings account with ₱5,000'.",
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: "Account name, e.g. 'BDO Savings', 'GCash', 'Wise USD'" },
        accountType: {
          type: 'string',
          enum: ['BANK', 'CASH', 'EWALLET', 'BROKERAGE', 'CRYPTO', 'OTHER'],
          description: 'The kind of account. Infer from context; use OTHER if unclear.',
        },
        currency: {
          type: 'string',
          description:
            "ISO 4217 currency of the account, e.g. 'PHP', 'USD'. Default to the workspace base currency if unstated.",
        },
        openingBalance: {
          type: 'string',
          description:
            "Optional starting balance as a non-negative decimal string, e.g. '5000.00'. Defaults to '0'.",
        },
      },
      required: ['name', 'accountType', 'currency'],
    },
  },
];
