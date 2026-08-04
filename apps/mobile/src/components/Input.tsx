import { useState } from 'react';
import { PixelRatio, StyleSheet, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';

import { Text } from './Text';
import { color, family, radius, size, space, state, type as typeScale } from '../theme/tokens';
import { useLanguage } from '../state/language';

/**
 * Text field. Same 52px height and 2px radius as a button, so a form column
 * lines up on one axis.
 *
 * The face follows the app language — a Hindi field typed in Inter shows
 * missing glyphs, which in this product is a failure and not a cosmetic issue.
 *
 * Errors are `danger`, and they are the only place `danger` appears in a form.
 */
export type InputProps = TextInputProps & {
  label?: string;
  /** Shown below the field in `danger`. Presence of this is what puts the field in its error state. */
  error?: string;
  containerStyle?: StyleProp<ViewStyle>;
};

export function Input({ label, error, containerStyle, style, ...rest }: InputProps) {
  const [focused, setFocused] = useState(false);
  const devanagari = useLanguage() === 'hi';
  const row = devanagari ? typeScale.devanagariUi : typeScale.body;

  return (
    <View style={containerStyle}>
      {label ? (
        <Text variant="eyebrow" style={styles.label}>
          {label}
        </Text>
      ) : null}
      <TextInput
        {...rest}
        onBlur={(e) => {
          setFocused(false);
          rest.onBlur?.(e);
        }}
        onFocus={(e) => {
          setFocused(true);
          rest.onFocus?.(e);
        }}
        placeholderTextColor={color.inkFaint}
        style={[
          styles.field,
          {
            /**
             * THE FIELD GROWS WITH THE TYPE.
             *
             * `size.button` is 52px, sized for 16px text. React Native scales
             * the text when the reader raises their system size but leaves the
             * box alone, so at 2.0 a 32px line sits in a 52px well and the
             * ascenders and descenders are cut. An advocate who cannot read
             * small text is exactly the reader who cannot afford a clipped
             * character in a case number.
             */
            height: size.button * PixelRatio.getFontScale(),
            fontFamily: devanagari ? family.devanagariSans : family.ui,
            fontSize: row.fontSize,
            borderColor: error ? state.danger : focused ? color.ink : color.rule,
          },
          style,
        ]}
      />
      {error ? (
        <Text variant="ui" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: space.xs },
  field: {
    borderRadius: radius.base,
    borderWidth: 1,
    backgroundColor: color.card,
    paddingHorizontal: space.sm,
    color: color.ink,
  },
  error: { color: state.danger, marginTop: space.xs },
});
