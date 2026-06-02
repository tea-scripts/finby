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
    expect(names).toEqual(['log_expense', 'log_income', 'log_transfer', 'get_fx_rate']);
  });

  it('builds a system prompt with workspace + user context', () => {
    const service = new LlmService(new FakeProvider());
    const prompt = service.buildSystemPrompt({
      user: { displayName: 'Aisha Bello', timezone: 'Asia/Manila' },
      workspace: { baseCurrency: 'USD', tier: 'FREE' },
      accounts: [{ name: 'Wise USD', currency: 'USD' }],
      categories: ['Groceries', 'Dining'],
      today: '2026-06-02',
    });
    expect(prompt).toContain('Aisha Bello');
    expect(prompt).toContain('Base currency: USD');
    expect(prompt).toContain('Groceries, Dining');
    expect(prompt).toContain('Wise USD (USD)');
  });

  it('delegates createMessage to the provider', async () => {
    const provider = new FakeProvider();
    const service = new LlmService(provider);
    const res = await service.createMessage({ system: 's', messages: [{ role: 'user', content: 'hi' }] });
    expect(res.textOutput).toBe('ok');
    expect(provider.lastParams?.system).toBe('s');
  });
});
