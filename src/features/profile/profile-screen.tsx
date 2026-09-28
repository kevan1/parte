import type { User } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState } from 'react';

import { getWorkerProfile, type WorkerProfile } from '@/data/profile-repository';
import { WorkerProfileContent } from '@/features/profile/components/worker-profile-content';
import { useSession } from '@/providers/session-provider';

export function ProfileScreen() {
  const { session } = useSession();
  const user = session?.user;

  if (!user) return <WorkerProfileContent loading />;
  return <WorkerProfileLoader key={user.id} user={user} />;
}

function WorkerProfileLoader({ user }: { user: User }) {
  const [profile, setProfile] = useState<WorkerProfile>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const requestGeneration = useRef(0);

  const runRequest = useCallback(
    async (generation: number) => {
      try {
        const value = await getWorkerProfile(
          {
            createdAt: user.created_at,
            email: user.email ?? '',
            id: user.id,
          },
          user.user_metadata,
        );
        if (requestGeneration.current === generation) setProfile(value);
      } catch {
        if (requestGeneration.current === generation) {
          setError('No pudimos cargar tu perfil.');
        }
      } finally {
        if (requestGeneration.current === generation) setLoading(false);
      }
    },
    [user],
  );

  const load = useCallback(() => {
    const generation = requestGeneration.current + 1;
    requestGeneration.current = generation;

    setLoading(true);
    setProfile(undefined);
    setError(undefined);
    void runRequest(generation);
  }, [runRequest]);

  useEffect(() => {
    const generation = requestGeneration.current + 1;
    requestGeneration.current = generation;
    void runRequest(generation);

    return () => {
      requestGeneration.current += 1;
    };
  }, [runRequest]);

  return (
    <WorkerProfileContent
      error={error}
      loading={loading}
      onRetry={load}
      profile={profile}
    />
  );
}
