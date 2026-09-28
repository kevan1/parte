import { useStore } from 'zustand';

import { listTimeEntries } from '@/data/time-entry-repository';
import { todayInTimeZone } from '@/domain/week-summary';
import { createHistoryStore } from '@/state/history-store';

export const historyStore = createHistoryStore({ list: listTimeEntries, today: todayInTimeZone });

export function useHistoryStore<T>(selector: (state: ReturnType<typeof historyStore.getState>) => T) {
  return useStore(historyStore, selector);
}
