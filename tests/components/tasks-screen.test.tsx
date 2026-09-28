import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import { TasksScreen } from '@/screens/tasks-screen';

const mockListWorkStreams = jest.fn();
const mockListWorkEvidence = jest.fn();
const mockReact = jest.requireActual('react') as typeof import('react');

jest.mock('@/data/time-entry-repository', () => ({
  listWorkStreams: (...args: unknown[]) => mockListWorkStreams(...args),
}));

jest.mock('@/data/work-evidence-repository', () => ({
  listWorkEvidence: (...args: unknown[]) => mockListWorkEvidence(...args),
}));

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  useFocusEffect: (callback: () => void | (() => void)) => {
    // The mock runs the focus callback once, matching a screen entering focus.
    mockReact.useEffect(callback, []);
  },
}));

describe('tasks screen', () => {
  beforeEach(() => {
    mockListWorkStreams.mockReset();
    mockListWorkEvidence.mockReset();
    mockListWorkEvidence.mockResolvedValue([]);
  });

  it('loads assigned open tasks and shows requester and optional materials', async () => {
    mockListWorkStreams.mockResolvedValueOnce([
      {
        id: 'task-1',
        userId: 'user-1',
        projectName: 'Línea 3',
        taskDescription: 'Cambiar cable del tablero',
        lastUsedAt: '2026-08-31T12:00:00.000Z',
        status: 'open',
        completedAt: null,
        requesterType: 'line',
        requesterName: 'Línea de producción 3',
        materials: ['Cable 4 mm', 'Tornillos'],
      },
    ]);

    const view = await render(<TasksScreen />);

    await waitFor(() => expect(view.getByText('Cambiar cable del tablero')).toBeTruthy());
    expect(view.getByText('Línea 3')).toBeTruthy();
    expect(view.getByText('Solicitado por · Línea de producción')).toBeTruthy();
    expect(view.getByText('Línea de producción 3')).toBeTruthy();
    expect(view.getByText('Materiales')).toBeTruthy();
    expect(view.getByText('Cable 4 mm · Tornillos')).toBeTruthy();
  });

  it('shows an empty state and retries after a load error', async () => {
    mockListWorkStreams.mockRejectedValueOnce(new Error('offline'));
    const view = await render(<TasksScreen />);

    await waitFor(() => expect(view.getByText('No pudimos cargar tus tareas.')).toBeTruthy());
    mockListWorkStreams.mockResolvedValueOnce([]);

    await act(async () => {
      await fireEvent.press(view.getByText('Reintentar'));
    });

    await waitFor(() => expect(view.getByText('No tenés tareas asignadas')).toBeTruthy());
  });

  it('shows persisted evidence on an assigned task', async () => {
    mockListWorkStreams.mockResolvedValueOnce([
      {
        id: 'task-1',
        userId: 'user-1',
        projectName: 'Línea 3',
        taskDescription: 'Cambiar cable del tablero',
        lastUsedAt: '2026-08-31T12:00:00.000Z',
        status: 'open',
        completedAt: null,
      },
    ]);
    mockListWorkEvidence.mockResolvedValueOnce([
      {
        id: 'evidence-1',
        userId: 'user-1',
        workStreamId: 'task-1',
        sourceAssetId: 'ph://asset-1',
        storagePath: 'user-1/task-1/photo.jpg',
        originalFilename: 'photo.jpg',
        mimeType: 'image/jpeg',
        byteSize: 1024,
        width: 1200,
        height: 900,
        createdAt: '2026-08-31T12:00:00.000Z',
        signedUrl: 'https://example.supabase.co/storage/v1/object/sign/photo.jpg',
      },
    ]);

    const view = await render(<TasksScreen />);

    await waitFor(() => expect(view.getByText('Evidencia de trabajo · 1')).toBeTruthy());
    expect(view.getByTestId('evidence-gallery-task-1')).toBeTruthy();
  });
});
