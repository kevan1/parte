import { render } from '@testing-library/react-native';

import { CaptureEmptyState } from '@/components/chat/capture-empty-state';
import { CaptureTurnRow } from '@/components/chat/capture-turn-row';

describe('Home empty state [AC-15]', () => {
  it('uses the centered empty-state typography', async () => {
    const view = await render(<CaptureEmptyState />);

    expect(view.getByText('¿Qué hiciste hoy?')).toBeTruthy();
    expect(view.getByTestId('capture-empty-title').props.style).toEqual(
      expect.objectContaining({ fontSize: 26, fontWeight: '600', textAlign: 'center' }),
    );
  });

  it('uses a neutral right bubble for employees and plain full-width assistant text', async () => {
    const view = await render(
      <>
        <CaptureTurnRow turn={{ role: 'user', content: 'Trabajé una hora' }} />
        <CaptureTurnRow turn={{ role: 'assistant', content: '¿En qué proyecto?' }} />
      </>,
    );

    expect(view.getByTestId('capture-user-bubble').props.style).toEqual(
      expect.objectContaining({ maxWidth: '78%', borderRadius: 20 }),
    );
    expect(view.getByTestId('capture-assistant-row').props.style).toEqual(
      expect.objectContaining({ paddingHorizontal: 16 }),
    );
  });

  it('keeps selected evidence visible on the submitted user message', async () => {
    const view = await render(
      <CaptureTurnRow
        turn={{
          role: 'user',
          content: 'Trabajé en el tablero',
          attachments: [
            {
              id: 'ph://asset-1',
              fileName: 'tablero.jpg',
              width: 1200,
              height: 900,
              creationTime: null,
            },
          ],
        }}
      />,
    );

    expect(view.getByTestId('capture-user-attachments')).toBeTruthy();
    expect(view.getByTestId('capture-attachment-ph://asset-1')).toBeTruthy();
  });

  it('announces the typing indicator as extraction progress', async () => {
    const view = await render(
      <CaptureTurnRow
        turn={{ role: 'assistant', content: '' }}
        showTypingIndicator
      />,
    );

    expect(view.getByLabelText('Interpretando el registro')).toBeTruthy();
  });
});
