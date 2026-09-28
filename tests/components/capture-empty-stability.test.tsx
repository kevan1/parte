import { act, render } from '@testing-library/react-native';
import { CaptureEmptyState } from '@/components/chat/capture-empty-state';

it('shows one short example and keeps it stable over time', async () => {
  jest.useFakeTimers();
  try {
    const view = await render(<CaptureEmptyState />);
    expect(view.getAllByText('Hoy dediqué 2 horas a revisar una válvula en la línea de llenado.')).toHaveLength(1);
    expect(view.queryByText('Formato recomendado:')).toBeNull();
    await act(async () => { jest.advanceTimersByTime(20000); });
    expect(view.getAllByText('Hoy dediqué 2 horas a revisar una válvula en la línea de llenado.')).toHaveLength(1);
  } finally { jest.useRealTimers(); }
});
