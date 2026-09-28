export type LinkedAbortController = {
  signal: AbortSignal;
  dispose: () => void;
};

export function createLinkedAbortController(
  requestSignal: AbortSignal,
  timeoutMs: number,
): LinkedAbortController {
  const controller = new AbortController();
  const abortFromRequest = () => controller.abort(requestSignal.reason);

  if (requestSignal.aborted) {
    abortFromRequest();
  } else {
    requestSignal.addEventListener('abort', abortFromRequest, { once: true });
  }

  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timeout);
      requestSignal.removeEventListener('abort', abortFromRequest);
    },
  };
}
