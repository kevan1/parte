import { createChunkedSecureStorage, type SecureStorePort } from '@/data/secure-storage';

function memoryStore(): SecureStorePort & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getItemAsync: async (key) => values.get(key) ?? null,
    setItemAsync: async (key, value) => {
      values.set(key, value);
    },
    deleteItemAsync: async (key) => {
      values.delete(key);
    },
  };
}

describe('chunked secure session storage [AC-1, AC-13]', () => {
  it('round-trips a session larger than a single SecureStore item', async () => {
    const port = memoryStore();
    const storage = createChunkedSecureStorage(port, { chunkSize: 10 });
    const session = JSON.stringify({ access_token: 'x'.repeat(48), refresh_token: 'y'.repeat(24) });

    await storage.setItem('supabase.session', session);

    expect(await storage.getItem('supabase.session')).toBe(session);
    expect([...port.values.keys()].filter((key) => key.includes('.chunk.')).length).toBeGreaterThan(1);
  });

  it('removes stale chunks when replacing or deleting a value', async () => {
    const port = memoryStore();
    const storage = createChunkedSecureStorage(port, { chunkSize: 5 });
    await storage.setItem('session', 'a'.repeat(30));
    await storage.setItem('session', 'short');

    expect([...port.values.keys()].filter((key) => key.includes('.chunk.'))).toHaveLength(1);
    await storage.removeItem('session');
    expect(port.values.size).toBe(0);
  });

  it('writes session chunks with a device-only unlocked keychain policy', async () => {
    const options: unknown[] = [];
    const port = memoryStore();
    port.setItemAsync = async (key, value, writeOptions) => {
      port.values.set(key, value);
      options.push(writeOptions);
    };

    await createChunkedSecureStorage(port, { chunkSize: 5 }).setItem('session', 'secret');

    expect(options).toHaveLength(3);
    expect(options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ keychainAccessible: expect.anything() }),
      ]),
    );
  });
});
