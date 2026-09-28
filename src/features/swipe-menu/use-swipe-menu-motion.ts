/* eslint-disable react-hooks/immutability -- Reanimated shared values are intentionally mutable on the UI thread. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { shouldOpenSwipeMenu } from '@/features/swipe-menu/swipe-menu-logic';
import {
  SWIPE_GESTURE,
  SWIPE_MENU_REVEAL,
  SWIPE_SPRING,
} from '@/features/swipe-menu/swipe-menu-tokens';

function clamp(value: number, minimum: number, maximum: number): number {
  'worklet';

  return Math.min(maximum, Math.max(minimum, value));
}

export function useSwipeMenuMotion(
  menuWidth: number,
  closedEdgeWidth = 32,
  openSurfaceRadius = 48,
) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const translateX = useSharedValue(0);
  const gestureStartX = useSharedValue(0);
  const previousMenuWidth = useRef(menuWidth);

  const animateMenu = useCallback(
    (open: boolean) => {
      setIsMenuOpen(open);
      translateX.value = withSpring(open ? menuWidth : 0, SWIPE_SPRING);
    },
    [menuWidth, translateX],
  );

  useEffect(() => {
    if (previousMenuWidth.current === menuWidth) return;

    translateX.value = isMenuOpen ? menuWidth : 0;
    previousMenuWidth.current = menuWidth;
  }, [isMenuOpen, menuWidth, translateX]);

  const swipeGesture = useMemo(
    () =>
      Gesture.Pan()
        .hitSlop(isMenuOpen ? 0 : { left: 0, width: closedEdgeWidth })
        .activeOffsetX([-SWIPE_GESTURE.activationDistance, SWIPE_GESTURE.activationDistance])
        .failOffsetY([-SWIPE_GESTURE.verticalTolerance, SWIPE_GESTURE.verticalTolerance])
        .onBegin(() => {
          gestureStartX.value = translateX.value;
        })
        .onUpdate((event) => {
          translateX.value = clamp(gestureStartX.value + event.translationX, 0, menuWidth);
        })
        .onEnd((event) => {
          const shouldOpen = shouldOpenSwipeMenu({
            currentPosition: translateX.value,
            menuWidth,
            translationX: event.translationX,
            velocityX: event.velocityX,
          });

          translateX.value = withSpring(shouldOpen ? menuWidth : 0, SWIPE_SPRING);
          runOnJS(setIsMenuOpen)(shouldOpen);
        }),
    [closedEdgeWidth, gestureStartX, isMenuOpen, menuWidth, translateX],
  );

  const surfaceAnimatedStyle = useAnimatedStyle(() => {
    const progress = menuWidth === 0 ? 0 : translateX.value / menuWidth;

    return {
      borderRadius: interpolate(
        progress,
        [0, 1],
        [0, openSurfaceRadius],
        Extrapolation.CLAMP,
      ),
      transform: [{ translateX: translateX.value }],
    };
  });

  const menuAnimatedStyle = useAnimatedStyle(() => {
    const progress = menuWidth === 0 ? 0 : translateX.value / menuWidth;

    return {
      opacity: interpolate(
        progress,
        [0, SWIPE_MENU_REVEAL.fadeStartProgress, SWIPE_MENU_REVEAL.fadeEndProgress],
        [0, 0, 1],
        Extrapolation.CLAMP,
      ),
      transform: [
        {
          translateY: interpolate(
            progress,
            [0, 1],
            [SWIPE_MENU_REVEAL.startVerticalOffset, 0],
            Extrapolation.CLAMP,
          ),
        },
        {
          scale: interpolate(
            progress,
            [0, 1],
            [SWIPE_MENU_REVEAL.startScale, 1],
            Extrapolation.CLAMP,
          ),
        },
      ],
    };
  });

  return {
    animateMenu,
    isMenuOpen,
    menuAnimatedStyle,
    surfaceAnimatedStyle,
    swipeGesture,
  };
}
