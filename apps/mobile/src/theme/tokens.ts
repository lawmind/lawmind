/**
 * LAWMIND — DESIGN TOKENS
 *
 * Transcribed from `design/DESIGN_SYSTEM.md`. That file is the source of truth;
 * this file is its only executable form.
 *
 * THIS IS THE ONLY FILE IN THE CLIENT THAT MAY CONTAIN A COLOUR LITERAL.
 * A hex or rgba() anywhere else — app, admin, config, stylesheet — is a defect.
 * The check is `pnpm run check:hex` (see scripts/check-hex.mjs).
 *
 * `apps/admin` imports this same file. Density may differ; values may not.
 *
 * Zero imports, by rule: React Native, Next.js, Tailwind and the Expo config all
 * consume it, so it stays plain data.
 */

/* ------------------------------------------------------------------ colour */

/**
 * Paper, ink, one accent.
 *
 * The restraint rule: `oxblood` appears at most TWICE per screen — once for the
 * primary action, once where emphasis is genuinely earned. Three is a defect,
 * not a preference. Everything else is ink / inkMuted / inkFaint / rule.
 */
export const color = {
  /** Page ground. Carries the stipple tile in `assets/paper-tooth.png`. */
  paper: '#FBFAF7',
  /** Ground behind a document sheet — draft view only. */
  paperDesk: '#F2EFE8',
  /** Card and sheet fill. Opaque, always. */
  card: '#FFFFFF',

  /** Primary text, secondary buttons, 1px section rules. */
  ink: '#141B2D',
  /** Body secondary, supporting copy. */
  inkMuted: '#5A6478',
  /** Citations, dates, metadata, eyebrows. Reference, not emphasis. */
  inkFaint: '#8A8578',

  /** Card edges, section divisions. */
  rule: '#DAD6CB',
  /** Between list items. */
  hairline: '#E8E4DA',

  /** THE ONLY ACCENT. Primary action + one earned emphasis. */
  oxblood: '#5E1A2B',

  /** Text on an ink ground. Also the record line on an ink header. */
  parchment: '#F2EFE8',
} as const;

/**
 * States — these three only.
 *
 * `verified` RENDERS NOWHERE IN THE APP. Verified is silent: a verified citation
 * carries no badge, chip, tick, ring or colour. The token is retained for the
 * admin citation monitor and for the on-tap detail sheet. If you are reaching
 * for it in `apps/mobile`, you are about to build something the product
 * decided against.
 *
 * AMBER IS RESERVED. `IMPLEMENTATION.md` §9c: caution `#B4690E` means exactly
 * one thing — THE LAW HAS MOVED. It does not appear on drafts, on OCR, or on
 * anything about our own confidence. When an advocate sees amber it is about
 * the law, not about us. Anything expressing OUR uncertainty is neutral ink
 * with a dashed edge.
 *
 * The unverified state is a DASHED INK CARD, not a chip: 1.5px dashed
 * `inkFaint`, headline "Do not file this without checking it", with the reason
 * and the eCourts route inside it. The copy is licence protection, not an
 * audit — "Safe to file", never "we verified this"; "We could not confirm this
 * exists", never "verification failed". Built in S2, from these tokens.
 */
export const state = {
  verified: '#1F6F4A',

  /** Stamp border for `LAW MOVED`. */
  caution: '#B4690E',
  /** Caution text darkens on paper. #8A5109 on #FBF0DF = 5.02:1, AA. */
  cautionText: '#8A5109',
  /** Card wash behind an overruled authority. Amber, never red. */
  cautionWash: '#FBF0DF',

  /** Validation errors, destructive confirmation. */
  danger: '#9E2A33',
} as const;

/**
 * Ornament. Deliberately NOT in `color` — gilt never carries information.
 * Never text, never a rule that must be read, never a state, never on anything
 * tappable. Two placements only:
 *   1. the briefing seal ring
 *   2. identity marks (app icon, splash, PDF letterhead, admin sidebar mark)
 * Budget: ONE mark maximum on any screen. Most screens have none.
 *
 * The test: remove all the gilt from a screen and ask whether anything became
 * unknowable. If yes it was load-bearing and must be ink.
 */
export const gilt = '#C9A227' as const;

/* ---------------------------------------------------------------- material */

