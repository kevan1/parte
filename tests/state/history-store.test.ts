import { createHistoryStore } from '@/state/history-store';
import type { TimeEntry } from '@/domain/types';

const entry: TimeEntry = {
  id: 'entry-1',
  userId: 'user-1',
  workStreamId: 'stream-1',
  workDate: '2026-08-13',
  durationMinutes: 90,
  startTime: null,
  endTime: null,
  projectName: 'Horas',
  taskDescription: 'Pruebas',
  notes: null,
  createdAt: '2026-08-13T15:00:00Z',
  updatedAt: '2026-08-13T15:00:00Z',
};

describe('history store [AC-10, AC-12]', () => {
  it('loads the current Monday-to-Sunday range', async () => {
    const list = jest.fn().mockResolvedValue([entry]);
    const store = createHistoryStore({ list, today: () => '2026-08-13' });
    await store.getState().load();

    expect(list).toHaveBeenCalledWith('2026-08-10', '2026-08-16');
    expect(store.getState()).toMatchObject({ status: 'success', entries: [entry], isStale: false });
  });

  it('retains stale entries after a refresh failure and exposes retry state', async () => {
    const list = jest.fn().mockResolvedValueOnce([entry]).mockRejectedValueOnce(new Error('offline'));
    const store = createHistoryStore({ list, today: () => '2026-08-13' });
    await store.getState().load();
    await store.getState().load();

    expect(store.getState()).toMatchObject({
      status: 'error',
      entries: [entry],
      isStale: true,
    });
  });

  it('clears cached entries and discards a prior session request after reset', async () => {
    let resolveList!: (entries: TimeEntry[]) => void;
    const list = jest.fn().mockReturnValue(
      new Promise<TimeEntry[]>((resolve) => {
        resolveList = resolve;
      }),
    );
    const store = createHistoryStore({ list, today: () => '2026-08-13' });

    const pending = store.getState().load();
    store.getState().reset();
    resolveList([entry]);
    await pending;

    expect(store.getState()).toMatchObject({ status: 'idle', entries: [], isStale: false });
  });
});
