import type { Metadata } from 'next';
import {
  Inter,
  JetBrains_Mono,
  Noto_Sans_Devanagari,
  Noto_Serif_Devanagari,
  Source_Serif_4,
} from 'next/font/google';

import { cssVariables } from '@lawmind/tokens';
import { Sidebar } from '@/components/Sidebar';
import './globals.css';

/**
 * The same five families as the app. A Devanagari string rendered on the desk
 * in a face without coverage shows the same missing-glyph boxes it would on the
 * phone, and the operator reviewing an OCR correction pair is exactly the
 * person who has to be able to see it.
 */
const inter = Inter({ subsets: ['latin'], variable: '--next-font-ui' });
const sourceSerif = Source_Serif_4({ subsets: ['latin'], variable: '--next-font-serif' });
const jetBrains = JetBrains_Mono({ subsets: ['latin'], variable: '--next-font-mono' });
const notoSansDeva = Noto_Sans_Devanagari({
  subsets: ['devanagari'],
  variable: '--next-font-devanagari-sans',
});
const notoSerifDeva = Noto_Serif_Devanagari({
  subsets: ['devanagari'],
  variable: '--next-font-devanagari-serif',
});

export const metadata: Metadata = {
  title: 'Lawmind — admin',
  description: 'Internal desk. Not a user-facing surface.',
};

/**
 * Colours and metrics come from `apps/mobile/src/theme/tokens.ts` — the same
 * file the app imports, not a copy. `cssVariables` is emitted once here, so
 * every stylesheet below reads `var(--ink)` and no file in this app holds a
 * colour literal.
 *
 * The font names inside `cssVariables` are React Native family names, which
 * mean nothing to a browser; they are overridden here by the `next/font`
 * variables so the same five faces load by their web handles.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  const tokenVariables = Object.entries(cssVariables)
    .map(([key, value]) => `${key}: ${value};`)
    .join('\n  ');

  const fontOverrides = [
    '--font-ui: var(--next-font-ui);',
    '--font-serif: var(--next-font-serif);',
    '--font-mono: var(--next-font-mono);',
    '--font-devanagari-sans: var(--next-font-devanagari-sans);',
    '--font-devanagari-serif: var(--next-font-devanagari-serif);',
  ].join('\n  ');

  return (
    // The font classNames go on <html>, not <body>. `next/font` defines its
    // variables on whatever element carries the class, and `:root` below reads
    // them — put them on <body> and every `var(--font-ui)` resolves to nothing,
    // which silently drops the whole declaration and lands the desk on the
    // browser's default serif.
    <html
      className={[
        inter.variable,
        sourceSerif.variable,
        jetBrains.variable,
        notoSansDeva.variable,
        notoSerifDeva.variable,
      ].join(' ')}
      lang="en"
    >
      <head>
        <style>{`:root {\n  ${tokenVariables}\n  ${fontOverrides}\n}`}</style>
      </head>
      <body>
        <div className="shell">
          <Sidebar />
          <main className="desk">{children}</main>
        </div>
      </body>
    </html>
  );
}
