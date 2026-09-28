import {
  listAssignableEmployees,
  assignTask,
} from '@/data/assignment-repository';
import { supabase } from '@/data/supabase';
import { RepositoryError } from '@/data/repository-error';

jest.mock('@/data/supabase', () => ({
  supabase: { rpc: jest.fn() },
}));

const mockRpc = supabase.rpc as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('listAssignableEmployees', () => {
  it('returns sorted name list from RPC result', async () => {
    mockRpc.mockResolvedValue({
      data: [
        { id: 'id-b', email: 'beta@example.com', schedule: null },
        { id: 'id-a', email: 'alpha@example.com', schedule: null },
      ],
      error: null,
    });
    const result = await listAssignableEmployees();
    expect(result).toHaveLength(2);
    // Sorted by name
    expect(result[0]!.name).toBe('Alpha');
    expect(result[1]!.name).toBe('Beta');
    expect(result[0]!.email).toBe('alpha@example.com');
    expect(result[0]!.id).toBe('id-a');
    expect(mockRpc).toHaveBeenCalledWith('list_employee_schedules');
  });

  it('returns empty array when RPC returns empty list', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    const result = await listAssignableEmployees();
    expect(result).toEqual([]);
  });

  it('returns empty array when RPC returns null', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    const result = await listAssignableEmployees();
    expect(result).toEqual([]);
  });

  it('derives name from email local part with dots and underscores', async () => {
    mockRpc.mockResolvedValue({
      data: [{ id: 'id-1', email: 'juan.perez@company.com', schedule: null }],
      error: null,
    });
    const [employee] = await listAssignableEmployees();
    expect(employee!.name).toBe('Juan Perez');
  });

  it('throws RepositoryError on RPC error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'offline', code: '42501' } });
    await expect(listAssignableEmployees()).rejects.toBeInstanceOf(RepositoryError);
  });
});

describe('assignTask', () => {
  it('calls assign_task RPC with correct params and returns result', async () => {
    mockRpc.mockResolvedValue({
      data: { workStreamId: 'ws-1', tokenCount: 2 },
      error: null,
    });
    const result = await assignTask({
      assigneeId: 'employee-id',
      projectName: 'Proyecto X',
      taskDescription: 'Tarea Y',
      requesterType: 'sector',
      requesterName: 'Sector Norte',
      materials: ['Cemento', 'Arena'],
    });
    expect(result).toEqual({ workStreamId: 'ws-1', tokenCount: 2 });
    expect(mockRpc).toHaveBeenCalledWith('assign_task', {
      p_assignee_id: 'employee-id',
      p_project_name: 'Proyecto X',
      p_task_description: 'Tarea Y',
      p_requester_type: 'sector',
      p_requester_name: 'Sector Norte',
      p_materials: ['Cemento', 'Arena'],
    });
  });

  it('preserves tokenCount: 0 in return value', async () => {
    mockRpc.mockResolvedValue({
      data: { workStreamId: 'ws-2', tokenCount: 0 },
      error: null,
    });
    const result = await assignTask({
      assigneeId: 'employee-id',
      projectName: 'Proyecto X',
      taskDescription: 'Tarea Z',
    });
    expect(result.tokenCount).toBe(0);
  });

  it('passes null for optional params when omitted', async () => {
    mockRpc.mockResolvedValue({
      data: { workStreamId: 'ws-3', tokenCount: 1 },
      error: null,
    });
    await assignTask({
      assigneeId: 'employee-id',
      projectName: 'Proyecto X',
      taskDescription: 'Descripción',
    });
    expect(mockRpc).toHaveBeenCalledWith('assign_task', expect.objectContaining({
      p_requester_type: null,
      p_requester_name: null,
      p_materials: null,
    }));
  });

  it('throws RepositoryError with user-visible message on 42501 error', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'Administrator required', code: '42501' },
    });
    await expect(
      assignTask({ assigneeId: 'id', projectName: 'X', taskDescription: 'Y' }),
    ).rejects.toBeInstanceOf(RepositoryError);
  });

  it('throws RepositoryError with user-visible message on 22023 error', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'Invalid assignee', code: '22023' },
    });
    const err = await assignTask({
      assigneeId: 'bad-id',
      projectName: 'X',
      taskDescription: 'Y',
    }).catch((e) => e);
    expect(err).toBeInstanceOf(RepositoryError);
    expect(err.message).toBeTruthy();
  });
});
