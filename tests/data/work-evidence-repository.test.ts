import { persistWorkEvidence } from '@/data/work-evidence-repository';

const mockGetInfo = jest.fn();
const mockUpload = jest.fn();
const mockInsert = jest.fn();
const mockExistingRows = jest.fn();

jest.mock('expo-media-library', () => ({
  Asset: jest.fn().mockImplementation(() => ({ getInfo: mockGetInfo })),
}));

jest.mock('@/data/supabase', () => {
  const query: Record<string, jest.Mock> = {};
  query.select = jest.fn(() => query);
  query.eq = jest.fn(() => query);
  query.in = jest.fn(() => mockExistingRows());
  query.insert = jest.fn((...args: unknown[]) => mockInsert(...args));

  return {
    supabase: {
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
      },
      from: jest.fn(() => query),
      storage: {
        from: jest.fn(() => ({ upload: (...args: unknown[]) => mockUpload(...args) })),
      },
    },
  };
});

describe('work evidence repository', () => {
  beforeEach(() => {
    mockGetInfo.mockReset();
    mockUpload.mockReset();
    mockInsert.mockReset();
    mockExistingRows.mockReset();
    mockExistingRows.mockResolvedValue({ data: [], error: null });
    mockGetInfo.mockResolvedValue({
      filename: 'tablero.jpg',
      uri: 'file:///tmp/tablero.jpg',
      width: 1200,
      height: 900,
    });
    mockUpload.mockResolvedValue({ data: { path: 'user-1/stream-1/ph_asset-1.jpg' }, error: null });
    mockInsert.mockResolvedValue({ data: null, error: null });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(1024),
    }) as unknown as typeof fetch;
  });

  it('resolves local assets, uploads them privately, and records their relation', async () => {
    await persistWorkEvidence(
      ['stream-1'],
      [{
        id: 'ph://asset-1',
        fileName: 'tablero.jpg',
        width: 1200,
        height: 900,
        creationTime: 1_755_000_000_000,
      }],
    );

    expect(mockGetInfo).toHaveBeenCalledWith();
    expect(mockUpload).toHaveBeenCalledWith(
      'user-1/stream-1/ph___asset-1.jpg',
      expect.objectContaining({ byteLength: 1024 }),
      expect.objectContaining({ contentType: 'image/jpeg', upsert: true }),
    );
    expect(mockInsert).toHaveBeenCalledWith([
      expect.objectContaining({
        user_id: 'user-1',
        work_stream_id: 'stream-1',
        source_asset_id: 'ph://asset-1',
        storage_path: 'user-1/stream-1/ph___asset-1.jpg',
      }),
    ]);
  });

  it('does not upload evidence already linked to the work stream', async () => {
    mockExistingRows.mockResolvedValueOnce({
      data: [{ work_stream_id: 'stream-1', source_asset_id: 'ph://asset-1' }],
      error: null,
    });

    await persistWorkEvidence(
      ['stream-1'],
      [{ id: 'ph://asset-1', fileName: 'tablero.jpg', width: 1, height: 1, creationTime: null }],
    );

    expect(mockGetInfo).not.toHaveBeenCalled();
    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
