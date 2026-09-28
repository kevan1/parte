import * as SecureStore from 'expo-secure-store';

export type SecureStorePort = Pick<
  typeof SecureStore,
  'getItemAsync' | 'setItemAsync' | 'deleteItemAsync'
>;

type StorageOptions = {
  chunkSize?: number;
};

const MANIFEST_SUFFIX = '.manifest';
const CHUNK_SUFFIX = '.chunk.';

export function createChunkedSecureStorage(
  port: SecureStorePort,
  options: StorageOptions = {},
) {
  const chunkSize = options.chunkSize ?? 1_800;
  if (!Number.isInteger(chunkSize) || chunkSize < 1) throw new Error('invalid chunk size');

  const manifestKey = (key: string) => `${key}${MANIFEST_SUFFIX}`;
  const chunkKey = (key: string, index: number) => `${key}${CHUNK_SUFFIX}${index}`;

  async function previousCount(key: string): Promise<number> {
    const raw = await port.getItemAsync(manifestKey(key));
    const value = Number(raw);
    return Number.isInteger(value) && value > 0 ? value : 0;
  }

  return {
    async getItem(key: string): Promise<string | null> {
      const count = await previousCount(key);
      if (count === 0) return null;
      const chunks = await Promise.all(
        Array.from({ length: count }, (_, index) => port.getItemAsync(chunkKey(key, index))),
      );
      if (chunks.some((chunk) => chunk === null)) {
        await this.removeItem(key);
        return null;
      }
      return chunks.join('');
    },

    async setItem(key: string, value: string): Promise<void> {
      const oldCount = await previousCount(key);
      const chunks = value.match(new RegExp(`[\\s\\S]{1,${chunkSize}}`, 'g')) ?? [''];
      await Promise.all(
        chunks.map((chunk, index) =>
          port.setItemAsync(chunkKey(key, index), chunk, {
            keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
          }),
        ),
      );
      await port.setItemAsync(manifestKey(key), String(chunks.length), {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
      await Promise.all(
        Array.from(
          { length: Math.max(oldCount - chunks.length, 0) },
          (_, offset) => port.deleteItemAsync(chunkKey(key, chunks.length + offset)),
        ),
      );
    },

    async removeItem(key: string): Promise<void> {
      const count = await previousCount(key);
      await Promise.all([
        ...Array.from({ length: count }, (_, index) => port.deleteItemAsync(chunkKey(key, index))),
        port.deleteItemAsync(manifestKey(key)),
      ]);
    },
  };
}

export const secureSessionStorage = createChunkedSecureStorage(SecureStore);
