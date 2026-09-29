import { createOnboardingStore } from '@/data/onboarding-store';

jest.mock('@/data/secure-storage', () => ({ secureSessionStorage: { getItem: jest.fn(), setItem: jest.fn() } }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('onboarding persistence [AC-ON-3, AC-ON-4, AC-ON-5]', () => {
  it.each([['1', true], [null, false]])('hydrates %s without session history', async (value, completed) => {
    const getItem = jest.fn().mockResolvedValue(value);
    const store = createOnboardingStore({ getItem, setItem: jest.fn() });
    await store.getState().hydrate();
    expect(getItem).toHaveBeenCalledWith('horas.onboarding.completed');
    expect(store.getState()).toMatchObject({ completed, status: 'ready', loading: false });
  });

  it('deduplicates reads and exposes recoverable read failures', async () => {
    const pending = deferred<string | null>();
    const getItem = jest.fn().mockReturnValueOnce(pending.promise).mockRejectedValueOnce(new Error('locked')).mockResolvedValue('1');
    const store = createOnboardingStore({ getItem, setItem: jest.fn() });
    const a = store.getState().hydrate();
    const b = store.getState().hydrate();
    expect(getItem).toHaveBeenCalledTimes(1);
    pending.resolve(null);
    await Promise.all([a, b]);
    store.setState({ status: 'idle' });
    await store.getState().hydrate();
    expect(store.getState()).toMatchObject({ status: 'error', loading: false, completed: false });
    await store.getState().hydrate();
    expect(store.getState()).toMatchObject({ status: 'ready', error: null, completed: true });
  });

  it('persists only once for rapid completion and marks complete after the write', async () => {
    const pending = deferred<void>();
    const setItem = jest.fn().mockReturnValue(pending.promise);
    const store = createOnboardingStore({ getItem: jest.fn(), setItem });
    const a = store.getState().complete();
    const b = store.getState().complete();
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(store.getState().completed).toBe(false);
    pending.resolve();
    await Promise.all([a, b]);
    expect(setItem).toHaveBeenCalledWith('horas.onboarding.completed', '1');
    expect(store.getState().completed).toBe(true);
  });

  it('rejects failed writes and permits retry', async () => {
    const setItem = jest.fn().mockRejectedValueOnce(new Error('locked')).mockResolvedValue(undefined);
    const store = createOnboardingStore({ getItem: jest.fn(), setItem });
    await expect(store.getState().complete()).rejects.toThrow('locked');
    expect(store.getState().completed).toBe(false);
    await store.getState().complete();
    expect(store.getState().completed).toBe(true);
  });

  it('does not let an older hydration overwrite successful completion', async () => {
    const pending = deferred<string | null>();
    const store = createOnboardingStore({ getItem: () => pending.promise, setItem: jest.fn().mockResolvedValue(undefined) });
    const hydration = store.getState().hydrate();
    await store.getState().complete();
    pending.resolve(null);
    await hydration;
    expect(store.getState()).toMatchObject({ completed: true, status: 'ready' });
  });
});
