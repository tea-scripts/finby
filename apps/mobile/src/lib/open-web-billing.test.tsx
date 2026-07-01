import { Linking } from 'react-native';
import { openWebBilling } from './open-web-billing';

describe('openWebBilling', () => {
  it('opens the web billing URL', async () => {
    const spy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    openWebBilling();
    expect(spy).toHaveBeenCalledWith('https://chat.finby.app/settings');
    spy.mockRestore();
  });
});