/**
 * Glass — chrome floats, content stays legible.
 *
 * Tint is 94%, NOT 70%: at 30% screen brightness a heavier glass collapses into
 * the list beneath it and chrome stops reading as chrome.
 *
 * The hairline is on the LEADING EDGE ONLY, so it catches light on one edge
 * like a real bevel. It is a GLASS placement, not a gilt placement, and does
 * not count against the gilt budget.
 *
 * Goes on: tab bar · nav bar · sticky headers · sheets · modals · toasts · a
 * search field floating over results · any toolbar over scrolling content.
 *
 * NEVER behind judgment text, a draft, a citation, a badge, a holding, an order
 * quote or a matter card. Content is fully opaque on paper, always. A draft is
 * filed in court and a judgment is read in sunlight — translucency behind
 * either is a correctness failure, not a taste one.
 */
export const glass = {
  tint: 'rgba(251,250,247,0.94)',
  blur: 16,
  sheetBlur: 24,
  hairline: 'rgba(201,162,39,0.28)',
  /** The toast is the one ink glass in the product — it must read against paper cards. */
  inkTint: 'rgba(20,27,45,0.94)',
} as const;

/**
 * No shadow on any resting surface. Not on cards, not on buttons. Depth comes
 * from 1px rules and from spacing, as on a printed page. Shadow appears only
 * while an element is genuinely floating above content.
 */
export const shadow = {
  stickyBar: { color: 'rgba(20,27,45,0.06)', offset: [0, -8] as const, radius: 24 },
  modalSheet: { color: 'rgba(20,27,45,0.16)', offset: [0, -18] as const, radius: 44 },
} as const;

/* ------------------------------------------------------- spacing and shape */

/** 8px base scale. */
export const space = { xs: 8, sm: 16, md: 24, lg: 32, xl: 48, xxl: 64 } as const;

/**
 * Radii are 2px (3px maximum). Soft corners were doing most of the "startup
 * toy" work, and a bound reporter has square corners. The only exceptions are
 * sheets (12px, top corners only) and genuinely circular elements.
 */
export const radius = { base: 2, max: 3, sheet: 12, circle: 9999 } as const;

export const size = {
  /** Buttons are 52px tall, 2px radius. */
  button: 52,
  /** Minimum touch target, both axes. */
  touch: 44,
  /** SettingsRow minimum height. */
  settingsRow: 60,
  /** Fixed-width control column so every control terminates on one right axis. */
  settingsControlColumn: 62,
  /** Tab bar bottom padding for the home indicator. */
  tabBarInset: 30,
  /** Active tab marker: oxblood 2px top rule. */
  tabActiveRule: 2,
} as const;

/** Switch — one geometry, app and admin. Knob moves by transform, never by layout. */
export const control = {
  switchTrack: { width: 46, height: 28, radius: radius.circle },
  switchInset: 3,
  switchKnob: 22,
  get switchTravel() {
    return this.switchTrack.width - this.switchKnob - this.switchInset * 2;
  },
  switchOff: '#D9D5CB',
  switchKnobShadow: 'rgba(20,27,45,0.28)',
  switchKnobEdge: 'rgba(20,27,45,0.06)',
} as const;

/* ------------------------------------------------------------------- type */

export const family = {
  /** All legal content: judgments, holdings, drafts, case names, briefing prose. */
  serif: 'SourceSerif4_400Regular',
  serifMedium: 'SourceSerif4_500Medium',
  /** App chrome. */
  ui: 'Inter_400Regular',
  uiMedium: 'Inter_500Medium',
  uiSemiBold: 'Inter_600SemiBold',
  /** Citations, CNR/FIR numbers, timestamps, eyebrows. */
  mono: 'JetBrainsMono_400Regular',
  monoSemiBold: 'JetBrainsMono_600SemiBold',
  /** Hindi. A missing-glyph box in a court filing is a product failure. */
  devanagariSerif: 'NotoSerifDevanagari_400Regular',
  devanagariSans: 'NotoSansDevanagari_400Regular',
} as const;

/**
 * The type scale — all ten rows of `design/DESIGN_SYSTEM.md` §Type.
 *
 * `letterSpacingEm` is stored in em because the spec is in em; `Text.tsx`
 * multiplies by fontSize, since React Native's `letterSpacing` is in px.
 *
 * BODY MINIMUM IS 16px, NOT 15. Enforced in the `Text` wrapper, never per
 * screen. Sizes below 16 are permitted only for mono metadata and eyebrows,
 * which are reference labels and not body text.
 */
