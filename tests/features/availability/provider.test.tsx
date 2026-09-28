// Covers AC-AV-3, AC-AV-5
import { act, fireEvent, render } from '@testing-library/react-native';
import { AppState, Pressable, Text, type AppStateStatus } from 'react-native';
import { AvailabilityIndicator } from '@/features/availability/availability-indicator';
import { AvailabilityStateProvider, useAvailability } from '@/features/availability/availability-provider';

const mockRead = jest.fn();
const mockSave = jest.fn();
jest.mock('@/data/availability-repository', () => ({ getAvailability: () => mockRead(), setAvailability: (mode: string) => mockSave(mode) }));
jest.mock('@/providers/session-provider', () => ({ useSession: () => ({ session: null }) }));
function Probe() {
  const state = useAvailability();
  return <><Text>{state.label}</Text><Pressable accessibilityRole="button" accessibilityLabel="manual" onPress={() => void state.change('available').catch(() => {})} /><Pressable accessibilityRole="button" accessibilityLabel="refresh" onPress={() => void state.refresh()} /></>;
}
const schedule = { userId: 'u1', weekdays: [1,2,3,4,5], startTime: '08:00', endTime: '17:00', timeZone: 'America/Argentina/Buenos_Aires' };
beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date('2026-09-09T10:59:00Z')); mockRead.mockReset(); mockSave.mockReset(); });
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });
it('updates both consumers at the schedule boundary without another server write', async () => {
  mockRead.mockResolvedValue({ schedule, override: null, isAdmin: false });
  const view = await render(<AvailabilityStateProvider userId="u1"><Probe /><Probe /></AvailabilityStateProvider>);
  await act(async () => {});
  expect(view.getAllByText('Fuera de horario')).toHaveLength(2);
  await act(async () => { jest.advanceTimersByTime(60000); });
  expect(view.getAllByText('Disponible')).toHaveLength(2);
  expect(mockSave).not.toHaveBeenCalled();
});
it('waits for persistence and preserves the old status after a failed write', async () => {
  mockRead.mockResolvedValue({ schedule, override: null, isAdmin: false });
  let reject!: (error: Error) => void;
  mockSave.mockReturnValue(new Promise((_resolve, fail) => { reject = fail; }));
  const view = await render(<AvailabilityStateProvider userId="u1"><Probe /></AvailabilityStateProvider>);
  await act(async () => {});
  await fireEvent.press(view.getByLabelText('manual'));
  expect(view.getByText('Fuera de horario')).toBeTruthy();
  await act(async () => reject(new Error('offline')));
  expect(view.getByText('Fuera de horario')).toBeTruthy();
});
it('discards an older refresh after a successful manual change', async () => {
  mockRead.mockResolvedValueOnce({ schedule, override: null, isAdmin: false });
  const view = await render(<AvailabilityStateProvider userId="u1"><Probe /></AvailabilityStateProvider>);
  await act(async () => {});
  let stale!: (value: unknown) => void;
  mockRead.mockReturnValueOnce(new Promise((resolve) => { stale = resolve; }));
  await fireEvent.press(view.getByLabelText('refresh'));
  mockSave.mockResolvedValue({ schedule, override: { mode: 'available', date: null }, isAdmin: false });
  await fireEvent.press(view.getByLabelText('manual'));
  expect(view.getByText('Disponible')).toBeTruthy();
  await act(async () => stale({ schedule, override: null, isAdmin: false }));
  expect(view.getByText('Disponible')).toBeTruthy();
});
it('does not carry another account snapshot into a newly keyed provider', async () => {
  let oldRead!: (value: unknown) => void;
  mockRead.mockReturnValueOnce(new Promise((resolve) => { oldRead = resolve; }));
  const view = await render(<AvailabilityStateProvider key="u1" userId="u1"><Probe /></AvailabilityStateProvider>);
  await act(async () => {});
  mockRead.mockResolvedValue({ schedule: null, override: null, isAdmin: false });
  await view.rerender(<AvailabilityStateProvider key="u2" userId="u2"><Probe /></AvailabilityStateProvider>);
  await act(async () => {});
  await act(async () => oldRead({ schedule, override: { mode: 'available', date: null }, isAdmin: true }));
  expect(view.getByText('Jornada sin configurar')).toBeTruthy();
  expect(view.queryByText('Disponible')).toBeNull();
});

it('refreshes persisted state when the app returns to the foreground [AC-AV-5]', async () => {
  let resume!: (state: AppStateStatus) => void;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => { resume = callback; return { remove: jest.fn() }; });
  mockRead.mockResolvedValueOnce({ schedule, override: null, isAdmin: false });
  const view = await render(<AvailabilityStateProvider userId="u1"><Probe /></AvailabilityStateProvider>);
  await act(async () => {});
  expect(view.getByText('Fuera de horario')).toBeTruthy();
  mockRead.mockResolvedValueOnce({ schedule, override: { mode: 'available', date: null }, isAdmin: false });
  await act(async () => resume('active'));
  expect(view.getByText('Disponible')).toBeTruthy();
  expect(mockRead).toHaveBeenCalledTimes(2);
});

function FailureProbe() {
  const state = useAvailability();
  return <><Probe /><Text testID="failure-kind">{state.kind}</Text><Text>{state.error}</Text><AvailabilityIndicator variant="header" /></>;
}

it.each([
  [{ code: 'PGRST202', message: 'private RPC details' }, 'unavailable', 'No disponible', 'La disponibilidad todavía no está habilitada.'],
  [{ code: '42501', message: 'private permission details' }, 'unavailable', 'No disponible', 'No pudimos cargar tu disponibilidad. Intentá nuevamente.'],
  [{ message: 'TypeError: Network request failed', code: '' }, 'offline', 'Sin conexión', 'No pudimos conectar. Revisá tu conexión e intentá nuevamente.'],
  [new TypeError('Failed to fetch'), 'offline', 'Sin conexión', 'No pudimos conectar. Revisá tu conexión e intentá nuevamente.'],
])('classifies availability failures without exposing server details: %p', async (failure, kind, header, message) => {
  mockRead.mockRejectedValueOnce(failure);
  const view = await render(<AvailabilityStateProvider userId="u1"><FailureProbe /></AvailabilityStateProvider>);
  await act(async () => {});
  expect(view.getByTestId('failure-kind').props.children).toBe(kind);
  expect(view.getByText(header)).toBeTruthy();
  expect(view.getByText(message)).toBeTruthy();
  expect(view.queryByText(/private/)).toBeNull();
  if (kind === 'unavailable') expect(view.queryByText('Sin conexión')).toBeNull();
  mockRead.mockResolvedValueOnce({ schedule, override: null, isAdmin: false });
  await fireEvent.press(view.getByLabelText('refresh'));
  expect(view.getAllByText('Fuera de horario')).toHaveLength(2);
  expect(view.queryByText(message)).toBeNull();
});
