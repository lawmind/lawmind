import { create } from 'zustand';

/**
 * Hindi is not a translated UI — it is legal Hindi in correct register, at
 * parity with English. The face, the size and the leading all change with it,
 * which is why this is app state and not a screen-level prop.
 *
 * OD-5 RESOLVED 2 August 2026: Hindi drafting ships, gated — released only when
 * two Hindi law graduates approve the register on 20 sampled drafts. English
 * drafting is not blocked by that gate; the two ship independently.
 *
 * This store expresses the LANGUAGE, not the gate. Whether a given draft
 * template has passed the review is a property of that template
 * (`draft_templates`), not of the app's current locale — which is why the
 * template picker reads its own `hindiApproved` rather than this value.
 */
export type Language = 'en' | 'hi';

type LanguageState = {
  language: Language;
  setLanguage: (language: Language) => void;
};

export const useLanguageStore = create<LanguageState>((set) => ({
  language: 'en',
  setLanguage: (language) => set({ language }),
}));

export const useLanguage = (): Language => useLanguageStore((s) => s.language);
