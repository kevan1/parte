// Covers AC-PUSH-1, AC-PUSH-3, AC-PUSH-4, AC-PUSH-5.
import { act, fireEvent, render } from '@testing-library/react-native';
import { NotificationTestCard } from '@/features/notifications/notification-test-card';

const mockSend = jest.fn();
const mockReceipt = jest.fn();
const mockConfigure = jest.fn();
jest.mock('@/features/notifications/push-test-service', () => ({
  configureForegroundNotifications: () => mockConfigure(),
  sendTestPush: () => mockSend(),
  getTestPushReceipt: (id: string) => mockReceipt(id),
}));
beforeEach(() => { mockSend.mockReset(); mockReceipt.mockReset(); mockConfigure.mockReset(); });
it('only sends on press and prevents a concurrent duplicate', async () => {
  let resolve!: (value: { ticketId: string }) => void;
  mockSend.mockReturnValue(new Promise((done) => { resolve = done; }));
  const view = await render(<NotificationTestCard />);
  expect(mockSend).not.toHaveBeenCalled();
  await fireEvent.press(view.getByRole('button', { name: 'Probar notificación' }));
  await fireEvent.press(view.getByRole('button', { name: 'Enviando prueba' }));
  expect(mockSend).toHaveBeenCalledTimes(1);
  await act(async () => resolve({ ticketId: 'ticket-1' }));
  expect(view.getByText('Prueba enviada. Esperá el aviso en este dispositivo.')).toBeTruthy();
  expect(view.queryByText('Notificación recibida')).toBeNull();
});
it('supports retry after a failed send', async () => {
  mockSend.mockRejectedValueOnce(new Error('No se pudo enviar la prueba.')).mockResolvedValueOnce({ ticketId: 'ticket-2' });
  const view = await render(<NotificationTestCard />);
  await fireEvent.press(view.getByRole('button', { name: 'Probar notificación' }));
  expect(view.getByText('No se pudo enviar la prueba.')).toBeTruthy();
  await fireEvent.press(view.getByRole('button', { name: 'Probar notificación' }));
  expect(mockSend).toHaveBeenCalledTimes(2);
});
it('checks the last receipt without sending again or claiming device delivery', async () => {
  mockSend.mockResolvedValue({ ticketId: 'ticket-3' });
  mockReceipt.mockResolvedValueOnce('pending').mockResolvedValueOnce('accepted');
  const view = await render(<NotificationTestCard />);
  await fireEvent.press(view.getByRole('button', { name: 'Probar notificación' }));
  await fireEvent.press(view.getByRole('button', { name: 'Comprobar envío' }));
  expect(view.getByText('El envío sigue pendiente. Podés comprobarlo nuevamente en unos minutos.')).toBeTruthy();
  await fireEvent.press(view.getByRole('button', { name: 'Comprobar envío' }));
  expect(view.getByText('El servicio de notificaciones aceptó el envío. Confirmá si el aviso apareció en tu dispositivo.')).toBeTruthy();
  expect(mockReceipt).toHaveBeenCalledWith('ticket-3');
  expect(mockSend).toHaveBeenCalledTimes(1);
});
