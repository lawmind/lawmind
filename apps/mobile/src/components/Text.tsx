import { Fragment, type ReactNode } from 'react';
import {
  Platform,
  Text as RNText,
  type StyleProp,
  StyleSheet,
  type TextProps as RNTextProps,
  type TextStyle,
  View,
} from 'react-native';

import { legalText } from '../theme/legalText';
import { color, family, MIN_BODY_SIZE, mixedScript, type as typeScale } from '../theme/tokens';
import { useLanguage, type Language } from '../state/language';

/**
 * LAWMIND — the Text wrapper.
 *
 * THE SIX MICRO-TYPOGRAPHY RULES LIVE HERE AND IN `legalText()`, NOWHERE ELSE.
 * Individually invisible; together they are most of the distance between
 * competent and beautiful.
 *
 *   1. Hanging punctuation ......... here (`hangingGlyph`, absolutely placed)
 *   2. Optical baseline alignment .. here (`opticalNudge` on `record`)
 *   3. Tabular figures ............. here (`fontVariant`)
 *   4. Widow control ............... `legalText()` + `textWrap: 'pretty'` here
 *   5. Correct dashes .............. `legalText()`
 *   6. Typographic quotes .......... `legalText()`
 *
 * A screen that hand-types a curly quote is a defect. So is a screen that sets
 * its own fontSize below 16.
 *
 * Minimum body size is enforced HERE, not per screen. `ui`, `uiStrong` and
 * `legal` throw in development below 16px. `record` and `eyebrow` are reference
 * labels rather than body text and are permitted 10–13.
 */

export type TextVariant = 'ui' | 'uiStrong' | 'legal' | 'record' | 'eyebrow';

/** Rows of the type scale reachable within a variant. */
export type TextScale =
  | 'body'
  | 'title'
  | 'caseName'
  | 'cardTitle'
  | 'documentBody'
  | 'holding'
  | 'metadata';

export type TextProps = Omit<RNTextProps, 'children'> & {
  children?: ReactNode;
  variant?: TextVariant;
  scale?: TextScale;
  /** Overrides the app language for this string. Citations stay English inside Hindi prose. */
  lang?: Language;
  /**
   * Rule 2 — a mono record sitting against a serif title. Mono x-height sits
   * higher than serif caps, so a shared baseline reads as misaligned; the record
   * takes a 1px nudge. Only set this where the two genuinely sit side by side.
   */
  opticalNudge?: boolean;
  style?: StyleProp<TextStyle>;
};

/* ------------------------------------------------------------ type resolution */

type Resolved = {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing?: number;
  textTransform?: TextStyle['textTransform'];
};

const em = (value: number | undefined, fontSize: number) =>
  value === undefined ? undefined : value * fontSize;

function resolveLatin(variant: TextVariant, scale: TextScale | undefined): Resolved {
  switch (variant) {
    case 'legal': {
      const row =
        scale === 'caseName'
          ? typeScale.caseName
          : scale === 'cardTitle'
            ? typeScale.cardTitle
            : scale === 'documentBody'
              ? typeScale.documentBody
              : typeScale.holding;
      return { ...row, lineHeight: row.fontSize * row.lineHeight };
    }
    case 'record': {
      const row = typeScale.metadata;
      return { ...row, lineHeight: row.fontSize * row.lineHeight };
    }
    case 'eyebrow': {
      const row = typeScale.eyebrow;
      return {
        fontFamily: row.fontFamily,
        fontSize: row.fontSize,
        lineHeight: row.fontSize * row.lineHeight,
        letterSpacing: em(row.letterSpacingEm, row.fontSize),
        textTransform: row.textTransform,
      };
    }
    case 'uiStrong': {
      if (scale === 'title') {
        const row = typeScale.screenTitle;
        return {
          fontFamily: row.fontFamily,
          fontSize: row.fontSize,
          lineHeight: row.fontSize * row.lineHeight,
          letterSpacing: em(row.letterSpacingEm, row.fontSize),
        };
      }
      const row = typeScale.body;
      return {
        fontFamily: family.uiMedium,
        fontSize: row.fontSize,
        lineHeight: row.fontSize * row.lineHeight,
      };
    }
    default: {
      const row = typeScale.body;
      return { ...row, lineHeight: row.fontSize * row.lineHeight };
    }
  }
}

