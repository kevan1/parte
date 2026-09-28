// Covers AC-AV-2, AC-AV-3
import { act, fireEvent, render } from '@testing-library/react-native';
import { AvailabilityScreen } from '@/features/availability/availability-screen';
const mockBack = jest.fn();
const mockChange = jest.fn();
const mockRefresh = jest.fn();
let mockState: Record<string, unknown>;
jest.mock('expo-router', () => ({ Stack: { Screen: () => null }, useRouter: () => ({ back: mockBack }) }));
jest.mock('@/features/availability/availability-provider', () => ({ useAvailability: () => mockState }));
beforeEach(() => {
  mockBack.mockReset(); mockChange.mockReset(); mockRefresh.mockReset();
  mockState = { snapshot: { schedule: { weekdays: [1,2,3,4,5], startTime: '08:00', endTime: '17:00', timeZone: 'America/Argentina/Buenos_Aires' }, override: null, isAdmin: false }, now: new Date('2026-09-09T14:00:00Z'), kind: 'available', label: 'Disponible', manual: false, loading: false, saving: false, error: null, change: mockChange, refresh: mockRefresh };
});
it('waits for a successful save and prevents duplicate taps before closing', async () => {
  let finish!: () => void;
  mockChange.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
  const view = await render(<AvailabilityScreen />);
  await fireEvent.press(view.getByRole('button', { name: /Remoto/ }));
  await fireEvent.press(view.getByRole('button', { name: /Remoto/ }));
  expect(mockChange).toHaveBeenCalledTimes(1);
  expect(mockBack).not.toHaveBeenCalled();
  await act(async () => finish());
  expect(mockBack).toHaveBeenCalledTimes(1);
});
it('keeps the sheet open after failure and allows retry', async () => {
  mockChange.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined);
  const view = await render(<AvailabilityScreen />);
  await fireEvent.press(view.getByRole('button', { name: /Ausente/ }));
  expect(view.getByRole('alert')).toBeTruthy();
  expect(mockBack).not.toHaveBeenCalled();
  await fireEvent.press(view.getByRole('button', { name: /Ausente/ }));
  expect(mockBack).toHaveBeenCalledTimes(1);
});
it('does not navigate after unmount while a write finishes', async () => {
  let finish!: () => void;
  mockChange.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
  const view = await render(<AvailabilityScreen />);
  await fireEvent.press(view.getByRole('button', { name: /Remoto/ }));
  await view.unmount();
  await act(async () => finish());
  expect(mockBack).not.toHaveBeenCalled();
});
it('offers manual availability without a schedule and explains its lifetime', async () => {
  mockState.snapshot = { schedule: null, override: null, isAdmin: false };
  const view = await render(<AvailabilityScreen />);
  expect(view.getByText('Se mantendrá hasta que lo cambies')).toBeTruthy();
  expect(view.getByRole('button', { name: /Remoto/ }).props.accessibilityState.disabled).toBe(true);
  mockChange.mockResolvedValue(undefined);
  await fireEvent.press(view.getByRole('button', { name: /Volver al horario automático/ }));
  expect(mockChange).toHaveBeenCalledWith('automatic');
});
