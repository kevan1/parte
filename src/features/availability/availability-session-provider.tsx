import type { PropsWithChildren } from 'react';
import { useSession } from '@/providers/session-provider';
import { AvailabilityStateProvider } from './availability-provider';

export function AvailabilityProvider({ children }: PropsWithChildren) {
  const { session } = useSession();
  return <AvailabilityStateProvider key={session?.user.id ?? 'none'} userId={session?.user.id ?? null}>{children}</AvailabilityStateProvider>;
}
