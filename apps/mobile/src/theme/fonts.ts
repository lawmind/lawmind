import { useFonts } from 'expo-font';

import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { JetBrainsMono_400Regular } from '@expo-google-fonts/jetbrains-mono/400Regular';
import { JetBrainsMono_600SemiBold } from '@expo-google-fonts/jetbrains-mono/600SemiBold';
import { NotoSansDevanagari_400Regular } from '@expo-google-fonts/noto-sans-devanagari/400Regular';
import { NotoSerifDevanagari_400Regular } from '@expo-google-fonts/noto-serif-devanagari/400Regular';
import { SourceSerif4_400Regular } from '@expo-google-fonts/source-serif-4/400Regular';
import { SourceSerif4_500Medium } from '@expo-google-fonts/source-serif-4/500Medium';

/**
 * The five families, bundled — not fetched. The app opens in court corridors on
 * bad connectivity, and a font that has not arrived is a screen of missing
 * glyphs.
 *
 * Devanagari coverage is not optional: a missing-glyph box in a court filing is
 * a product failure, and Noto Serif/Sans Devanagari are the only faces here
 * that have it.
 *
 * Weights are imported by subpath so the bundle carries nine faces rather than
 * the ~120 the package index would pull in.
 */
export const appFonts = {
  SourceSerif4_400Regular,
  SourceSerif4_500Medium,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  JetBrainsMono_400Regular,
  JetBrainsMono_600SemiBold,
  NotoSerifDevanagari_400Regular,
  NotoSansDevanagari_400Regular,
} as const;

/** `[loaded, error]`. Nothing renders text until this is true. */
export function useAppFonts() {
  return useFonts(appFonts);
}
