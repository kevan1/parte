import * as Crypto from 'expo-crypto';
import { useStore } from 'zustand';

import { confirmTimeEntries, extractTimeEntries } from '@/data/time-entry-repository';
import { createCaptureStore } from '@/state/capture-store';
import { historyStore } from '@/state/history';

export const captureStore = createCaptureStore({
  extract: extractTimeEntries,
  confirm: confirmTimeEntries,
  createSubmissionId: Crypto.randomUUID,
  onConfirmed: () => historyStore.getState().markStale(),
});

export function useCaptureStore<T>(selector: (state: ReturnType<typeof captureStore.getState>) => T) {
  return useStore(captureStore, selector);
}
