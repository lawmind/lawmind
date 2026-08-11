import { useState } from 'react';
import * as Clipboard from 'expo-clipboard';

import { citationCopyText, type CitationDisplay } from './citationDisplay';
import { newClientKey, useOutbox } from '../state/outbox';
import { haptics } from '../theme/haptics';

/**
 * COPYING A CITATION — the whole action, in one place, for every surface.
 *
 * Extracted from `JudgmentScreen` on 11 Aug 2026 when the search card needed
 * the same action. It is deliberately NOT a new architecture: the clipboard
 * write, the haptic and the outbox enqueue are exactly what that screen already
 * did, moved so the second caller cannot drift from the first.
 *
 * WHY THE RECORD MATTERS MORE THAN THE PASTE. `SCHEMA_TRUTH.md#citation_copies`:
 * an advocate who copies a citation into their own document *"has taken it out
 * of the app entirely — they saw the badge, they may file it, and without this
 * record NO NOTIFICATION CAN EVER REACH THEM."* If that judgment is set aside
 * next March, this row is the only reason we can tell them.
 *
 * THE WRITE IS NOT AWAITED AGAINST THE NETWORK. The advocate asked for a string
 * on their clipboard; they get it now, and offline. The record follows through
 * the outbox — a court building with no signal is exactly where this is used,
 * and making the paste wait on a write would trade what they asked for against
 * what we want.
 *
 * COPY IS OFFERED IN EVERY STATE, including `set_aside` and including a
 * judgment with no citation at all. `CITATION_HARNESS.md`: refusing it would be
 * inventing a second refusal while destroying the only record that could warn
 * them later. What changes with state is the STRING — `citationCopyText` omits
 * a citation segment we do not have rather than inventing one — never whether
 * the advocate is allowed to act.
 */
export function useCopyCitation(): {
  copied: boolean;
  copy: (args: {
    caseTitle: string;
    citation: CitationDisplay;
    judgmentId: string;
    /** `SCHEMA_TRUTH.md#citation_copies` enum — `search`, `judgment_detail`, … */
    surface: string;
    citationCheckId?: string | undefined;
    matterId?: string | undefined;
  }) => void;
} {
  const [copied, setCopied] = useState(false);
  const enqueue = useOutbox((s) => s.enqueue);

  const copy: ReturnType<typeof useCopyCitation>['copy'] = ({
    caseTitle,
    citation,
    judgmentId,
    surface,
    citationCheckId,
    matterId,
  }) => {
    void Clipboard.setStringAsync(citationCopyText(caseTitle, citation));
    haptics.tap();
    setCopied(true);

    void enqueue({
      judgmentId,
      ...(citationCheckId ? { citationCheckId } : {}),
      ...(matterId ? { matterId } : {}),
      surface,
      copiedAt: new Date().toISOString(),
      clientKey: newClientKey(),
    });
  };

  return { copied, copy };
}
