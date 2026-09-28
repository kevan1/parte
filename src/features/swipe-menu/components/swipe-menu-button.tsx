import { SymbolView } from 'expo-symbols';
import { Pressable } from 'react-native';
import { Text } from 'react-native';
import { useCallback } from 'react';
import * as Haptics from 'expo-haptics';

import { useSwipeMenu } from '@/features/swipe-menu/swipe-menu-shell';
import { colors, minTouchTarget } from '@/theme/tokens';

export function SwipeMenuButton() {
  const { openMenu } = useSwipeMenu();
  const handlePress = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    openMenu();
  }, [openMenu]);

  return (
    <Pressable
      accessibilityLabel="Abrir menú"
      accessibilityRole="button"
      hitSlop={10}
      onPress={handlePress}
      style={({ pressed }) => ({
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: minTouchTarget,
        minWidth: minTouchTarget,
        opacity: pressed ? 0.45 : 1,
        transform: pressed ? [{ scale: 0.94 }] : [{ scale: 1 }],
      })}
    >
      <SymbolView
        name={{ ios: 'line.3.horizontal', android: 'menu', web: 'menu' }}
        size={21}
        tintColor={colors.label}
        fallback={
          <Text style={{ color: colors.label, fontSize: 20, lineHeight: 20 }}>☰</Text>
        }
      />
    </Pressable>
  );
}
