import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Carousel } from './carousel';

function slides(n: number) {
  return Array.from({ length: n }, (_, i) => <div key={i}>Slide {i + 1}</div>);
}

describe('Carousel', () => {
  it('renders one dot per slide with the first active', () => {
    render(<Carousel ariaLabel="Accounts">{slides(3)}</Carousel>);
    const dots = screen.getAllByRole('button', { name: /go to slide/i });
    expect(dots).toHaveLength(3);
    expect(dots[0]).toHaveAttribute('aria-current', 'true');
  });

  it('jumps to a slide when its dot is clicked', () => {
    render(<Carousel ariaLabel="Accounts">{slides(3)}</Carousel>);
    fireEvent.click(screen.getByRole('button', { name: 'Go to slide 3' }));
    expect(screen.getByText('Slide 3 of 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go to slide 3' })).toHaveAttribute('aria-current', 'true');
  });

  it('navigates with arrow keys and clamps at both ends', () => {
    render(<Carousel ariaLabel="Accounts">{slides(2)}</Carousel>);
    const group = screen.getByRole('group', { name: 'Accounts' });
    fireEvent.keyDown(group, { key: 'ArrowRight' });
    expect(screen.getByText('Slide 2 of 2')).toBeInTheDocument();
    fireEvent.keyDown(group, { key: 'ArrowRight' }); // clamp at end
    expect(screen.getByText('Slide 2 of 2')).toBeInTheDocument();
    fireEvent.keyDown(group, { key: 'ArrowLeft' });
    expect(screen.getByText('Slide 1 of 2')).toBeInTheDocument();
  });

  it('hides dots when showDots is false', () => {
    render(<Carousel ariaLabel="Accounts" showDots={false}>{slides(3)}</Carousel>);
    expect(screen.queryByRole('button', { name: /go to slide/i })).toBeNull();
  });

  it('calls onIndexChange with the new index when navigating', () => {
    const onIndexChange = vi.fn();
    render(
      <Carousel ariaLabel="Accounts" onIndexChange={onIndexChange}>
        {slides(3)}
      </Carousel>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Go to slide 2' }));
    expect(onIndexChange).toHaveBeenCalledWith(1);
  });
});
