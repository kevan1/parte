type AuthClient = {
  auth: {
    signInWithOtp: (input: {
      email: string;
      options: { emailRedirectTo: string };
    }) => Promise<{ error: Error | null }>;
    verifyOtp?: (
      input:
        | { token: string; type: string }
        | { token_hash: string; type: string }
        | { email: string; token: string; type: string }
    ) => Promise<{ error: Error | null }>;
    exchangeCodeForSession: (code: string) => Promise<{ error: Error | null }>;
    signOut: (options: { scope: 'global' }) => Promise<{ error: Error | null }>;
  };
};

const APP_CALLBACK_SCHEME = 'parte';
const APP_CALLBACK_URL = `${APP_CALLBACK_SCHEME}://auth/callback`;
const SIX_DIGIT_OTP = /^\d{6}$/;

export function createAuthService(client: AuthClient) {
  const exchangedCodes = new Set<string>();

  return {
    async sendMagicLink(email: string): Promise<void> {
      const normalizedEmail = email.trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) throw new Error('Ingresá un email válido.');
      const { error } = await client.auth.signInWithOtp({
        email: normalizedEmail,
        options: { emailRedirectTo: APP_CALLBACK_URL },
      });
      if (error) throw error;
    },

    async verifyEmailCode(email: string, token: string): Promise<void> {
      const normalizedEmail = email.trim().toLowerCase();
      const normalizedToken = token.replace(/\D/g, '');

      if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
        throw new Error('Ingresá un email válido.');
      }
      if (!SIX_DIGIT_OTP.test(normalizedToken)) {
        throw new Error('Ingresá un código de 6 dígitos.');
      }
      if (!client.auth.verifyOtp) throw new Error('No se pudo validar el código en este momento.');

      const { error } = await client.auth.verifyOtp({
        email: normalizedEmail,
        token: normalizedToken,
        type: 'email',
      });
      if (error) {
        throw error;
      }
    },

    async exchangeCallback(url: string): Promise<void> {
      const callback = new URL(url);
      if (
        callback.protocol !== `${APP_CALLBACK_SCHEME}:` ||
        callback.hostname !== 'auth' ||
        callback.pathname !== '/callback'
      ) {
        throw new Error('El enlace no pertenece a Parte.');
      }
      const code = callback.searchParams.get('code');
      const token = callback.searchParams.get('token');
      const tokenHash = callback.searchParams.get('token_hash');
      const magicType = callback.searchParams.get('type') || 'magiclink';
      const secret = code || token;

      if (tokenHash && !secret) {
        if (!client.auth.verifyOtp) throw new Error('El enlace no puede ser verificado.');
        const verifyType = magicType === 'email_change_current' ? 'email_change' : magicType;
        const { error } = await client.auth.verifyOtp({ token_hash: tokenHash, type: verifyType });
        if (error) {
          throw error;
        }
        return;
      }

      if (!secret) throw new Error('El enlace no contiene un código válido.');
      if (exchangedCodes.has(secret)) return;
      exchangedCodes.add(secret);

      const { error } = await client.auth.exchangeCodeForSession(secret);
      if (error) {
        exchangedCodes.delete(secret);
        throw error;
      }
    },

    async signOut(): Promise<void> {
      const { error } = await client.auth.signOut({ scope: 'global' });
      if (error) throw error;
    },
  };
}
