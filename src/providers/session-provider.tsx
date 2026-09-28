import type { Session } from '@supabase/supabase-js';
import { SplashScreen } from 'expo-router';
import { createContext, type PropsWithChildren, use, useEffect, useState } from 'react';

import { installAuthAutoRefresh, supabase } from '@/data/supabase';
import {
  getLastSessionIdentity,
  setLastSessionIdentity,
  type SessionIdentity,
} from '@/data/session-identity-store';
import { resetUserState } from '@/state/reset-user-state';
import { historyStore } from '@/state/history';

type SessionContextValue = {
  session: Session | null;
  isLoading: boolean;
  sessionIdentityChanged: null | {
    previousUserId: string;
    previousEmail: string | null;
    currentUserId: string;
    currentEmail: string | null;
  };
};

const SessionContext = createContext<SessionContextValue | null>(null);

void SplashScreen.preventAutoHideAsync();

export function SessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionIdentityChanged, setSessionIdentityChanged] = useState<
    SessionContextValue['sessionIdentityChanged']
  >(null);

  useEffect(() => {
    let mounted = true;
    let currentUserId: string | null = null;
    let lastStoredIdentity: SessionIdentity | null = null;
    const removeRefreshListener = installAuthAutoRefresh();

    async function applySession(nextSession: Session | null) {
      const nextUserId = nextSession?.user.id ?? null;
      const nextEmail = nextSession?.user.email ?? null;
      const previousSessionIdentity = lastStoredIdentity;

      if (currentUserId !== nextUserId) resetUserState();
      if (nextUserId && previousSessionIdentity?.userId && previousSessionIdentity.userId !== nextUserId) {
        setSessionIdentityChanged({
          previousUserId: previousSessionIdentity.userId,
          previousEmail: previousSessionIdentity.email,
          currentUserId: nextUserId,
          currentEmail: nextEmail,
        });
      } else {
        setSessionIdentityChanged(null);
      }
      currentUserId = nextUserId;

      if (nextUserId) {
        try {
          await setLastSessionIdentity({ userId: nextUserId, email: nextEmail });
          lastStoredIdentity = { userId: nextUserId, email: nextEmail };
        } catch {
          // No podemos guardar la identidad local de respaldo, seguimos funcionando sin ese dato.
        }
        if (historyStore.getState().status === 'idle') {
          void historyStore.getState().load();
        }
      }

      if (!mounted) return;
      setSession(nextSession);
      setIsLoading(false);
    }

    void (async () => {
      try {
        lastStoredIdentity = await getLastSessionIdentity();
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;
        await applySession(data.session);
      } catch {
        if (!mounted) return;
        currentUserId = null;
        setSessionIdentityChanged(null);
        setSession(null);
        setIsLoading(false);
      }
    })();

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void applySession(nextSession);
    });
    return () => {
      mounted = false;
      data.subscription.unsubscribe();
      removeRefreshListener();
    };
  }, []);

  useEffect(() => {
    if (!isLoading) void SplashScreen.hideAsync();
  }, [isLoading]);

  return (
    <SessionContext value={{ session, isLoading, sessionIdentityChanged }}>
      {children}
    </SessionContext>
  );
}

export function useSession(): SessionContextValue {
  const context = use(SessionContext);
  if (!context) throw new Error('useSession must be used inside SessionProvider');
  return context;
}
