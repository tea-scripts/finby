import { LlmService } from './llm.service';
import type { LlmCreateParams, LlmProvider, LlmResponse } from './llm.types';

class FakeProvider implements LlmProvider {
  public lastParams?: LlmCreateParams;
  async createMessage(params: LlmCreateParams): Promise<LlmResponse> {
    this.lastParams = params;
    return { stopReason: 'end_turn', content: [{ type: 'text', text: 'ok' }], textOutput: 'ok', toolCalls: [] };
  }
}

describe('LlmService', () => {
  it('exposes the Phase-2 tool definitions', () => {
    const service = new LlmService(new FakeProvider());
    const names = service.getTools().map((t) => t.name);
    expect(names).toEqual([
      'log_expense',
      'log_income',
      'log_transfer',
      'set_budget',
      'update_transaction',
      'correct_holding_ticker',
      'query_analytics',
      'log_investment_event',
      'get_market_data',
      'get_fx_rate',
    ]);
  });

  it('builds a system prompt with workspace + user context', () => {
    const service = new LlmService(new FakeProvider());
    const prompt = service.buildSystemPrompt({
      user: { displayName: 'Aisha Bello', timezone: 'Asia/Manila' },
      workspace: { baseCurrency: 'USD', tier: 'FREE' },
      accounts: [{ name: 'Wise USD', currency: 'USD' }],
      categories: ['Groceries', 'Dining'],
      budgets: [{ category: 'Groceries', spent: '9800', limit: '15000', utilizationPercent: 65.3 }],
      today: '2026-06-02',
    });
    expect(prompt).toContain('Aisha Bello');
    expect(prompt).toContain('Base currency: USD');
    expect(prompt).toContain('Groceries, Dining');
    expect(prompt).toContain('Wise USD (USD)');
    expect(prompt).toContain('Groceries: 9800/15000');
  });

  it('instructs the model to act only on the latest message and never re-log history', () => {
    // Guards the duplicate-transaction bug: replayed history must not be re-logged.
    const service = new LlmService(new FakeProvider());
    const prompt = service.buildSystemPrompt({
      user: { displayName: 'Aisha Bello', timezone: 'Asia/Manila' },
      workspace: { baseCurrency: 'USD', tier: 'FREE' },
      accounts: [],
      categories: [],
      budgets: [],
      today: '2026-06-02',
    });
    expect(prompt).toContain("ACT ONLY ON THE USER'S MOST RECENT MESSAGE");
    expect(prompt).toContain('NEVER log or re-log it again');
  });

  it('delegates createMessage to the provider', async () => {
    const provider = new FakeProvider();
    const service = new LlmService(provider);
    const res = await service.createMessage({ system: 's', messages: [{ role: 'user', content: 'hi' }] });
    expect(res.textOutput).toBe('ok');
    expect(provider.lastParams?.system).toBe('s');
  });
});
