import { memo, useEffect } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import type { CaptureTurn } from '@/domain/types';
import { colors, radius, spacing } from '@/theme/tokens';

type CaptureTurnRowProps = {
  turn: CaptureTurn;
  animateIn?: boolean;
  showTypingIndicator?: boolean;
};

function TypingIndicator() {
  const opacity = useSharedValue(0.9);
  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.25, { duration: 600 }), -1, true);
  }, [opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[styles.typingDot, style]} />;
}

export const CaptureTurnRow = memo(function CaptureTurnRow({
  turn,
  animateIn = false,
  showTypingIndicator = false,
}: CaptureTurnRowProps) {
  const entering = animateIn ? FadeInDown.duration(160) : undefined;

  if (turn.role === 'user') {
    return (
      <Animated.View entering={entering} style={styles.userRow}>
        <View testID="capture-user-bubble" style={styles.userBubble}>
          {turn.attachments?.length ? (
            <ScrollView
              testID="capture-user-attachments"
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.attachmentsContent}
              accessibilityLabel={`${turn.attachments.length} fotos adjuntas`}
            >
              {turn.attachments.map((attachment) => (
                <Image
                  key={attachment.id}
                  testID={`capture-attachment-${attachment.id}`}
                  source={attachment.id}
                  contentFit="cover"
                  style={styles.attachmentImage}
                  accessibilityLabel={attachment.fileName ?? 'Foto adjunta'}
                />
              ))}
            </ScrollView>
          ) : null}
          <Text selectable style={styles.userText}>
            {turn.content}
          </Text>
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View
      testID="capture-assistant-row"
      entering={entering}
      style={styles.assistantRow}
      accessible={showTypingIndicator || undefined}
      accessibilityLabel={showTypingIndicator ? 'Interpretando el registro' : undefined}
    >
      {showTypingIndicator ? (
        <TypingIndicator />
      ) : (
        <Text selectable style={styles.assistantText}>
          {turn.content}
        </Text>
      )}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  userRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.lg,
    marginVertical: spacing.sm,
  },
  userBubble: {
    maxWidth: '78%',
    backgroundColor: colors.bubble,
    borderRadius: radius.bubble,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
  },
  userText: {
    fontSize: 17,
    lineHeight: 23,
    color: colors.label,
  },
  attachmentsContent: {
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  attachmentImage: {
    width: 128,
    height: 96,
    borderRadius: radius.md,
    backgroundColor: colors.fill,
  },
  assistantRow: {
    paddingHorizontal: spacing.lg,
    marginVertical: spacing.sm,
  },
  assistantText: {
    fontSize: 17,
    lineHeight: 26,
    color: colors.label,
  },
  typingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.label,
    marginTop: 6,
    marginBottom: 2,
  },
});
