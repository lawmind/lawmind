import { create } from 'zustand';

/**
 * Hindi is not a translated UI — it is legal Hindi in correct register, at
 * parity with English. The face, the size and the leading all change with it,
 * which is why this is app state and not a screen-level prop.
 *
 * OD-5 is open: whether S4 ships draft-in-Hindi as well as search-in-Hindi is
 * not settled. This store expresses the language, not that decision.
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
