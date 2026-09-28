import { Pressable, StyleSheet, View } from 'react-native';

export function RecordingStopButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      testID="attachments-recording-native-stop"
      accessibilityRole="button"
      accessibilityLabel="Detener grabación"
      hitSlop={8}
      onPress={onPress}
      style={styles.button}
    >
      <View style={styles.square} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,59,48,0.42)',
  },
  square: {
    width: 15,
    height: 15,
    borderRadius: 3,
    backgroundColor: '#FF5A5F',
  },
});
