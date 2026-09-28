import { createAuthService } from '@/data/auth-service';

describe('magic-link auth service [AC-1, AC-2]', () => {
  it('requests a magic link using the app callback', async () => {
    const signInWithOtp = jest.fn().mockResolvedValue({ error: null });
    const service = createAuthService({
      auth: {
        signInWithOtp,
        verifyOtp: jest.fn(),
        exchangeCodeForSession: jest.fn(),
        signOut: jest.fn(),
      },
    });

    await service.sendMagicLink(' empleado@empresa.com ');

    expect(signInWithOtp).toHaveBeenCalledWith({
      email: 'empleado@empresa.com',
      options: { emailRedirectTo: 'parte://auth/callback' },
    });
  });

  it('rejects a callback from any other scheme, host, or path', async () => {
    const exchangeCodeForSession = jest.fn();
    const verifyOtp = jest.fn();
    const client = {
      auth: { signInWithOtp: jest.fn(), verifyOtp, exchangeCodeForSession, signOut: jest.fn() },
    };
    const auth = createAuthService(client);

    await expect(auth.exchangeCallback('evil://auth/callback?code=stolen')).rejects.toThrow();
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('exchanges each PKCE callback code at most once', async () => {
    const exchangeCodeForSession = jest.fn().mockResolvedValue({ error: null });
    const verifyOtp = jest.fn();
    const service = createAuthService({
      auth: {
        signInWithOtp: jest.fn(),
        verifyOtp,
        exchangeCodeForSession,
        signOut: jest.fn(),
      },
    });

    await service.exchangeCallback('parte://auth/callback?code=abc123');
    await service.exchangeCallback('parte://auth/callback?code=abc123');

    expect(exchangeCodeForSession).toHaveBeenCalledTimes(1);
    expect(exchangeCodeForSession).toHaveBeenCalledWith('abc123');
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it('uses exchangeCodeForSession for PKCE token callbacks', async () => {
    const exchangeCodeForSession = jest.fn().mockResolvedValue({ error: null });
    const verifyOtp = jest.fn();
    const service = createAuthService({
      auth: {
        signInWithOtp: jest.fn(),
        verifyOtp,
        exchangeCodeForSession,
        signOut: jest.fn(),
      },
    });

    await service.exchangeCallback('parte://auth/callback?token=pkce_123&type=magiclink');

    expect(exchangeCodeForSession).toHaveBeenCalledWith('pkce_123');
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it('verifies six-digit email OTP codes', async () => {
    const verifyOtp = jest.fn().mockResolvedValue({ error: null });
    const service = createAuthService({
      auth: {
        signInWithOtp: jest.fn(),
        verifyOtp,
        exchangeCodeForSession: jest.fn(),
        signOut: jest.fn(),
      },
    });

    await service.verifyEmailCode(' Empleado@Empresa.com ', ' 123 456 ');

    expect(verifyOtp).toHaveBeenCalledWith({
      email: 'empleado@empresa.com',
      token: '123456',
      type: 'email',
    });
  });

  it('uses verifyOtp for token hash callbacks', async () => {
    const verifyOtp = jest.fn().mockResolvedValue({ error: null });
    const service = createAuthService({
      auth: {
        signInWithOtp: jest.fn(),
        verifyOtp,
        exchangeCodeForSession: jest.fn(),
        signOut: jest.fn(),
      },
    });

    await service.exchangeCallback('parte://auth/callback?token_hash=tokhash&type=email');

    expect(verifyOtp).toHaveBeenCalledWith({
      token_hash: 'tokhash',
      type: 'email',
    });
  });

  it('rejects callbacks without a code and signs out through Supabase', async () => {
    const signOut = jest.fn().mockResolvedValue({ error: null });
    const service = createAuthService({
      auth: {
        signInWithOtp: jest.fn(),
        verifyOtp: jest.fn(),
        exchangeCodeForSession: jest.fn(),
        signOut,
      },
    });

    await expect(service.exchangeCallback('parte://auth/callback')).rejects.toThrow('código');
    await service.signOut();
    expect(signOut).toHaveBeenCalledWith({ scope: 'global' });
  });
});
