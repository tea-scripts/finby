import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MessageBubble } from './message-bubble';

describe('MessageBubble', () => {
  it('renders the assistant text bubble when there is content', () => {
    const { container } = render(<MessageBubble role="ASSISTANT" content="Hello there" />);
    expect(screen.getByText('Hello there')).toBeInTheDocument();
    expect(container.querySelector('.bg-surface')).not.toBeNull();
  });

  it('suppresses the empty assistant bubble (no box before text streams)', () => {
    const { container } = render(
      <MessageBubble role="ASSISTANT" content="" lead={<div>LOGGED CARD</div>} />,
    );
    // the lead (committed card) still shows...
    expect(screen.getByText('LOGGED CARD')).toBeInTheDocument();
    // ...but there is no empty assistant text bubble.
    expect(container.querySelector('.bg-surface')).toBeNull();
  });

  it('renders lead above the text, and children below it', () => {
    const { container } = render(
      <MessageBubble role="ASSISTANT" content="the reply" lead={<div>LEADCARD</div>}>
        <div>CHILDCARD</div>
      </MessageBubble>,
    );
    const html = container.innerHTML;
    expect(html.indexOf('LEADCARD')).toBeLessThan(html.indexOf('the reply'));
    expect(html.indexOf('the reply')).toBeLessThan(html.indexOf('CHILDCARD'));
  });

  it('still renders a user bubble verbatim', () => {
    render(<MessageBubble role="USER" content="spent 10 on coffee" />);
    expect(screen.getByText('spent 10 on coffee')).toBeInTheDocument();
  });
});
