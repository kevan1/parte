import { fireEvent, render } from '@testing-library/react-native';

import { AppMenu } from '@/features/swipe-menu/components/app-menu';

describe('authenticated app menu [AC-SM-3, AC-SM-4]', () => {
  it('shows Spanish destinations and identifies the active destination', async () => {
    const view = await render(
      <AppMenu
        activeDestination="history"
        bottomInset={20}
        menuWidth={320}
        onNewEntry={jest.fn()}
        onProfilePress={jest.fn()}
        onSelectDestination={jest.fn()}
        topInset={40}
        userEmail="persona@example.com"
      />,
    );

    expect(view.getByText('Parte')).toBeTruthy();
    expect(view.getByLabelText('Registrar horas').props.accessibilityState).toEqual({
      selected: false,
    });
    expect(view.getByLabelText('Mis horas').props.accessibilityState).toEqual({
      selected: true,
    });
    expect(view.getByText('persona@example.com')).toBeTruthy();
  });

  it('dispatches destination and new-capture actions', async () => {
    const onSelectDestination = jest.fn();
    const onNewEntry = jest.fn();
    const onProfilePress = jest.fn();
    const view = await render(
      <AppMenu
        activeDestination="register"
        bottomInset={0}
        menuWidth={320}
        onNewEntry={onNewEntry}
        onProfilePress={onProfilePress}
        onSelectDestination={onSelectDestination}
        topInset={0}
        workerName="Kevan Pérez"
      />,
    );

    await fireEvent.press(view.getByLabelText('Mis horas'));
    await fireEvent.press(view.getByLabelText('Nuevo registro'));
    await fireEvent.press(view.getByLabelText('Abrir perfil de Kevan Pérez'));

    expect(onSelectDestination).toHaveBeenCalledWith('history');
    expect(onNewEntry).toHaveBeenCalledTimes(1);
    expect(onProfilePress).toHaveBeenCalledTimes(1);
  });

  it('cannot reset an atomic capture while it is saving [AC-SM-4, AC-SM-6]', async () => {
    const onNewEntry = jest.fn();
    const view = await render(
      <AppMenu
        activeDestination="register"
        bottomInset={0}
        menuWidth={320}
        newEntryDisabled
        onNewEntry={onNewEntry}
        onProfilePress={jest.fn()}
        onSelectDestination={jest.fn()}
        topInset={0}
      />,
    );

    await fireEvent.press(view.getByLabelText('Nuevo registro'));

    expect(onNewEntry).not.toHaveBeenCalled();
    expect(view.getByLabelText('Nuevo registro').props.accessibilityState).toEqual({
      disabled: true,
    });
  });
});
