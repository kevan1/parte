import { createContext, useContext, useEffect, useRef, useState, useCallback, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import { getAvailability, setAvailability, type AvailabilitySnapshot } from '@/data/availability-repository';
import { calculateAvailability, nextAvailabilityCheck } from '@/domain/availability';

type Mode = 'available' | 'remote' | 'absent' | 'automatic';
type AvailabilityContextValue = {
  snapshot: AvailabilitySnapshot | null;
  now: Date;
  kind: string;
  label: string;
  manual: boolean;
  loading: boolean;
  saving: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  change: (mode: Mode) => Promise<void>;
};
const AvailabilityContext = createContext<AvailabilityContextValue | null>(null);
const unavailable = async () => { throw new Error('La disponibilidad no está lista.'); };
const initial: AvailabilityContextValue = { snapshot: null, now: new Date(0), kind: 'loading', label: 'Cargando disponibilidad', manual: false, loading: true, saving: false, error: null, refresh: async () => {}, change: unavailable };

type LoadFailure = { kind: 'offline' | 'unavailable'; message: string };
function describeLoadFailure(error: unknown): LoadFailure {
  const failure = error as { code?: unknown; message?: unknown } | null;
  if (failure?.code === 'PGRST202') {
    return { kind: 'unavailable', message: 'La disponibilidad todavía no está habilitada.' };
  }
  const message = typeof failure?.message === 'string' ? failure.message : '';
  const networkCode = !failure?.code || ['NETWORK_ERROR', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED'].includes(String(failure.code));
  if (networkCode && /network request failed|failed to fetch|networkerror|could not resolve|ENOTFOUND|EAI_AGAIN|ECONNREFUSED/i.test(message)) {
    return { kind: 'offline', message: 'No pudimos conectar. Revisá tu conexión e intentá nuevamente.' };
  }
  return { kind: 'unavailable', message: 'No pudimos cargar tu disponibilidad. Intentá nuevamente.' };
}

export function AvailabilityStateProvider({ children, userId }: PropsWithChildren<{ userId: string | null }>) {
  const [snapshot, setSnapshot] = useState<AvailabilitySnapshot | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<LoadFailure | null>(null);
  const generation = useRef(0);
  const mounted = useRef(false);
  const writing = useRef(false);
  const refresh = useCallback(async () => {
    if (!userId || !mounted.current || writing.current) return;
    const request = ++generation.current;
    try {
      const result = await getAvailability();
      if (!mounted.current || request !== generation.current) return;
      setSnapshot(result);
      setFailure(null);
    } catch (error) {
      if (!mounted.current || request !== generation.current) return;
      setSnapshot(null);
      setFailure(describeLoadFailure(error));
    } finally {
      if (mounted.current && request === generation.current) {
        setNow(new Date());
        setLoading(false);
      }
    }
  }, [userId]);

  const invalidate = useCallback(() => { mounted.current = false; generation.current += 1; }, []);
  useEffect(() => {
    mounted.current = true;
    void Promise.resolve().then(refresh);
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => { setNow(new Date()); timer = setTimeout(tick, nextAvailabilityCheck(new Date())); };
    timer = setTimeout(tick, nextAvailabilityCheck(new Date()));
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') { setNow(new Date()); void refresh(); }
    });
    return () => { invalidate(); clearTimeout(timer); subscription.remove(); };
  }, [refresh, invalidate]);

  const change = useCallback(async (mode: Mode) => {
    if (!userId || writing.current) throw new Error('Esperá a que termine el cambio actual.');
    writing.current = true;
    const request = ++generation.current;
    setSaving(true);
    try {
      const result = await setAvailability(mode);
      if (!mounted.current || request !== generation.current) return;
      setSnapshot(result);
      setFailure(null);
      setLoading(false);
      setNow(new Date());
    } finally {
      writing.current = false;
      if (mounted.current) setSaving(false);
    }
  }, [userId]);
  const effective = snapshot ? calculateAvailability(snapshot, now) : { kind: loading ? 'loading' : failure?.kind ?? 'unavailable', label: loading ? 'Cargando disponibilidad' : failure?.kind === 'offline' ? 'Disponibilidad sin conexión' : 'Disponibilidad no disponible', manual: false };
  return <AvailabilityContext value={{ snapshot, now, ...effective, loading, saving, error: failure?.message ?? null, refresh, change }}>{children}</AvailabilityContext>;
}

export function useAvailability() { return useContext(AvailabilityContext) ?? initial; }
