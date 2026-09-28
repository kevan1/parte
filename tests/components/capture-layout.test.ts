import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const captureScreen = readFileSync(
  resolve(__dirname, '../../src/screens/capture-screen.tsx'),
  'utf8',
);

describe('capture layout', () => {
  it('keeps reference suggestions out of the task carousel overlay', () => {
    expect(captureScreen).toContain('showSuggestions={false}');
  });

  it('reserves bottom clearance for the floating composer', () => {
    expect(captureScreen).toContain('paddingBottom: 220');
  });

  it('hides the vertical scroll indicator without disabling scrolling', () => {
    expect(captureScreen).toContain('showsVerticalScrollIndicator={false}');
  });

  it('uses an Expo UI native title for the capture navigation header', () => {
    expect(captureScreen).toContain('NativeCaptureHeader');
    expect(captureScreen).toContain('headerTitle:');
    expect(captureScreen).toContain('headerTransparent: true');
    expect(captureScreen).toContain("headerBlurEffect: 'none'");
    expect(captureScreen).toContain("headerStyle: { backgroundColor: 'transparent' }");
    expect(captureScreen).toContain('{ paddingTop: headerHeight + spacing.sm }');
    expect(captureScreen).not.toContain('ProgressiveBlurHeader');
    expect(captureScreen).not.toContain('ProgressiveBlurFooter');
  });
});
