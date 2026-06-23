import { render, screen, fireEvent } from '@testing-library/react-native';
import { TermsGate } from './terms-gate';

describe('TermsGate', () => {
  it('toggles acceptance', async () => {
    const onAcceptedChange = jest.fn();
    await render(<TermsGate accepted={false} onAcceptedChange={onAcceptedChange} />);
    fireEvent(screen.getByLabelText('Accept terms'), 'valueChange', true);
    expect(onAcceptedChange).toHaveBeenCalledWith(true);
  });

  it('reflects the accepted prop', async () => {
    await render(<TermsGate accepted={true} onAcceptedChange={() => {}} />);
    expect(screen.getByLabelText('Accept terms').props.value).toBe(true);
  });
});
