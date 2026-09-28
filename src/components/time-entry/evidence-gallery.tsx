import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { listWorkEvidence } from '@/data/work-evidence-repository';
import type { WorkEvidence } from '@/domain/types';
import { colors, radius, spacing } from '@/theme/tokens';

type EvidenceGalleryProps = {
  workStreamId: string;
};

export function EvidenceGallery({ workStreamId }: EvidenceGalleryProps) {
  const [evidence, setEvidence] = useState<WorkEvidence[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let active = true;
    void listWorkEvidence(workStreamId)
      .then((items) => {
        if (!active) return;
        setEvidence(items);
        setStatus('ready');
      })
      .catch(() => {
        if (active) setStatus('error');
      });

    return () => {
      active = false;
    };
  }, [workStreamId]);

  if (status === 'loading') {
    return (
      <View accessibilityLabel="Cargando evidencia" style={styles.loading}>
        <ActivityIndicator color={colors.accent} size="small" />
      </View>
    );
  }

  if (status === 'error') {
    return (
      <Text accessibilityRole="alert" selectable style={styles.error}>
        No pudimos cargar las fotos de evidencia.
      </Text>
    );
  }

  if (evidence.length === 0) return null;

  return (
    <View testID={`evidence-gallery-${workStreamId}`} style={styles.container}>
      <Text selectable style={styles.title}>
        Evidencia de trabajo · {evidence.length}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.list}>
        {evidence.map((item) => (
          <View key={item.id} style={styles.item}>
            {item.signedUrl ? (
              <Image
                accessibilityLabel={item.originalFilename ?? 'Foto de evidencia'}
                contentFit="cover"
                source={item.signedUrl}
                style={styles.image}
              />
            ) : (
              <View accessible accessibilityLabel="Foto de evidencia no disponible" style={styles.unavailable}>
                <Text style={styles.unavailableText}>Sin vista previa</Text>
              </View>
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  title: {
    color: colors.secondaryLabel,
    fontSize: 13,
    fontWeight: '600',
  },
  list: {
    gap: spacing.sm,
  },
  item: {
    width: 92,
    height: 92,
    overflow: 'hidden',
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    backgroundColor: colors.fill,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  unavailable: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xs,
  },
  unavailableText: {
    color: colors.tertiaryLabel,
    fontSize: 11,
    textAlign: 'center',
  },
  loading: {
    minHeight: 24,
    justifyContent: 'center',
  },
  error: {
    color: colors.tertiaryLabel,
    fontSize: 13,
  },
});
