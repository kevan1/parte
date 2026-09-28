import { BackHandler } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import OnboardingRoute from '@/app/(auth)/onboarding';

const mockReplace = jest.fn();
const mockComplete = jest.fn();
jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  Stack: { Screen: ({ options }: { options: { headerRight?: () => React.ReactNode } }) => options.headerRight?.() ?? null },
  useRouter: () => ({ replace: mockReplace }),
}));
jest.mock('@/data/onboarding-store', () => ({ setOnboardingCompleted: () => mockComplete() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 62, bottom: 34, left: 0, right: 0 }) }));

beforeEach(() => { mockComplete.mockReset(); mockComplete.mockResolvedValue(undefined); mockReplace.mockReset(); });

it('explains capture, review and continuation with clearly labeled examples [AC-ON-1,2]', async () => {
  const view = await render(<OnboardingRoute />);
  expect(view.getByText('Contá qué hiciste.')).toBeTruthy();
  expect(view.getByText('Ejemplo')).toBeTruthy();
  await fireEvent.press(view.getByRole('button', { name: 'Continuar' }));
  expect(view.getByText('Revisá. Después guardá.')).toBeTruthy();
  await fireEvent.press(view.getByRole('button', { name: 'Continuar' }));
  expect(view.getByText('Tu trabajo, al día.')).toBeTruthy();
  expect(mockComplete).not.toHaveBeenCalled();
  await fireEvent.press(view.getByRole('button', { name: 'Anterior' }));
  expect(view.getByText('Revisá. Después guardá.')).toBeTruthy();
});

it('skips only after persistence succeeds and ignores repeated taps [AC-ON-3]', async () => {
  let finish!: () => void;
  mockComplete.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
  const view = await render(<OnboardingRoute />);
  await fireEvent.press(view.getByRole('button', { name: 'Omitir' }));
  await fireEvent.press(view.getByRole('button', { name: 'Omitir' }));
  expect(mockComplete).toHaveBeenCalledTimes(1);
  expect(mockReplace).not.toHaveBeenCalled();
  await act(async () => finish());
  expect(mockReplace).toHaveBeenCalledWith('/sign-in');
});

it('finishes from the last step and recovers from a storage failure [AC-ON-3,4]', async () => {
  mockComplete.mockRejectedValueOnce(new Error('disk'));
  const view = await render(<OnboardingRoute />);
  await fireEvent.press(view.getByRole('button', { name: 'Continuar' }));
  await fireEvent.press(view.getByRole('button', { name: 'Continuar' }));
  await fireEvent.press(view.getByRole('button', { name: 'Ingresar con mi email' }));
  expect(view.getByRole('alert')).toBeTruthy();
  expect(mockReplace).not.toHaveBeenCalled();
  await fireEvent.press(view.getByRole('button', { name: 'Ingresar con mi email' }));
  expect(mockComplete).toHaveBeenCalledTimes(2);
  expect(mockReplace).toHaveBeenCalledWith('/sign-in');
});

it('does not navigate from an unmounted walkthrough [AC-ON-3]', async () => {
  let finish!: () => void;
  mockComplete.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
  const view = await render(<OnboardingRoute />);
  await fireEvent.press(view.getByRole('button', { name: 'Omitir' }));
  await view.unmount();
  await act(async () => finish());
  expect(mockReplace).not.toHaveBeenCalled();
});


it('consumes Android back while persisting but allows back on the first idle step [AC-ON-2,3]', async () => {
  let back!: () => boolean | null | undefined;
  const listener = jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
    back = () => handler({ type: 'hardwareBackPress', timeStamp: 0 });
    return { remove: jest.fn() };
  });
  let finish!: () => void;
  mockComplete.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
  const view = await render(<OnboardingRoute />);
  expect(back()).toBe(false);
  await fireEvent.press(view.getByRole('button', { name: 'Omitir' }));
  expect(back()).toBe(true);
  expect(mockReplace).not.toHaveBeenCalled();
  await act(async () => finish());
  listener.mockRestore();
});
