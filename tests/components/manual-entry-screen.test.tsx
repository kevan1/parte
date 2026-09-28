import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ComponentProps, ReactNode } from 'react';

import { ManualEntryScreen } from '@/features/manual-entry/manual-entry-screen';
import type { WorkStream } from '@/domain/types';

jest.mock('@react-native-picker/picker', () => {
  const mockReact = jest.requireActual('react') as typeof import('react');
  const mockNative = jest.requireActual('react-native') as typeof import('react-native');

  const Picker = ({ children, ...props }: { children: ReactNode }) =>
    mockReact.createElement(mockNative.View, props, children);
  Picker.Item = ({ label, value }: { label: string; value: number }) =>
    mockReact.createElement(mockNative.Text, { value } as Record<string, unknown>, label);
  Picker.displayName = 'Picker';

  return { Picker };
});

jest.mock('@react-native-community/datetimepicker', () => {
  const mockReact = jest.requireActual('react') as typeof import('react');
  const mockNative = jest.requireActual('react-native') as typeof import('react-native');

  return {
    __esModule: true,
    default: ({ accessibilityLabel, onChange }: { accessibilityLabel: string; onChange: Function }) =>
      mockReact.createElement(mockNative.View, {
        accessibilityLabel,
        onTouchEnd: () => onChange({}, new Date(2026, 7, 13)),
      }),
  };
});

const recentStream: WorkStream = {
  id: '11111111-1111-4111-8111-111111111111',
  userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  projectName: 'Horas',
  taskDescription: 'Corregir login',
  lastUsedAt: '2026-08-13T12:00:00.000Z',
  status: 'open',
  completedAt: null,
};

function dependencies(overrides: Partial<ComponentProps<typeof ManualEntryScreen>> = {}) {
  return {
    today: '2026-08-14',
    createId: jest.fn().mockReturnValueOnce('22222222-2222-4222-8222-222222222222').mockReturnValueOnce('33333333-3333-4333-8333-333333333333'),
    loadWorkStreams: jest.fn().mockResolvedValue([recentStream]),
    loadDayMinutes: jest.fn().mockResolvedValue(60),
    confirmEntries: jest.fn().mockResolvedValue([]),
    onSaved: jest.fn(),
    ...overrides,
  };
}

