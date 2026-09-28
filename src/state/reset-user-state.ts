import { captureStore } from '@/state/capture';
import { historyStore } from '@/state/history';

export function resetUserState(): void {
  captureStore.getState().reset();
  historyStore.getState().reset();
}
