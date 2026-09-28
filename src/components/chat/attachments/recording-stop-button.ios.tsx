import { Host } from '@expo/ui';
import { Button, Image } from '@expo/ui/swift-ui';
import {
  accessibilityLabel,
  buttonBorderShape,
  buttonStyle,
  controlSize,
  frame,
  tint,
} from '@expo/ui/swift-ui/modifiers';

const RECORDING_RED = '#FF3B30';

/** Native SwiftUI glass control on iOS 26, with the RN version as a platform fallback. */
export function RecordingStopButton({ onPress }: { onPress: () => void }) {
  return (
    <Host colorScheme="dark" style={{ height: 42, width: 42 }} testID="attachments-recording-native-stop">
      <Button
        onPress={onPress}
        role="destructive"
        modifiers={[
          buttonStyle('glassProminent'),
          buttonBorderShape('circle'),
          controlSize('large'),
          tint(RECORDING_RED),
          frame({ width: 42, height: 42 }),
          accessibilityLabel('Detener grabación'),
        ]}
      >
        <Image systemName="stop.fill" size={15} color="#FFFFFF" />
      </Button>
    </Host>
  );
}