describe('manual entry form sheet [AC-ME-3, AC-ME-4, AC-ME-5, AC-ME-6, AC-ME-7, AC-ME-8]', () => {
  it('shows loading, recent-work selection, and manual fallback [AC-ME-5, AC-ME-6, AC-ME-8]', async () => {
    let resolveStreams!: (streams: WorkStream[]) => void;
    const props = dependencies({
      loadWorkStreams: jest.fn().mockReturnValue(
        new Promise<WorkStream[]>((resolve) => {
          resolveStreams = resolve;
        }),
      ),
    });
    await render(<ManualEntryScreen {...props} />);

    expect(screen.getByLabelText('Cargando tareas recientes')).toBeTruthy();
    resolveStreams([recentStream]);
    const recentChoice = await screen.findByLabelText('Usar Corregir login de Horas');
    await fireEvent.press(recentChoice);

    expect(screen.getByLabelText('Proyecto').props.value).toBe('Horas');
    expect(screen.getByLabelText('Tarea').props.value).toBe('Corregir login');
    expect(recentChoice.props.accessibilityState).toMatchObject({ selected: true });

    await fireEvent.changeText(screen.getByLabelText('Tarea'), 'Nueva tarea manual');
    expect(screen.getByLabelText('Usar Corregir login de Horas').props.accessibilityState).toMatchObject({
      selected: false,
    });
  });

  it('keeps manual entry available when recent work is empty [AC-ME-5]', async () => {
    await render(<ManualEntryScreen {...dependencies({ loadWorkStreams: jest.fn().mockResolvedValue([]) })} />);

    expect(await screen.findByText('Todavía no hay tareas recientes.')).toBeTruthy();
    expect(screen.getByLabelText('Proyecto')).toBeTruthy();
    expect(screen.getByLabelText('Tarea')).toBeTruthy();
  });

  it('shows a retryable recent-work error without blocking manual fields [AC-ME-5]', async () => {
    const loadWorkStreams = jest
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce([recentStream]);
    await render(<ManualEntryScreen {...dependencies({ loadWorkStreams })} />);

    expect(await screen.findByText(/No pudimos cargar tus tareas recientes/)).toBeTruthy();
    expect(screen.getByLabelText('Proyecto')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Reintentar tareas recientes'));
    expect(await screen.findByLabelText('Usar Corregir login de Horas')).toBeTruthy();
    expect(loadWorkStreams).toHaveBeenCalledTimes(2);
  });

  it('exposes native duration choices and accessible validation [AC-ME-3, AC-ME-4, AC-ME-8]', async () => {
    await render(<ManualEntryScreen {...dependencies()} />);
    await fireEvent.press(await screen.findByLabelText('Usar Corregir login de Horas'));

    expect(screen.getByTestId('manual-entry-scroll').props.automaticallyAdjustKeyboardInsets).toBe(
      true,
    );

    await fireEvent(screen.getByLabelText('Horas de duración'), 'valueChange', 0);
    await fireEvent(screen.getByLabelText('Minutos de duración'), 'valueChange', 0);
    await fireEvent.press(screen.getByLabelText('Guardar registro'));

    expect(screen.getByText(/mayor a cero/)).toBeTruthy();
    expect(screen.getByLabelText('Guardar registro').props.accessibilityState).toMatchObject({
      disabled: false,
      busy: false,
    });
  });

  it('persists a selected task, marks success, and dismisses [AC-ME-5, AC-ME-7]', async () => {
    const props = dependencies();
    await render(<ManualEntryScreen {...props} />);
    await fireEvent.press(await screen.findByLabelText('Usar Corregir login de Horas'));
    await fireEvent(screen.getByLabelText('Horas de duración'), 'valueChange', 1);
    await fireEvent(screen.getByLabelText('Minutos de duración'), 'valueChange', 5);
    await fireEvent.press(screen.getByLabelText('Guardar registro'));

    await waitFor(() => expect(props.onSaved).toHaveBeenCalledTimes(1));
    expect(props.loadDayMinutes).toHaveBeenCalledWith('2026-08-14');
    expect(props.confirmEntries).toHaveBeenCalledWith(
      '22222222-2222-4222-8222-222222222222',
      [
        expect.objectContaining({
          clientId: '33333333-3333-4333-8333-333333333333',
          durationMinutes: 65,
          projectName: 'Horas',
          taskDescription: 'Corregir login',
          selectedWorkStreamId: recentStream.id,
        }),
      ],
    );
  });

  it('persists requester and optional materials for a new manual task', async () => {
    const props = dependencies({ loadWorkStreams: jest.fn().mockResolvedValue([]) });
    await render(<ManualEntryScreen {...props} />);

    await fireEvent.changeText(screen.getByLabelText('Proyecto'), 'Planta Norte');
    await fireEvent.changeText(screen.getByLabelText('Tarea'), 'Reemplazar tablero');
    await fireEvent.press(screen.getByLabelText('Persona'));
    await fireEvent.changeText(screen.getByLabelText('Quién pidió el trabajo'), 'María García');
    await fireEvent.changeText(
      screen.getByLabelText('Materiales utilizados (opcional)'),
      'Tornillos, cable 4 mm',
    );
    await fireEvent.press(screen.getByLabelText('Guardar registro'));

    await waitFor(() => expect(props.onSaved).toHaveBeenCalledTimes(1));
    expect(props.confirmEntries).toHaveBeenCalledWith(
      '22222222-2222-4222-8222-222222222222',
      [
        expect.objectContaining({
          projectName: 'Planta Norte',
          taskDescription: 'Reemplazar tablero',
          requesterType: 'person',
          requesterName: 'María García',
          materials: ['Tornillos', 'cable 4 mm'],
          selectedWorkStreamId: null,
        }),
      ],
    );
  });

  it('reuses requester and materials from a selected recent task', async () => {
    const taskWithDetails = {
      ...recentStream,
      requesterType: 'sector' as const,
      requesterName: 'Mantenimiento',
      materials: ['Tornillos'],
    };
    await render(
      <ManualEntryScreen
        {...dependencies({ loadWorkStreams: jest.fn().mockResolvedValue([taskWithDetails]) })}
      />,
    );

    await fireEvent.press(await screen.findByLabelText('Usar Corregir login de Horas'));

    expect(screen.getByLabelText('Sector').props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByLabelText('Quién pidió el trabajo').props.value).toBe('Mantenimiento');
    expect(screen.getByLabelText('Materiales utilizados (opcional)').props.value).toBe('Tornillos');
    expect(screen.getByLabelText('Quién pidió el trabajo').props.editable).toBe(false);
    expect(screen.getByLabelText('Materiales utilizados (opcional)').props.editable).toBe(false);
  });

  it('retries a failed save with the same submission identifier [AC-ME-7]', async () => {
    const confirmEntries = jest
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce([]);
    const loadDayMinutes = jest.fn().mockResolvedValueOnce(1_380).mockResolvedValueOnce(1_440);
    const props = dependencies({ confirmEntries, loadDayMinutes });
    await render(<ManualEntryScreen {...props} />);
    await fireEvent.press(await screen.findByLabelText('Usar Corregir login de Horas'));

    await fireEvent.press(screen.getByLabelText('Guardar registro'));
    expect(await screen.findByText('No pudimos guardar el registro. Intentá nuevamente.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Guardar registro'));

    await waitFor(() => expect(props.onSaved).toHaveBeenCalledTimes(1));
    expect(confirmEntries.mock.calls[0][0]).toBe('22222222-2222-4222-8222-222222222222');
    expect(confirmEntries.mock.calls[1][0]).toBe('22222222-2222-4222-8222-222222222222');
    expect(loadDayMinutes).toHaveBeenCalledTimes(1);
    expect(confirmEntries.mock.calls[1][1]).toEqual(confirmEntries.mock.calls[0][1]);
  });

  it('blocks sheet dismissal while an atomic save is pending [AC-ME-7, AC-ME-8]', async () => {
    let resolveConfirmation!: (entries: []) => void;
    const confirmEntries = jest.fn().mockReturnValue(
      new Promise<[]>((resolve) => {
        resolveConfirmation = resolve;
      }),
    );
    const onCancel = jest.fn();
    const onSavingChange = jest.fn();
    const props = dependencies({ confirmEntries, onCancel, onSavingChange });
    await render(<ManualEntryScreen {...props} />);
    await fireEvent.press(await screen.findByLabelText('Usar Corregir login de Horas'));
    await fireEvent.press(screen.getByLabelText('Guardar registro'));

    await waitFor(() => expect(confirmEntries).toHaveBeenCalledTimes(1));
    expect(onSavingChange).toHaveBeenLastCalledWith(true);
    expect(screen.getByLabelText('Cancelar carga manual').props.accessibilityState).toMatchObject({
      disabled: true,
    });
    await fireEvent.press(screen.getByLabelText('Cancelar carga manual'));
    expect(onCancel).not.toHaveBeenCalled();

    resolveConfirmation([]);
    await waitFor(() => expect(props.onSaved).toHaveBeenCalledTimes(1));
    expect(onSavingChange).toHaveBeenLastCalledWith(false);
  });

  it('coalesces concurrent save triggers into one atomic request [AC-ME-7]', async () => {
    let resolveDayMinutes!: (minutes: number) => void;
    const loadDayMinutes = jest.fn().mockReturnValue(
      new Promise<number>((resolve) => {
        resolveDayMinutes = resolve;
      }),
    );
    const props = dependencies({ loadDayMinutes });
    await render(<ManualEntryScreen {...props} />);
    await fireEvent.press(await screen.findByLabelText('Usar Corregir login de Horas'));

    const saveButton = screen.getByLabelText('Guardar registro');
    const onClick = saveButton.props.onClick as (event: object) => void;
    const event = { nativeEvent: {}, stopPropagation: jest.fn() };
    await act(() => {
      onClick(event);
      onClick(event);
    });

    expect(loadDayMinutes).toHaveBeenCalledTimes(1);
    resolveDayMinutes(60);
    await waitFor(() => expect(props.onSaved).toHaveBeenCalledTimes(1));
    expect(props.confirmEntries).toHaveBeenCalledTimes(1);
  });
});
