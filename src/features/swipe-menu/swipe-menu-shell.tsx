import { usePathname, useRouter } from 'expo-router';
import {
  createContext,
  type PropsWithChildren,
  use,
  useCallback,
  useEffect,
  useMemo,
} from 'react';
import { Keyboard, StyleSheet, useWindowDimensions, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AppMenu,
  type AppDestination,
} from '@/features/swipe-menu/components/app-menu';
import { CloseMenuOverlay } from '@/features/swipe-menu/components/close-menu-overlay';
import { buildWorkerProfile } from '@/data/profile-repository';
import { SWIPE_MENU } from '@/features/swipe-menu/swipe-menu-tokens';
import { useSwipeMenuMotion } from '@/features/swipe-menu/use-swipe-menu-motion';
import { useAvailability } from '@/features/availability/availability-provider';
import { useSession } from '@/providers/session-provider';
import { useCaptureStore } from '@/state/capture';
import { colors } from '@/theme/tokens';

type SwipeMenuContextValue = {
  closeMenu: () => void;
  isMenuOpen: boolean;
  openMenu: () => void;
};

const SwipeMenuContext = createContext<SwipeMenuContextValue | null>(null);

export function SwipeMenuShell({ children }: PropsWithChildren) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const router = useRouter();
  const { session } = useSession();
  const availability = useAvailability();
  const capturePhase = useCaptureStore((state) => state.phase);
  const authWorker = session?.user
    ? buildWorkerProfile(
        {
          created_at: session.user.created_at,
          email: session.user.email ?? '',
          id: session.user.id,
          role: 'employee',
        },
        session.user.user_metadata,
      )
    : undefined;
  const menuWidth = Math.min(width * SWIPE_MENU.widthRatio, SWIPE_MENU.maximumWidth);
  const {
    animateMenu,
    isMenuOpen,
    menuAnimatedStyle,
    surfaceAnimatedStyle,
    swipeGesture,
  } = useSwipeMenuMotion(menuWidth, 32, process.env.EXPO_OS === 'ios' ? 48 : 32);
  const activeDestination: AppDestination = pathname.startsWith('/history')
    ? 'history'
    : 'register';
  const closeMenu = useCallback(() => animateMenu(false), [animateMenu]);
  const openMenu = useCallback(() => animateMenu(true), [animateMenu]);
  const contextValue = useMemo(
    () => ({ closeMenu, isMenuOpen, openMenu }),
    [closeMenu, isMenuOpen, openMenu],
  );

  useEffect(() => {
    if (isMenuOpen) Keyboard.dismiss();
  }, [isMenuOpen]);

  const selectDestination = useCallback(
    (destination: AppDestination) => {
      closeMenu();
      router.replace(destination === 'history' ? '/history' : '/register');
    },
    [closeMenu, router],
  );
  const openManualEntry = useCallback(() => {
    closeMenu();
    router.push('/new-entry');
  }, [closeMenu, router]);
  const openProfile = useCallback(() => {
    closeMenu();
    router.push('/profile');
  }, [closeMenu, router]);

  const openAssignTask = useCallback(() => {
    closeMenu();
    router.push('/assign-task');
  }, [closeMenu, router]);

  return (
    <SwipeMenuContext value={contextValue}>
      <GestureDetector gesture={swipeGesture}>
        <View style={styles.root}>
          <Animated.View
            accessibilityElementsHidden={!isMenuOpen}
            importantForAccessibility={isMenuOpen ? 'auto' : 'no-hide-descendants'}
            pointerEvents={isMenuOpen ? 'auto' : 'none'}
            style={[styles.menuLayer, menuAnimatedStyle]}
          >
            <AppMenu
              activeDestination={activeDestination}
              bottomInset={insets.bottom}
              menuWidth={menuWidth}
              newEntryDisabled={capturePhase === 'saving'}
              onNewEntry={openManualEntry}
              onProfilePress={openProfile}
              onSchedulesPress={availability.snapshot?.isAdmin ? () => { closeMenu(); router.push('/schedules'); } : undefined}
              onAssignTaskPress={availability.snapshot?.isAdmin ? openAssignTask : undefined}
              onSelectDestination={selectDestination}
              topInset={insets.top}
              avatarUrl={authWorker?.avatarUrl}
              userEmail={session?.user.email}
              workerName={authWorker?.name}
            />
          </Animated.View>

          <Animated.View style={[styles.surface, surfaceAnimatedStyle]}>
            <View
              accessibilityElementsHidden={isMenuOpen}
              importantForAccessibility={isMenuOpen ? 'no-hide-descendants' : 'auto'}
              style={styles.content}
            >
              {children}
            </View>
            <CloseMenuOverlay isMenuOpen={isMenuOpen} onClose={closeMenu} />
          </Animated.View>
        </View>
      </GestureDetector>
    </SwipeMenuContext>
  );
}

export function useSwipeMenu(): SwipeMenuContextValue {
  const context = use(SwipeMenuContext);
  if (!context) throw new Error('useSwipeMenu must be used inside SwipeMenuShell');
  return context;
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: colors.secondaryBackground,
    flex: 1,
    overflow: 'hidden',
  },
  menuLayer: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  surface: {
    backgroundColor: colors.background,
    borderCurve: 'continuous',
    boxShadow: '-8px 0 40px rgba(0, 0, 0, 0.14)',
    flex: 1,
    overflow: 'hidden',
    zIndex: 2,
  },
  content: {
    flex: 1,
  },
});
