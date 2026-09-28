import { createLinkedAbortController } from '../../supabase/functions/_shared/linked-abort';

describe('Edge Function request cancellation [AC-9, AC-12]', () => {
  jest.useFakeTimers();

  it('aborts Gemini when the mobile invocation disconnects', () => {
    const requestController = new AbortController();
    const linked = createLinkedAbortController(requestController.signal, 15_000);

    requestController.abort();

    expect(linked.signal.aborted).toBe(true);
    linked.dispose();
  });

  it('retains the server timeout as a cancellation fallback', () => {
    const linked = createLinkedAbortController(new AbortController().signal, 15_000);

    jest.advanceTimersByTime(15_000);

    expect(linked.signal.aborted).toBe(true);
    linked.dispose();
  });
});
