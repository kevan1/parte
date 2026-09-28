import { fireEvent, render } from '@testing-library/react-native';

import { CloseMenuOverlay } from '@/features/swipe-menu/components/close-menu-overlay';

describe('swipe menu close overlay [AC-SM-5]', () => {
  it('is absent from touch and accessibility trees while the menu is closed', async () => {
    const view = await render(<CloseMenuOverlay isMenuOpen={false} onClose={jest.fn()} />);

    expect(view.queryByLabelText('Cerrar menú')).toBeNull();
  });

  it('closes the menu when the exposed app surface is pressed', async () => {
    const onClose = jest.fn();
    const view = await render(<CloseMenuOverlay isMenuOpen onClose={onClose} />);

    await fireEvent.press(view.getByLabelText('Cerrar menú'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
