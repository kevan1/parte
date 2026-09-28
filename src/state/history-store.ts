import { createStore } from 'zustand/vanilla';

import type { TimeEntry } from '@/domain/types';
import { addDays, buildWeekSummary, mondayForDate, todayInTimeZone } from '@/domain/week-summary';

type HistoryStatus = 'idle' | 'loading' | 'success' | 'error';

export type HistoryState = {
  status: HistoryStatus;
  entries: TimeEntry[];
  errorMessage: string | null;
  isStale: boolean;
  load: () => Promise<void>;
  markStale: () => void;
  reset: () => void;
};

export function createHistoryStore(dependencies: {
  list: (monday: string, sunday: string) => Promise<TimeEntry[]>;
  today: () => string;
}) {
  let generation = 0;

  return createStore<HistoryState>((set, get) => ({
    status: 'idle',
    entries: [],
    errorMessage: null,
    isStale: false,
    load: async () => {
      if (get().status === 'loading') return;
      set({ status: 'loading', errorMessage: null });
      const requestGeneration = generation;
      const today = dependencies.today();
      const monday = mondayForDate(today);
      try {
        const entries = await dependencies.list(monday, addDays(monday, 6));
        if (requestGeneration !== generation) return;
        set({ status: 'success', entries, errorMessage: null, isStale: false });
      } catch {
        if (requestGeneration !== generation) return;
        set({
          status: 'error',
          errorMessage: 'No pudimos cargar tus horas. Revisá la conexión.',
          isStale: get().entries.length > 0,
        });
      }
    },
    markStale: () => set({ isStale: true }),
    reset: () => {
      generation += 1;
      set({ status: 'idle', entries: [], errorMessage: null, isStale: false });
    },
  }));
}

export function summaryForHistory(entries: TimeEntry[]) {
  return buildWeekSummary(entries, todayInTimeZone());
}
