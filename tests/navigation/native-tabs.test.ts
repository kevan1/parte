import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('authenticated native navigation [AC-15]', () => {
  const tabsRoot = join(process.cwd(), 'src/app/(app)/(tabs)');
  const layout = readFileSync(join(tabsRoot, '_layout.tsx'), 'utf8');
  const appLayout = readFileSync(join(process.cwd(), 'src/app/(app)/_layout.tsx'), 'utf8');
  const captureScreen = readFileSync(join(process.cwd(), 'src/screens/capture-screen.tsx'), 'utf8');
  const historyLayout = readFileSync(join(tabsRoot, 'history/_layout.tsx'), 'utf8');
  const swipeMenuShell = readFileSync(
    join(process.cwd(), 'src/features/swipe-menu/swipe-menu-shell.tsx'),
    'utf8',
  );
  const swipeMenuButton = readFileSync(
    join(process.cwd(), 'src/features/swipe-menu/components/swipe-menu-button.tsx'),
    'utf8',
  );
  const packageJson = readFileSync(join(process.cwd(), 'package.json'), 'utf8');
  const swipeMenuMotion = readFileSync(
    join(process.cwd(), 'src/features/swipe-menu/use-swipe-menu-motion.ts'),
    'utf8',
  );
  const manualEntryButton = readFileSync(
    join(process.cwd(), 'src/features/manual-entry/components/manual-entry-button.tsx'),
    'utf8',
  );
  const manualEntryRoute = readFileSync(
    join(process.cwd(), 'src/app/(app)/new-entry.tsx'),
    'utf8',
  );

  it('uses static Expo Router NativeTabs for Registrar, Tareas, and Mis horas', () => {
    expect(layout).toContain("from 'expo-router/unstable-native-tabs'");
    expect(layout).toContain('<NativeTabs');
    expect(layout).toContain('name="register"');
    expect(layout).toContain('name="tasks"');
    expect(layout).toContain('name="history"');
    expect(layout).not.toMatch(/<Tabs(?:\s|>)/);
  });

  it('nests a native Stack inside each tab while preserving public routes', () => {
    expect(existsSync(join(tabsRoot, 'register/_layout.tsx'))).toBe(true);
    expect(existsSync(join(tabsRoot, 'register/index.tsx'))).toBe(true);
    expect(existsSync(join(tabsRoot, 'history/_layout.tsx'))).toBe(true);
    expect(existsSync(join(tabsRoot, 'tasks/_layout.tsx'))).toBe(true);
    expect(existsSync(join(tabsRoot, 'tasks/index.tsx'))).toBe(true);
    expect(existsSync(join(tabsRoot, 'history/index.tsx'))).toBe(true);
  });

  it('wraps the authenticated stack in one swipe shell with header controls [AC-SM-2, AC-SM-6]', () => {
    expect(appLayout).toContain('<SwipeMenuShell>');
    expect(appLayout).toContain('</SwipeMenuShell>');
    expect(captureScreen).toContain('<SwipeMenuButton />');
    expect(historyLayout).toContain('<SwipeMenuButton />');
    expect(swipeMenuButton).toContain('accessibilityLabel="Abrir menú"');
    expect(swipeMenuButton).toContain('onPress={openMenu}');
  });

  it('closes after destination changes and opens manual entry from the menu [AC-SM-3, AC-SM-4, AC-ME-2]', () => {
    expect(swipeMenuShell).toMatch(
      /selectDestination[\s\S]*closeMenu\(\);[\s\S]*router\.replace/,
    );
    expect(swipeMenuShell).toMatch(/openManualEntry[\s\S]*closeMenu\(\);[\s\S]*router\.push\('\/new-entry'\)/);
  });

  it('registers a native form sheet and exposes both upper-left entry actions [AC-ME-1, AC-ME-8]', () => {
    expect(existsSync(join(process.cwd(), 'src/app/(app)/new-entry.tsx'))).toBe(true);
    expect(appLayout).toContain('name="new-entry"');
    expect(appLayout).toContain("presentation: 'formSheet'");
    expect(appLayout).toContain('sheetAllowedDetents: [0.72, 1]');
    expect(captureScreen).toContain('<ManualEntryButton');
    expect(historyLayout).toContain('<ManualEntryButton />');
    expect(manualEntryButton).toContain('accessibilityLabel="Nueva carga manual"');
    expect(manualEntryButton).toContain("router.push('/new-entry')");
    expect(manualEntryRoute).toContain('usePreventRemove(saving');
    expect(manualEntryRoute).toContain('gestureEnabled: !saving');
  });

  it('switches pointer and accessibility ownership with menu state [AC-SM-5]', () => {
    expect(swipeMenuShell).toContain("accessibilityElementsHidden={!isMenuOpen}");
    expect(swipeMenuShell).toContain("importantForAccessibility={isMenuOpen ? 'auto' : 'no-hide-descendants'}");
    expect(swipeMenuShell).toContain("pointerEvents={isMenuOpen ? 'auto' : 'none'}");
    expect(swipeMenuShell).toContain(
      '<CloseMenuOverlay isMenuOpen={isMenuOpen} onClose={closeMenu} />',
    );
    expect(swipeMenuShell).toMatch(/if \(isMenuOpen\) Keyboard\.dismiss\(\)/);
  });

  it('limits closed-state opening gestures to the left edge [AC-SM-1, AC-SM-6]', () => {
    expect(swipeMenuMotion).toContain('closedEdgeWidth');
    expect(swipeMenuMotion).toContain("{ left: 0, width: closedEdgeWidth }");
  });

  it('uses the existing cross-platform gesture stack without a native corner module [AC-SM-7]', () => {
    expect(packageJson).toContain('"react-native-gesture-handler"');
    expect(packageJson).toContain('"react-native-reanimated"');
    expect(swipeMenuShell).not.toContain('screen-corner-surface');
    expect(swipeMenuShell).toContain("backgroundColor: colors.secondaryBackground");
  });

  it('routes the menu profile photo to the worker profile sheet [AC-SM-8, AC-SM-10]', () => {
    expect(existsSync(join(process.cwd(), 'src/app/(app)/profile.tsx'))).toBe(true);
    expect(appLayout).toContain('name="profile"');
    expect(appLayout).toContain("title: 'Mi perfil'");
    expect(swipeMenuShell).toContain("router.push('/profile')");
  });
});
