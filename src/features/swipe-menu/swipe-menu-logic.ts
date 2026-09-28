import { SWIPE_GESTURE } from '@/features/swipe-menu/swipe-menu-tokens';

export type SwipeEndState = {
  currentPosition: number;
  menuWidth: number;
  translationX: number;
  velocityX: number;
};

export function shouldOpenSwipeMenu({
  currentPosition,
  menuWidth,
  translationX,
  velocityX,
}: SwipeEndState): boolean {
  'worklet';

  const hasDirectionalIntent =
    Math.abs(translationX) > SWIPE_GESTURE.directionDistanceThreshold ||
    Math.abs(velocityX) > SWIPE_GESTURE.velocityThreshold;

  if (hasDirectionalIntent) {
    return translationX + velocityX * SWIPE_GESTURE.velocityInfluence > 0;
  }

  return currentPosition > menuWidth * SWIPE_GESTURE.openPositionThreshold;
}