export const type = {
  caseName: { fontSize: 32, lineHeight: 1.24, fontFamily: family.serifMedium },
  cardTitle: { fontSize: 23, lineHeight: 1.32, fontFamily: family.serifMedium },
  documentBody: { fontSize: 18, lineHeight: 1.7, fontFamily: family.serif },
  holding: { fontSize: 17, lineHeight: 1.68, fontFamily: family.serif },
  screenTitle: {
    fontSize: 28,
    lineHeight: 1.16,
    letterSpacingEm: -0.022,
    fontFamily: family.uiSemiBold,
  },
  /** UI body — the floor. */
  body: { fontSize: 16, lineHeight: 1.6, fontFamily: family.ui },
  metadata: { fontSize: 12, lineHeight: 1.4, fontFamily: family.mono },
  eyebrow: {
    fontSize: 11,
    lineHeight: 1.3,
    letterSpacingEm: 0.18,
    fontFamily: family.monoSemiBold,
    textTransform: 'uppercase' as const,
  },
  /**
   * Devanagari body. Line-height 1.72 — Latin spacing clips matras, which is a
   * correctness bug and not a taste call.
   */
  devanagariBody: { fontSize: 17, lineHeight: 1.72, fontFamily: family.devanagariSerif },
  devanagariUi: { fontSize: 16, lineHeight: 1.7, fontFamily: family.devanagariSans },
} as const;

/**
 * Devanagari and Latin on one line — appears on every Hindi screen, because
 * citations stay in English.
 *
 * Nominal size matching is wrong: Source Serif's x-height is larger relative to
 * Devanagari's baseline, so a Latin run at the same size reads heavier and sits
 * high. Optical weight match, not nominal.
 */
export const mixedScript = {
  latinFontSize: 15,
  latinBaselineRise: 0.5,
  latinTrackingEm: 0.004,
} as const;

/** Minimum body size. `Text.tsx` throws in development below this. */
export const MIN_BODY_SIZE = 16;

/* ----------------------------------------------------------------- motion */

/**
 * Motion is not optional; nothing cuts.
 *
 * In React Native use the SPRINGS, not timed easings. The durations below are
 * the observed settle times of those springs. Nothing exceeds 420ms.
 *
 * Reduce Motion: drop every transform, keep opacity. The seal still stamps,
 * without scale. Shimmer becomes a static tint.
 */
export const spring = {
  default: { damping: 0.38, mass: 0.72 },
  snappy: { damping: 0.25, mass: 0.8 },
  gentle: { damping: 0.5, mass: 0.78 },
} as const;

export const duration = { press: 130, fade: 180, push: 260, sheet: 380, max: 420 } as const;

export const motion = {
  /** Every tappable scales to 0.965 with −3% brightness. Press is felt, not release. */
  pressScale: 0.965,
  pressBrightness: 0.97,
  /** React Native has no brightness filter; −3% is an ink veil at 3%. */
  pressVeil: 'rgba(20,27,45,0.03)',
  /** Shimmer sweep over a skeleton. Loading is a shimmer, never a spinner. */
  shimmerTint: 'rgba(255,255,255,0.55)',
  /** List entry staggers index × 55ms, capped at index 7. */
  staggerStep: 55,
  staggerCap: 7,
  /** Cards fade up 18px as results land. */
  listRise: 18,
  /** Push from right 30px; outgoing screen scales to .95 and fades. */
  pushDistance: 30,
  pushOutScale: 0.95,
  /** Loading is a shimmer, never a spinner. */
  shimmerLoop: 1800,
  shimmerSiblingOffset: 200,
} as const;

/** Light 8ms · medium 14ms. One haptic per gesture; never the only signal. */
export const haptic = { lightMs: 8, mediumMs: 14 } as const;

/* --------------------------------------------------------------- accessors */

/** Named CSS custom properties, for `apps/admin`. Same values, no second palette. */
export const cssVariables: Record<string, string> = {
  '--paper': color.paper,
  '--paper-desk': color.paperDesk,
  '--card': color.card,
  '--ink': color.ink,
  '--ink-muted': color.inkMuted,
  '--ink-faint': color.inkFaint,
  '--rule': color.rule,
  '--hairline': color.hairline,
  '--oxblood': color.oxblood,
  '--parchment': color.parchment,
  '--verified': state.verified,
  '--caution': state.caution,
  '--caution-text': state.cautionText,
  '--caution-wash': state.cautionWash,
  '--danger': state.danger,
  '--gilt': gilt,
  '--switch-off': control.switchOff,
  '--glass-tint': glass.tint,
  '--glass-ink-tint': glass.inkTint,
  '--glass-hairline': glass.hairline,
  '--radius': `${radius.base}px`,
  '--radius-sheet': `${radius.sheet}px`,
  '--button-height': `${size.button}px`,
  '--font-serif': family.serif,
  '--font-ui': family.ui,
  '--font-mono': family.mono,
  '--font-devanagari-serif': family.devanagariSerif,
  '--font-devanagari-sans': family.devanagariSans,
};
