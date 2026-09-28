import { Pressable, StyleSheet, View } from 'react-native';

type CloseMenuOverlayProps = {
  isMenuOpen: boolean;
  onClose: () => void;
};

export function CloseMenuOverlay({ isMenuOpen, onClose }: CloseMenuOverlayProps) {
  if (!isMenuOpen) return null;

  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable
        accessibilityLabel="Cerrar menú"
        accessibilityRole="button"
        onPress={onClose}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}
