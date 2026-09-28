import { render } from '@testing-library/react-native';

import { PrimaryButton } from '@/components/ui/primary-button';
import { colors } from '@/theme/tokens';

describe('PrimaryButton color contrast', () => {
  it('uses the system background as filled-button text for dark mode', async () => {
    const view = await render(<PrimaryButton label="Confirmar y guardar" />);

    expect(view.getByText('Confirmar y guardar').props.style).toEqual(
      expect.objectContaining({ color: colors.background }),
    );
  });
});
