import { Linking } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { Markdown } from './markdown';

describe('Markdown', () => {
  it('renders bold text emphasized', async () => {
    await render(<Markdown content="**Bold** word" />);
    // The emphasized run is its own Text node, distinct from the paragraph.
    expect(screen.getByText('Bold')).toBeTruthy();
  });

  it('renders a GFM table with its cells', async () => {
    const md = [
      '| | NGN |',
      '|---|---|',
      '| Available | ₦232,453.55 |',
      '| Parents upkeep | -₦150,000 |',
    ].join('\n');
    await render(<Markdown content={md} />);
    expect(screen.getByText('NGN')).toBeTruthy();
    expect(screen.getByText('Available')).toBeTruthy();
    expect(screen.getByText('₦232,453.55')).toBeTruthy();
    expect(screen.getByText('Parents upkeep')).toBeTruthy();
  });

  it('renders bullet list items', async () => {
    await render(<Markdown content={'- first\n- second'} />);
    expect(screen.getByText('first')).toBeTruthy();
    expect(screen.getByText('second')).toBeTruthy();
  });

  it('opens links on press', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await render(<Markdown content="see [Finby](https://finby.app)" />);
    await fireEvent.press(screen.getByText('Finby'));
    expect(open).toHaveBeenCalledWith('https://finby.app');
    open.mockRestore();
  });
});
