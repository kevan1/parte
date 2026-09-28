import { act, fireEvent, render } from '@testing-library/react-native';
import IndexRoute from '@/app/index';
import AuthLayout from '@/app/(auth)/_layout';
import { useOnboardingStore } from '@/data/onboarding-store';

const mockSession = { session: null as object | null };
jest.mock('@/providers/session-provider', () => ({ useSession: () => mockSession }));
jest.mock('@/data/secure-storage', () => ({ secureSessionStorage: { getItem: jest.fn().mockResolvedValue(null), setItem: jest.fn() } }));
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Text } = require('react-native');
  const Stack = ({ children }: { children: unknown }) => children;
  Stack.Screen = function MockScreen({ name }: { name: string }) { return <Text>{name}</Text>; };
  Stack.Protected = function MockProtected({ guard, children }: { guard: boolean; children: unknown }) { return guard ? children : null; };
  return { Stack, Redirect: ({ href }: { href: string }) => <Text>{href}</Text> };
});

const initialHydrate = useOnboardingStore.getState().hydrate;

beforeEach(() => {
  mockSession.session = null;
  useOnboardingStore.setState({ status: 'ready', loading: false, error: null, completed: false, hydrate: initialHydrate });
});

describe('onboarding navigation [AC-ON-3, AC-ON-4, AC-ON-5]', () => {
  it('shows first-run onboarding and skips completed onboarding without session history', async () => {
    const view = await render(<IndexRoute />);
    expect(view.getByText('/onboarding')).toBeTruthy();
    await act(() => { useOnboardingStore.setState({ completed: true }); });
    await view.rerender(<IndexRoute />);
    expect(view.getByText('/sign-in')).toBeTruthy();
  });
  it('preserves the authenticated app destination', async () => {
    mockSession.session = {};
    const view = await render(<IndexRoute />);
    expect(view.getByText('/register')).toBeTruthy();
  });
  it('offers retry for a failed local read instead of navigating', async () => {
    const hydrate = jest.fn().mockResolvedValue(undefined);
    useOnboardingStore.setState({ status: 'error', error: 'No pudimos cargar el inicio.', hydrate });
    const view = await render(<IndexRoute />);
    expect(view.getByText('No pudimos cargar el inicio.')).toBeTruthy();
    await fireEvent.press(view.getByText('Reintentar'));
    expect(hydrate).toHaveBeenCalledTimes(1);
    expect(view.queryByText('/onboarding')).toBeNull();
  });
  it('removes the completed onboarding route from the auth navigator', async () => {
    const view = await render(<AuthLayout />);
    expect(view.getByText('onboarding')).toBeTruthy();
    await act(() => { useOnboardingStore.setState({ completed: true }); });
    await view.rerender(<AuthLayout />);
    expect(view.queryByText('onboarding')).toBeNull();
    expect(view.getByText('sign-in')).toBeTruthy();
  });
  it('does not expose auth routes before local state resolves', async () => {
    useOnboardingStore.setState({ status: 'loading', loading: true });
    const view = await render(<AuthLayout />);
    expect(view.queryByText('onboarding')).toBeNull();
    expect(view.queryByText('sign-in')).toBeNull();
  });
});
