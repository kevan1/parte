import { Host, Text } from '@expo/ui';
import { useColorScheme } from 'react-native';

type NativeCaptureHeaderProps = {
  title: string;
};

/**
 * Renders the capture title through Expo UI's native text layer.
 * On iOS this is backed by SwiftUI while keeping a universal fallback for Android and web.
 */
export function NativeCaptureHeader({ title }: NativeCaptureHeaderProps) {
  const colorScheme: 'light' | 'dark' = useColorScheme() === 'dark' ? 'dark' : 'light';
  const titleColor = colorScheme === 'dark' ? '#F5F5F7' : '#111111';

  return (
    <Host
      accessibilityLabel={title}
      accessibilityRole="header"
      colorScheme={colorScheme}
      style={{
        alignItems: 'center',
        height: 28,
        justifyContent: 'center',
        width: 80,
      }}
      testID="capture-native-header"
    >
      <Text
        numberOfLines={1}
        textStyle={{
          color: titleColor,
          fontSize: 17,
          fontWeight: '600',
        }}
      >
        {title}
      </Text>
    </Host>
  );
}
