import {
  completeWorkStream,
  confirmTimeEntries,
} from '@/data/time-entry-repository';

const mockRpc = jest.fn();
const mockGetUser = jest.fn();
const mockUpdate = jest.fn();
const mockEq = jest.fn();
const mockSelect = jest.fn();

let fromCallCount = 0;

jest.mock('@/data/supabase', () => {
  const chain = {
    update: (...args: unknown[]) => {
      mockUpdate(...args);
      return chain;
    },
    eq: (...args: unknown[]) => {
      mockEq(...args);
      return chain;
    },
    select: (...args: unknown[]) => {
      mockSelect(...args);
      return Promise.resolve(mockFromSelectResult);
    },
  };

  const mockFrom = jest.fn(() => chain);

  return {
    supabase: {
      rpc: (...args: unknown[]) => mockRpc(...args),
      auth: {
        getUser: (...args: unknown[]) => mockGetUser(...args),
      },
      from: (table: string) => {
        fromCallCount += 1;
        return mockFrom();
      },
    },
  };
});

let mockFromSelectResult: { data: { id: string }[] | null; error: { code?: string; message?: string } | null };

describe('completeWorkStream', () => {
  beforeEach(() => {
    mockRpc.mockReset();
    mockGetUser.mockReset();
    mockUpdate.mockReset();
    mockEq.mockReset();
    mockSelect.mockReset();
    fromCallCount = 0;
    mockFromSelectResult = { data: [{ id: 'stream-1' }], error: null };
  });

  it('uses the server RPC when available', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    await expect(completeWorkStream('11111111-1111-1111-1111-111111111111')).resolves.toBeUndefined();

    expect(mockRpc).toHaveBeenCalledWith('set_work_stream_status', {
      p_work_stream_id: '11111111-1111-1111-1111-111111111111',
      p_status: 'completed',
    });
    expect(fromCallCount).toBe(0);
  });

  it('falls back to update when the RPC is missing', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: '42883', message: 'function set_work_stream_status(p_uuid,public.work_stream_status) does not exist' },
    });
    mockGetUser.mockResolvedValue({ data: { user: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' } }, error: null });
    mockFromSelectResult = { data: [{ id: '11111111-1111-1111-1111-111111111111' }], error: null };

    await expect(completeWorkStream('11111111-1111-1111-1111-111111111111')).resolves.toBeUndefined();

    expect(fromCallCount).toBe(1);
    expect(mockUpdate).toHaveBeenCalledWith({
      status: 'completed',
      completed_at: expect.any(String),
    });
    expect(mockEq).toHaveBeenCalledWith('user_id', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    expect(mockSelect).toHaveBeenCalledWith('id');
  });

  it('returns a migration guidance error when status columns are missing', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: '42883', message: 'function set_work_stream_status(p_uuid,public.work_stream_status) does not exist' },
    });
    mockGetUser.mockResolvedValue({ data: { user: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' } }, error: null });
    mockFromSelectResult = {
      data: null,
      error: { code: '42703', message: 'column work_streams.status does not exist' },
    };

    await expect(
      completeWorkStream('11111111-1111-1111-1111-111111111111'),
    ).rejects.toMatchObject({
      message: expect.stringContaining('estado de tareas habilitado'),
      code: 'WORK_STREAM_UPDATE_NOT_SUPPORTED',
    });
  });

  it('falls back to update when the RPC returns permission errors', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'permission denied for relation work_streams' },
    });
    mockGetUser.mockResolvedValue({ data: { user: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' } }, error: null });
    mockFromSelectResult = { data: [{ id: '11111111-1111-1111-1111-111111111111' }], error: null };

    await expect(completeWorkStream('11111111-1111-1111-1111-111111111111')).resolves.toBeUndefined();

    expect(fromCallCount).toBe(1);
    expect(mockUpdate).toHaveBeenCalledWith({
      status: 'completed',
      completed_at: expect.any(String),
    });
  });
});

describe('confirmTimeEntries metadata', () => {
  beforeEach(() => {
    mockRpc.mockReset();
    mockRpc.mockResolvedValue({ data: [], error: null });
  });

  it('passes requester and materials only as structured task metadata', async () => {
    await confirmTimeEntries('22222222-2222-4222-8222-222222222222', [
      {
        clientId: '33333333-3333-4333-8333-333333333333',
        workDate: '2026-08-14',
        durationMinutes: 60,
        durationInput: '1',
        startTime: null,
        endTime: null,
        projectName: 'Planta Norte',
        taskDescription: 'Cambiar tablero',
        notes: null,
        requesterType: 'person',
        requesterName: 'María García',
        materials: ['Tornillos', 'Cable 4 mm'],
        suggestedWorkStreamId: null,
        suggestedWorkStream: null,
        selectedWorkStreamId: null,
        continuityChoice: 'new',
      },
    ]);

    expect(mockRpc).toHaveBeenCalledWith('confirm_time_entries', {
      p_submission_id: '22222222-2222-4222-8222-222222222222',
      p_drafts: [
        expect.objectContaining({
          requesterType: 'person',
          requesterName: 'María García',
          materials: ['Tornillos', 'Cable 4 mm'],
        }),
      ],
    });
  });
});
