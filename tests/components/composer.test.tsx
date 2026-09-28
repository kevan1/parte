import { act, fireEvent, render } from '@testing-library/react-native';

import { Composer } from '@/components/chat/composer';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));

describe('capture composer [AC-12]', () => {
  it('has accessible input/action and sends trimmed Spanish work text', async () => {
    const onSend = jest.fn();
    const view = await render(
      <Composer generating={false} onSend={onSend} onStop={jest.fn()} />,
    );
    await fireEvent.changeText(view.getByLabelText('Describí tu trabajo'), '  Trabajé 1,5 horas  ');
    await fireEvent.press(view.getByLabelText('Interpretar registro'));
    expect(onSend).toHaveBeenCalledWith('Trabajé 1,5 horas');
    expect(view.queryByText('0/2000')).toBeNull();
  });

  it('restores text after a failed request', async () => {
    const view = await render(
      <Composer
        generating={false}
        restoreText="Texto recuperado"
        onSend={jest.fn()}
        onStop={jest.fn()}
      />,
    );
    expect(view.getByDisplayValue('Texto recuperado')).toBeTruthy();
  });

  it('keeps the composer dimensions and exposes stop while generating', async () => {
    const onStop = jest.fn();
    const view = await render(
      <Composer generating onSend={jest.fn()} onStop={onStop} />,
    );

    expect(view.getByTestId('capture-composer-field').props.style).toEqual(
      expect.objectContaining({ minHeight: 48, borderRadius: 24 }),
    );
    expect(view.getByTestId('capture-composer-action-circle').props.style).toEqual(
      expect.objectContaining({ width: 34, height: 34, borderRadius: 17 }),
    );
    await fireEvent.press(view.getByLabelText('Detener interpretación'));
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('supports controlled value and forwards text changes', async () => {
    const onValueChange = jest.fn();
    const view = await render(
      <Composer
        value=""
        onValueChange={onValueChange}
        generating={false}
        onSend={jest.fn()}
        onStop={jest.fn()}
      />,
    );

    const input = view.getByTestId('capture-composer');
    expect(input.props.value).toBe('');
    fireEvent.changeText(input, 'En instalación: cableado, 2 horas');
    expect(onValueChange).toHaveBeenCalledWith('En instalación: cableado, 2 horas');

    await act(async () => {
      view.rerender(
        <Composer
          value="En instalación: cableado, 2 horas"
          onValueChange={onValueChange}
          generating={false}
          onSend={jest.fn()}
          onStop={jest.fn()}
        />,
      );
    });
    expect(view.getByTestId('capture-composer').props.value).toBe('En instalación: cableado, 2 horas');
  });

});
