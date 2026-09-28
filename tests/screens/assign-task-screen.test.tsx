// Covers AC-TA-1, AC-TA-5
import { act, fireEvent, render } from '@testing-library/react-native';
import { AssignTaskScreen } from '@/features/assignment/assign-task-screen';

const mockListEmployees = jest.fn();
const mockAssignTask = jest.fn();
let mockIsAdmin = false;

jest.mock('expo-router', () => ({ Stack: { Screen: () => null } }));
jest.mock('react-native-keyboard-controller', () => ({
  KeyboardAvoidingView: jest.requireActual('react-native').View,
}));
jest.mock('@/features/availability/availability-provider', () => ({
  useAvailability: () => ({
    loading: false,
    snapshot: { isAdmin: mockIsAdmin },
    refresh: jest.fn(),
  }),
}));
jest.mock('@/data/assignment-repository', () => ({
  listAssignableEmployees: () => mockListEmployees(),
  assignTask: (params: unknown) => mockAssignTask(params),
}));

const sampleEmployees = [
  { id: 'emp-1', email: 'alpha@example.com', name: 'Alpha' },
  { id: 'emp-2', email: 'beta@example.com', name: 'Beta' },
];

beforeEach(() => {
  mockIsAdmin = false;
  mockListEmployees.mockReset();
  mockAssignTask.mockReset();
});

it('shows permission-denied message for non-admin and does not fetch employees', async () => {
  const view = await render(<AssignTaskScreen />);
  expect(view.getByText('Solo un administrador puede asignar tareas.')).toBeTruthy();
  expect(mockListEmployees).not.toHaveBeenCalled();
});

it('shows empty-state message for admin with no employees available', async () => {
  mockIsAdmin = true;
  mockListEmployees.mockResolvedValue([]);
  const view = await render(<AssignTaskScreen />);
  await act(async () => {});
  expect(view.getByText('No hay empleados disponibles.')).toBeTruthy();
});

it('loads and renders employee list for admin', async () => {
  mockIsAdmin = true;
  mockListEmployees.mockResolvedValue(sampleEmployees);
  const view = await render(<AssignTaskScreen />);
  await act(async () => {});
  expect(view.getByText('Alpha')).toBeTruthy();
  expect(view.getByText('Beta')).toBeTruthy();
});

it('calls assignTask with correct params on valid submit', async () => {
  mockIsAdmin = true;
  mockListEmployees.mockResolvedValue(sampleEmployees);
  mockAssignTask.mockResolvedValue({ workStreamId: 'ws-1', tokenCount: 1 });

  const view = await render(<AssignTaskScreen />);
  await act(async () => {});

  // Select employee
  await fireEvent.press(view.getByText('Alpha'));

  // Fill project name
  await fireEvent.changeText(view.getByLabelText('Proyecto'), 'Proyecto Test');

  // Fill task description
  await fireEvent.changeText(view.getByLabelText('Descripción de la tarea'), 'Una descripción');

  // Submit
  await act(async () => {
    await fireEvent.press(view.getByText('Asignar tarea'));
  });

  expect(mockAssignTask).toHaveBeenCalledWith(
    expect.objectContaining({
      assigneeId: 'emp-1',
      projectName: 'Proyecto Test',
      taskDescription: 'Una descripción',
    }),
  );
});

it('shows success message after successful assignment', async () => {
  mockIsAdmin = true;
  mockListEmployees.mockResolvedValue(sampleEmployees);
  mockAssignTask.mockResolvedValue({ workStreamId: 'ws-1', tokenCount: 1 });

  const view = await render(<AssignTaskScreen />);
  await act(async () => {});

  await fireEvent.press(view.getByText('Alpha'));
  await fireEvent.changeText(view.getByLabelText('Proyecto'), 'Proyecto X');
  await fireEvent.changeText(view.getByLabelText('Descripción de la tarea'), 'Desc');

  await act(async () => {
    await fireEvent.press(view.getByText('Asignar tarea'));
  });

  expect(view.getByText('Tarea asignada correctamente.')).toBeTruthy();
});

it('shows no-token warning when tokenCount is 0', async () => {
  mockIsAdmin = true;
  mockListEmployees.mockResolvedValue(sampleEmployees);
  mockAssignTask.mockResolvedValue({ workStreamId: 'ws-2', tokenCount: 0 });

  const view = await render(<AssignTaskScreen />);
  await act(async () => {});

  await fireEvent.press(view.getByText('Alpha'));
  await fireEvent.changeText(view.getByLabelText('Proyecto'), 'Proyecto X');
  await fireEvent.changeText(view.getByLabelText('Descripción de la tarea'), 'Desc');

  await act(async () => {
    await fireEvent.press(view.getByText('Asignar tarea'));
  });

  expect(
    view.getByText(
      'La tarea fue asignada. El empleado no tiene notificaciones configuradas en ningún dispositivo.',
    ),
  ).toBeTruthy();
});

it('shows error state and retry option on assignment failure', async () => {
  mockIsAdmin = true;
  mockListEmployees.mockResolvedValue(sampleEmployees);
  mockAssignTask.mockRejectedValue(new Error('network error'));

  const view = await render(<AssignTaskScreen />);
  await act(async () => {});

  await fireEvent.press(view.getByText('Alpha'));
  await fireEvent.changeText(view.getByLabelText('Proyecto'), 'Proyecto X');
  await fireEvent.changeText(view.getByLabelText('Descripción de la tarea'), 'Desc');

  await act(async () => {
    await fireEvent.press(view.getByText('Asignar tarea'));
  });

  expect(
    view.getByText(
      'No se pudo asignar la tarea. Revisá los datos y tus permisos, e intentá de nuevo.',
    ),
  ).toBeTruthy();
  expect(view.getByText('Reintentar')).toBeTruthy();
});

it('does not submit when project name is blank', async () => {
  mockIsAdmin = true;
  mockListEmployees.mockResolvedValue(sampleEmployees);

  const view = await render(<AssignTaskScreen />);
  await act(async () => {});

  await fireEvent.press(view.getByText('Alpha'));
  // Leave project blank
  await fireEvent.changeText(view.getByLabelText('Descripción de la tarea'), 'Desc');

  await fireEvent.press(view.getByText('Asignar tarea'));
  expect(mockAssignTask).not.toHaveBeenCalled();
});
