import { create } from 'zustand';
import { secureSessionStorage } from '@/data/secure-storage';

const ONBOARDING_COMPLETED_KEY = 'parte.onboarding.completed';

type OnboardingStorage = Pick<typeof secureSessionStorage, 'getItem' | 'setItem'>;
type OnboardingState = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  loading: boolean;
  error: string | null;
  completed: boolean;
  hydrate: () => Promise<void>;
  complete: () => Promise<void>;
};

export function createOnboardingStore(storage: OnboardingStorage) {
  let hydration: Promise<void> | null = null;
  let completion: Promise<void> | null = null;
  return create<OnboardingState>((set, get) => ({
    status: 'idle',
    loading: false,
    error: null,
    completed: false,
    hydrate: () => {
      if (hydration) return hydration;
      if (get().status === 'ready') return Promise.resolve();
      set({ status: 'loading', loading: true, error: null });
      hydration = (async () => {
        try {
          const stored = await storage.getItem(ONBOARDING_COMPLETED_KEY);
          set({ completed: get().completed || stored === '1', status: 'ready', error: null });
        } catch {
          if (!get().completed) set({ status: 'error', error: 'No pudimos cargar el inicio.' });
        } finally {
          set({ loading: false });
          hydration = null;
        }
      })();
      return hydration;
    },
    complete: () => {
      if (completion) return completion;
      if (get().completed) return Promise.resolve();
      completion = (async () => {
        try {
          await storage.setItem(ONBOARDING_COMPLETED_KEY, '1');
          set({ completed: true, status: 'ready', loading: false, error: null });
        } finally {
          completion = null;
        }
      })();
      return completion;
    },
  }));
}

export const useOnboardingStore = createOnboardingStore(secureSessionStorage);

export async function hasCompletedOnboarding(): Promise<boolean> {
  const stored = await secureSessionStorage.getItem(ONBOARDING_COMPLETED_KEY);
  return stored === '1';
}

export async function setOnboardingCompleted(): Promise<void> {
  await useOnboardingStore.getState().complete();
}