/**
 * Devanagari sits one point smaller than Latin with more leading — matched by
 * optical weight, not nominal size. Line-height 1.72: Latin spacing clips
 * matras, which is a correctness bug and not a taste call.
 *
 * `record` keeps JetBrains Mono in either language. Citations stay in English,
 * so a citation inside Hindi prose is a Latin run, not a translated one.
 *
 * Hindi eyebrows DROP the letterspaced-uppercase treatment: Devanagari has no
 * case distinction and letterspacing breaks conjuncts.
 */
function resolveDevanagari(variant: TextVariant, scale: TextScale | undefined): Resolved {
  if (variant === 'record') return resolveLatin('record', scale);

  if (variant === 'eyebrow') {
    const row = typeScale.devanagariUi;
    return {
      fontFamily: family.devanagariSans,
      fontSize: typeScale.eyebrow.fontSize + 2,
      lineHeight: row.lineHeight * (typeScale.eyebrow.fontSize + 2),
    };
  }

  if (variant === 'legal') {
    const row = typeScale.devanagariBody;
    return {
      fontFamily: row.fontFamily,
      fontSize: scale === 'caseName' ? typeScale.caseName.fontSize - 1 : row.fontSize,
      lineHeight:
        row.lineHeight * (scale === 'caseName' ? typeScale.caseName.fontSize - 1 : row.fontSize),
    };
  }

  const row = typeScale.devanagariUi;
  const fontSize = variant === 'uiStrong' && scale === 'title' ? 26 : row.fontSize;
  return { fontFamily: row.fontFamily, fontSize, lineHeight: row.lineHeight * fontSize };
}

/* ------------------------------------------------------------- mixed script */

const DEVANAGARI = /[ऀ-ॿ]/;
const LATIN = /[A-Za-z]/;

type Run = { text: string; latin: boolean };

/**
 * Devanagari and Latin on one line — appears on every Hindi screen, because
 * citations stay in English. Neutral characters (spaces, punctuation, digits)
 * join the run they follow.
 */
function splitScript(input: string): Run[] {
  const runs: Run[] = [];
  let current: Run | null = null;
  for (const char of input) {
    const isLatin = LATIN.test(char);
    const isDeva = DEVANAGARI.test(char);
    if (!isLatin && !isDeva) {
      if (current) current.text += char;
      else current = { text: char, latin: false };
      continue;
    }
    if (!current) current = { text: char, latin: isLatin };
    else if (current.latin === isLatin) current.text += char;
    else {
      runs.push(current);
      current = { text: char, latin: isLatin };
    }
  }
  if (current) runs.push(current);
  return runs;
}

const isMixedScript = (s: string) => DEVANAGARI.test(s) && LATIN.test(s);

/* -------------------------------------------------------------------- Text */

