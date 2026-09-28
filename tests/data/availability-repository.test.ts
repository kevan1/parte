import { getAvailability, setAvailability, listEmployeeSchedules, saveEmployeeSchedule } from '@/data/availability-repository';
import { supabase } from '@/data/supabase';

const rpc = jest.spyOn(supabase, 'rpc');
const snapshot = { schedule: null, override: null, isAdmin: false };
beforeEach(() => rpc.mockReset());
it('loads the authoritative current-user snapshot', async () => {
  rpc.mockResolvedValue({ data: snapshot, error: null } as never);
  expect(await getAvailability()).toEqual(snapshot);
  expect(rpc).toHaveBeenCalledWith('get_employee_availability');
});
it('sends only the selected mode; never an identity or client date', async () => {
  rpc.mockResolvedValue({ data: snapshot, error: null } as never);
  await setAvailability('remote');
  expect(rpc).toHaveBeenCalledWith('set_employee_availability', { p_mode: 'remote' });
});
it('preserves failed writes for retry instead of returning success', async () => {
  const error = { message: 'offline' };
  rpc.mockResolvedValue({ data: null, error } as never);
  await expect(setAvailability('available')).rejects.toEqual(error);
});
it('loads schedules through the admin RPC', async () => {
  rpc.mockResolvedValue({ data: [], error: null } as never);
  expect(await listEmployeeSchedules()).toEqual([]);
  expect(rpc).toHaveBeenCalledWith('list_employee_schedules');
});
it('sends an explicit employee schedule to the admin RPC', async () => {
  rpc.mockResolvedValue({ data: null, error: null } as never);
  await saveEmployeeSchedule({ userId: 'a', weekdays: [1,2,3,4,5], startTime: '08:00', endTime: '17:00', timeZone: 'America/Argentina/Buenos_Aires' });
  expect(rpc).toHaveBeenCalledWith('save_employee_schedule', { p_user_id: 'a', p_weekdays: [1,2,3,4,5], p_start_time: '08:00', p_end_time: '17:00', p_time_zone: 'America/Argentina/Buenos_Aires' });
});
