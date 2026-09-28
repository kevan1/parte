import { fireEvent, render } from '@testing-library/react-native';

import { WorkerProfileContent } from '@/features/profile/components/worker-profile-content';

describe('worker profile content [AC-SM-9, AC-SM-10]', () => {
  it('shows the worker identity, translated role, join date, and identifier', async () => {
    const view = await render(
      <WorkerProfileContent
        profile={{
          avatarUrl: 'https://example.com/avatar.png',
          createdAt: '2026-08-13T18:27:04.000Z',
          email: 'kevan@example.com',
          id: 'worker-123',
          name: 'Kevan Pérez',
          role: 'employee',
        }}
      />,
    );

    expect(view.getByText('Kevan Pérez')).toBeTruthy();
    expect(view.getByText('kevan@example.com')).toBeTruthy();
    expect(view.getAllByText('Empleado')).toHaveLength(2);
    expect(view.getByText('13 de ago de 2026')).toBeTruthy();
    expect(view.getByText('worker-123')).toBeTruthy();
    const image = view.getByLabelText('Foto de perfil de Kevan Pérez');
    expect(image).toBeTruthy();
    expect(view.getByLabelText('Cerrar sesión')).toBeTruthy();

    await fireEvent(image, 'error', { nativeEvent: { error: 'Image failed to load' } });
    expect(view.getByLabelText('Iniciales de Kevan Pérez')).toBeTruthy();
  });

  it('announces the loading state [AC-SM-10]', async () => {
    const view = await render(<WorkerProfileContent loading />);

    expect(view.getByLabelText('Cargando tu perfil')).toBeTruthy();
    expect(view.getByLabelText('Cerrar sesión')).toBeTruthy();
  });

  it('exposes a retry action for a failed profile load', async () => {
    const onRetry = jest.fn();
    const view = await render(
      <WorkerProfileContent error="No pudimos cargar tu perfil." onRetry={onRetry} />,
    );

    await fireEvent.press(view.getByText('Reintentar'));

    expect(view.getByRole('alert')).toHaveTextContent('No pudimos cargar tu perfil.');
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(view.getByLabelText('Cerrar sesión')).toBeTruthy();
  });
});