export function Text({
  children,
  variant = 'ui',
  scale,
  lang,
  opticalNudge,
  style,
  ...rest
}: TextProps) {
  const appLanguage = useLanguage();
  const language = lang ?? appLanguage;

  /**
   * NEVER EMIT DEVANAGARI IN A FACE WITHOUT COVERAGE.
   *
   * The script is decided by the STRING, not only by the app language. A Hindi
   * string inside an English screen — a party's name, a quoted order, a label
   * someone typed — would otherwise resolve to Inter and render as a row of
   * missing-glyph boxes. A browser hides that behind font fallback; a phone
   * does not, and a missing-glyph box in a court filing is a product failure.
   *
   * The reverse is not symmetrical: an all-Latin string in a Hindi screen stays
   * on the Devanagari face's Latin coverage only if it is mixed into Devanagari
   * text, which is what `mixedScript` below handles.
   */
  const hasDevanagari = typeof children === 'string' && DEVANAGARI.test(children);

  /**
   * A WHOLLY-LATIN STRING TAKES THE LATIN FACE, EVEN ON A HINDI SCREEN.
   *
   * Citations stay English (PD-12), and so do case names, party names and
   * anything quoted from an English judgment — which on a Hindi screen is most
   * of what an advocate actually reads. Resolving those to Noto Serif
   * Devanagari renders them in that face's Latin coverage rather than in Source
   * Serif 4, so the legal type system quietly changes the moment the locale
   * does. Noto has the glyphs, so nothing looks broken; it just stops being the
   * typeface the product is set in.
   *
   * Script follows the STRING. Locale only decides what to do when the string
   * cannot say — a non-string child, or an empty one.
   */
  const devanagari =
    typeof children === 'string' && children.length > 0 ? hasDevanagari : language === 'hi';

  const resolved = devanagari ? resolveDevanagari(variant, scale) : resolveLatin(variant, scale);

  if (__DEV__ && variant !== 'record' && variant !== 'eyebrow' && resolved.fontSize < MIN_BODY_SIZE) {
    throw new Error(
      `Text: body minimum is ${MIN_BODY_SIZE}px, got ${resolved.fontSize}px for variant "${variant}". ` +
        'Sizes below 16 are permitted only for mono metadata and eyebrows.'
    );
  }

  const base: TextStyle = {
    fontFamily: resolved.fontFamily,
    fontSize: resolved.fontSize,
    lineHeight: resolved.lineHeight,
    letterSpacing: resolved.letterSpacing,
    textTransform: resolved.textTransform,
    color: variant === 'record' || variant === 'eyebrow' ? color.inkFaint : color.ink,
  };

  // Rule 3 — tabular figures on every date, time and citation number.
  // Proportional figures make a column of dates jitter as digits change.
  const fontVariant: RNTextProps['style'] =
    variant === 'record' ? { fontVariant: ['tabular-nums'] } : undefined;

  // Rule 2 — the record's 1px nudge against a serif title.
  const nudge: TextStyle | undefined =
    opticalNudge && variant === 'record' ? { transform: [{ translateY: 1 }] } : undefined;

  // Rule 4, second half. Native has no `text-wrap`; the hard non-breaking space
  // from `legalText()` is what carries widow control there.
  const pretty = Platform.OS === 'web' ? ({ textWrap: 'pretty' } as TextStyle) : undefined;

  const composed = [base, fontVariant, nudge, pretty, style];

  // Non-string children (icons, nested elements) pass through untransformed.
  if (typeof children !== 'string') {
    return (
      <RNText {...rest} style={composed}>
        {children}
      </RNText>
    );
  }

  const shouldFormat = variant === 'legal';
  const { text, hanging, hangingGlyph } = shouldFormat
    ? legalText(children)
    : { text: children, hanging: false, hangingGlyph: '' };

  const body =
    devanagari && isMixedScript(text) ? (
      splitScript(text).map((run, i) => (
        <Fragment key={i}>
          {run.latin ? (
            <RNText
              style={{
                // Optical weight match. Nominal size matching is wrong: Source
                // Serif's x-height is larger relative to Devanagari's baseline,
                // so a Latin run at the same size reads heavier and sits high.
                fontFamily: variant === 'record' ? family.mono : family.serif,
                fontSize: mixedScript.latinFontSize,
                letterSpacing: mixedScript.latinTrackingEm * mixedScript.latinFontSize,
                // The 0.5px rise. React Native applies `transform` to nested
                // Text on web only — native has no baseline-shift primitive for
                // an attributed-string span. The size and tracking corrections,
                // which carry most of the effect, apply everywhere.
                transform: [{ translateY: -mixedScript.latinBaselineRise }],
              }}
            >
              {run.text}
            </RNText>
          ) : (
            run.text
          )}
        </Fragment>
      ))
    ) : (
      text
    );

  if (!hanging) {
    return (
      <RNText {...rest} style={composed}>
        {body}
      </RNText>
    );
  }

  // Rule 1 — hanging punctuation. The opening quote sits OUTSIDE the measure so
  // the text edge is true; otherwise the first line is visibly pushed in. The
  // glyph is taken out of flow, which is also why it cannot affect wrapping.
  return (
    <View style={styles.hangingHost}>
      <RNText
        aria-hidden
        style={[...composed, styles.hangingGlyph, { left: -0.4 * resolved.fontSize }]}
      >
        {hangingGlyph}
      </RNText>
      <RNText {...rest} style={composed}>
        {body}
      </RNText>
    </View>
  );
}

const styles = StyleSheet.create({
  hangingHost: { position: 'relative' },
  hangingGlyph: { position: 'absolute', top: 0 },
});
