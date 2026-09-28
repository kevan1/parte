import { Stack, useRouter } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useEffect, useState } from 'react';

import { ManualEntryScreen } from '@/features/manual-entry/manual-entry-screen';
import { historyStore } from '@/state/history';

export default function NewEntryRoute() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  usePreventRemove(saving, () => undefined);

  useEffect(() => {
    if (saved && !saving) router.back();
  }, [router, saved, saving]);

  return (
    <>
      <Stack.Screen options={{ gestureEnabled: !saving }} />
      <ManualEntryScreen
        onCancel={() => router.back()}
        onSavingChange={setSaving}
        onSaved={() => {
          historyStore.getState().markStale();
          setSaved(true);
        }}
      />
    </>
  );
}
