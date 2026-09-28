import { shouldOpenSwipeMenu } from '@/features/swipe-menu/swipe-menu-logic';

describe('swipe menu gesture decisions [AC-SM-1]', () => {
  const menuWidth = 300;

  it('uses a deliberate drag or fling direction when intent is clear', () => {
    expect(
      shouldOpenSwipeMenu({ currentPosition: 30, menuWidth, translationX: 20, velocityX: 0 }),
    ).toBe(true);
    expect(
      shouldOpenSwipeMenu({ currentPosition: 270, menuWidth, translationX: -20, velocityX: 0 }),
    ).toBe(false);
    expect(
      shouldOpenSwipeMenu({ currentPosition: 30, menuWidth, translationX: 0, velocityX: 220 }),
    ).toBe(true);
    expect(
      shouldOpenSwipeMenu({ currentPosition: 270, menuWidth, translationX: 0, velocityX: -220 }),
    ).toBe(false);
  });

  it('settles short slow movements according to the exposed menu position', () => {
    expect(
      shouldOpenSwipeMenu({ currentPosition: 40, menuWidth, translationX: 4, velocityX: 20 }),
    ).toBe(false);
    expect(
      shouldOpenSwipeMenu({ currentPosition: 120, menuWidth, translationX: 4, velocityX: 20 }),
    ).toBe(true);
  });
});
