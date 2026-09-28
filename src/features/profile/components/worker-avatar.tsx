import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/theme/tokens';

type WorkerAvatarProps = {
  accessible?: boolean;
  avatarUrl?: string;
  name: string;
  size?: number;
};

function initialsForName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? `${words[0]?.[0]}${words.at(-1)?.[0]}` : words[0]?.slice(0, 2))
    ?.toUpperCase() || 'TR';
}

export function WorkerAvatar({
  accessible = true,
  avatarUrl,
  name,
  size = 96,
}: WorkerAvatarProps) {
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string>();
  const commonStyle = {
    borderRadius: size / 2,
    height: size,
    width: size,
  } as const;

  if (avatarUrl && failedAvatarUrl !== avatarUrl) {
    return (
      <Image
        accessibilityLabel={accessible ? `Foto de perfil de ${name}` : undefined}
        accessible={accessible}
        contentFit="cover"
        onError={() => setFailedAvatarUrl(avatarUrl)}
        source={{ uri: avatarUrl }}
        style={commonStyle}
        transition={180}
      />
    );
  }

  return (
    <View
      accessibilityLabel={accessible ? `Iniciales de ${name}` : undefined}
      accessibilityRole={accessible ? 'image' : undefined}
      accessible={accessible}
      style={[styles.fallback, commonStyle]}
    >
      <Text style={[styles.initials, { fontSize: size * 0.34 }]}>{initialsForName(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderColor: colors.separator,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
  },
  initials: {
    color: colors.label,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
});
