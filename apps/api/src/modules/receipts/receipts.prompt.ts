/**
 * Vision prompt for receipt extraction. The category list here is the model's
 * vocabulary, not the workspace's — the web client re-resolves the extracted
 * name against the workspace's real categories before logging.
 */
export const RECEIPT_EXTRACTION_PROMPT = `You are a receipt parser. Extract the following information from this receipt image and return ONLY valid JSON with no explanation, no markdown, no backticks.

Required JSON structure:
{
  "merchant": "string — store or restaurant name",
  "total": number — the final total paid (after tax, after discounts),
  "currency": "string — ISO 4217 currency code, infer from receipt symbols or context. Default to USD if unclear",
  "date": "string — YYYY-MM-DD format. Use today if not visible",
  "category": "string — one of: Dining, Groceries, Transport, Shopping, Healthcare, Entertainment, Utilities, Education, Travel, Personal Care, Other",
  "lineItems": [
    { "name": "string", "amount": number }
  ],
  "confidence": number — 0.0 to 1.0, your confidence in the total amount extraction,
  "isMixedCategories": boolean — true if the receipt contains items from clearly different spending categories,
  "notes": "string or null — merchant address or any useful context visible on receipt"
}

Rules:
- total must be a number, not a string
- lineItems should only be populated if clearly visible on the receipt — empty array if not readable
- If the receipt is not readable or is not a receipt, return { "error": "not_a_receipt" }
- Never hallucinate amounts — if you cannot read a number clearly, omit it from lineItems but still extract the total if visible`;
