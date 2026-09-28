import { Appearance, Platform, PlatformColor, type ColorValue } from 'react-native';

const isDarkMode = Appearance.getColorScheme() === 'dark';

const iOSColors = {
  background: PlatformColor('systemBackground') as ColorValue,
  secondaryBackground: PlatformColor('secondarySystemBackground') as ColorValue,
  surface: PlatformColor('secondarySystemBackground') as ColorValue,
  input: PlatformColor('systemBackground') as ColorValue,
  label: PlatformColor('label') as ColorValue,
  secondaryLabel: PlatformColor('secondaryLabel') as ColorValue,
  tertiaryLabel: PlatformColor('tertiaryLabel') as ColorValue,
  separator: PlatformColor('separator') as ColorValue,
  bubble: PlatformColor('systemGray5') as ColorValue,
  fill: PlatformColor('systemGray6') as ColorValue,
  accent: PlatformColor('label') as ColorValue,
  accentSurface: PlatformColor('systemGray6') as ColorValue,
  destructive: PlatformColor('systemRed') as ColorValue,
  warning: PlatformColor('systemOrange') as ColorValue,
};

const androidColorsLight = {
  background: '#F5F6F2' as ColorValue,
  secondaryBackground: '#FFFFFF' as ColorValue,
  surface: '#FFFFFF' as ColorValue,
  input: '#FFFFFF' as ColorValue,
  label: '#11130F' as ColorValue,
  secondaryLabel: '#3B3F3A' as ColorValue,
  tertiaryLabel: '#62625F' as ColorValue,
  separator: '#C7C7CC' as ColorValue,
  bubble: '#E5E5EA' as ColorValue,
  fill: '#F2F2F7' as ColorValue,
  accent: '#11130F' as ColorValue,
  accentSurface: '#E8E8EC' as ColorValue,
  destructive: '#D93025' as ColorValue,
  warning: '#FF9500' as ColorValue,
};

const androidColorsDark = {
  background: '#11130F' as ColorValue,
  secondaryBackground: '#1B1F19' as ColorValue,
  surface: '#1F241E' as ColorValue,
  input: '#1F241E' as ColorValue,
  label: '#FFFFFF' as ColorValue,
  secondaryLabel: '#B0B6AB' as ColorValue,
  tertiaryLabel: '#8B9287' as ColorValue,
  separator: '#2A2F28' as ColorValue,
  bubble: '#2F3A30' as ColorValue,
  fill: '#283026' as ColorValue,
  accent: '#FFFFFF' as ColorValue,
  accentSurface: '#2F3A32' as ColorValue,
  destructive: '#FF6B61' as ColorValue,
  warning: '#FFB340' as ColorValue,
};

export const colors = Platform.OS === 'ios' ? iOSColors : isDarkMode ? androidColorsDark : androidColorsLight;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  bubble: 20,
  control: 18,
  sheet: 12,
  sm: 12,
  md: 18,
  lg: 24,
} as const;

export const minTouchTarget = 44;
