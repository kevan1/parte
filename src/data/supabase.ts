import 'react-native-url-polyfill/auto';

import { createClient, processLock } from '@supabase/supabase-js';
import { AppState } from 'react-native';

import { createAuthService } from '@/data/auth-service';
import { secureSessionStorage } from '@/data/secure-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !publishableKey) {
  throw new Error('Faltan EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.');
}

export const supabase = createClient(supabaseUrl, publishableKey, {
  auth: {
    storage: secureSessionStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
    lock: processLock,
  },
});

let appStateListenerInstalled = false;

export function installAuthAutoRefresh(): () => void {
  if (appStateListenerInstalled) return () => undefined;
  appStateListenerInstalled = true;
  if (AppState.currentState === 'active') supabase.auth.startAutoRefresh();
  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
  return () => {
    subscription.remove();
    supabase.auth.stopAutoRefresh();
    appStateListenerInstalled = false;
  };
}

export const authService = createAuthService(
  supabase as unknown as Parameters<typeof createAuthService>[0],
);
