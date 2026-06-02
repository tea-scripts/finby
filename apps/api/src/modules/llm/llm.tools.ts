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
      'Create or update a budget for a spending category. Use when the user wants to allocate or cap spending, e.g. "budget ₱15,000 for groceries this month".',
    input_schema: {
      type: 'object',
      properties: {
        categoryName: { type: 'string', description: "Category to budget, e.g. 'Groceries'" },
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
];
