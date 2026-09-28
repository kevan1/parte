// Covers AC-AV-4
import { act, fireEvent, render } from '@testing-library/react-native';
import { SchedulesScreen } from '@/features/availability/schedules-screen';
const mockList = jest.fn();
const mockSave = jest.fn();
const mockRefresh = jest.fn();
let mockAdmin = false;
jest.mock('expo-router', () => ({ Stack: { Screen: () => null } }));
jest.mock('react-native-keyboard-controller', () => ({ KeyboardAvoidingView: jest.requireActual('react-native').View }));
jest.mock('@/features/availability/availability-provider', () => ({ useAvailability: () => ({ loading: false, snapshot: { isAdmin: mockAdmin }, refresh: mockRefresh }) }));
jest.mock('@/data/availability-repository', () => ({ listEmployeeSchedules: () => mockList(), saveEmployeeSchedule: (value: unknown) => mockSave(value) }));
beforeEach(() => { mockAdmin = false; mockList.mockReset(); mockSave.mockReset(); mockRefresh.mockReset(); });
it('does not fetch employee data for a non-admin deep link', async () => {
  const view = await render(<SchedulesScreen />);
  expect(view.getByText('Solo un administrador puede configurar las jornadas.')).toBeTruthy();
  expect(mockList).not.toHaveBeenCalled();
});
it('requires explicit save, validates times, and retries failed schedule writes', async () => {
  mockAdmin = true;
  mockList.mockResolvedValue([{ id: 'employee', email: 'worker@example.com', schedule: null }]);
  const view = await render(<SchedulesScreen />);
  await act(async () => {});
  await fireEvent.press(view.getByText('worker@example.com'));
  expect(mockSave).not.toHaveBeenCalled();
  await fireEvent.changeText(view.getByLabelText('Fin (HH:mm)'), '07:00');
  await fireEvent.press(view.getByText('Guardar jornada'));
  expect(mockSave).not.toHaveBeenCalled();
  expect(view.getByRole('alert')).toBeTruthy();
  await fireEvent.changeText(view.getByLabelText('Fin (HH:mm)'), '17:00');
  mockSave.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined);
  await fireEvent.press(view.getByText('Guardar jornada'));
  expect(view.getByRole('alert')).toBeTruthy();
  await fireEvent.press(view.getByText('Guardar jornada'));
  expect(mockSave).toHaveBeenLastCalledWith({ userId: 'employee', weekdays: [1,2,3,4,5], startTime: '08:00', endTime: '17:00', timeZone: 'America/Argentina/Buenos_Aires' });
  expect(view.getByText('Seleccioná un empleado para configurar su jornada.')).toBeTruthy();
});
