import { supabase } from '@/data/supabase';

export type WorkSchedule = {
  userId: string;
  /** ISO weekdays: Monday = 1, Sunday = 7. */
  weekdays: number[];
  startTime: string;
  endTime: string;
  timeZone: string;
};
export type AvailabilityOverride = {
  mode: 'available' | 'remote' | 'absent';
  /** Server-assigned local date; null for persistent manual availability. */
  date: string | null;
};
export type AvailabilitySnapshot = {
  schedule: WorkSchedule | null;
  override: AvailabilityOverride | null;
  isAdmin: boolean;
};
export type EmployeeSchedule = { id: string; email: string; schedule: WorkSchedule | null };

export async function getAvailability(): Promise<AvailabilitySnapshot> {
  const { data, error } = await supabase.rpc('get_employee_availability');
  if (error) throw error;
  if (!data) throw new Error('No se pudo cargar tu disponibilidad.');
  return data as AvailabilitySnapshot;
}

export async function setAvailability(
  mode: 'available' | 'remote' | 'absent' | 'automatic',
): Promise<AvailabilitySnapshot> {
  const { data, error } = await supabase.rpc('set_employee_availability', { p_mode: mode });
  if (error) throw error;
  if (!data) throw new Error('No se pudo guardar tu disponibilidad.');
  return data as AvailabilitySnapshot;
}

export async function listEmployeeSchedules(): Promise<EmployeeSchedule[]> {
  const { data, error } = await supabase.rpc('list_employee_schedules');
  if (error) throw error;
  return (data ?? []) as EmployeeSchedule[];
}

export async function saveEmployeeSchedule(schedule: WorkSchedule): Promise<void> {
  const { error } = await supabase.rpc('save_employee_schedule', {
    p_user_id: schedule.userId,
    p_weekdays: schedule.weekdays,
    p_start_time: schedule.startTime,
    p_end_time: schedule.endTime,
    p_time_zone: schedule.timeZone,
  });
  if (error) throw error;
}
