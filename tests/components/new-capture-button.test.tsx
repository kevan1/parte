import { fireEvent, render } from '@testing-library/react-native';

import { NewCaptureButton } from '@/components/chat/new-capture-button';

describe('new capture header action [AC-7, AC-12]', () => {
  it('cannot reset capture while an atomic confirmation is saving', async () => {
    const onPress = jest.fn();
    const view = await render(<NewCaptureButton disabled onPress={onPress} />);

    await fireEvent.press(view.getByLabelText('Nuevo registro'));

    expect(onPress).not.toHaveBeenCalled();
    expect(view.getByLabelText('Nuevo registro').props.accessibilityState).toEqual({
      disabled: true,
    });
  });
});
