import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Composer } from './composer';

function setup() {
  const onSend = vi.fn();
  const onClearCommand = vi.fn();
  render(<Composer disabled={false} onSend={onSend} onClearCommand={onClearCommand} />);
  const textarea = screen.getByPlaceholderText('Tell Finby what you spent…');
  const send = screen.getByRole('button', { name: 'Send' });
  return { onSend, onClearCommand, textarea, send };
}

describe('Composer', () => {
  it('routes the /clear command to onClearCommand, not the LLM', () => {
    const { onSend, onClearCommand, textarea, send } = setup();
    fireEvent.change(textarea, { target: { value: '/clear' } });
    fireEvent.click(send);
    expect(onClearCommand).toHaveBeenCalledTimes(1);
    expect(onSend).not.toHaveBeenCalled();
    expect((textarea as HTMLTextAreaElement).value).toBe('');
  });

  it('treats /clear case-insensitively', () => {
    const { onClearCommand, textarea, send } = setup();
    fireEvent.change(textarea, { target: { value: '  /CLEAR  ' } });
    fireEvent.click(send);
    expect(onClearCommand).toHaveBeenCalledTimes(1);
  });

  it('sends normal messages through onSend', () => {
    const { onSend, onClearCommand, textarea, send } = setup();
    fireEvent.change(textarea, { target: { value: 'spent 12 on lunch' } });
    fireEvent.click(send);
    expect(onSend).toHaveBeenCalledWith('spent 12 on lunch');
    expect(onClearCommand).not.toHaveBeenCalled();
  });

  it('does not treat "/clear something" as the command', () => {
    const { onSend, onClearCommand, textarea, send } = setup();
    fireEvent.change(textarea, { target: { value: '/clear my budget' } });
    fireEvent.click(send);
    expect(onSend).toHaveBeenCalledWith('/clear my budget');
    expect(onClearCommand).not.toHaveBeenCalled();
  });
});
