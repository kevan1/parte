export const SWIPE_MENU = {
  maximumWidth: 360,
  widthRatio: 0.82,
} as const;

export const SWIPE_GESTURE = {
  activationDistance: 8,
  directionDistanceThreshold: 12,
  openPositionThreshold: 0.18,
  velocityInfluence: 0.05,
  velocityThreshold: 160,
  verticalTolerance: 18,
} as const;

export const SWIPE_SPRING = {
  damping: 26,
  mass: 0.8,
  overshootClamping: true,
  stiffness: 220,
} as const;

export const SWIPE_MENU_REVEAL = {
  fadeEndProgress: 0.5,
  fadeStartProgress: 0.08,
  startScale: 0.975,
  startVerticalOffset: 8,
} as const;
