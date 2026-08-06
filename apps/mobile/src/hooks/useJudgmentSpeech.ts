import { useCallback, useEffect, useRef, useState } from 'react';
import * as Speech from 'expo-speech';

import type { JudgmentParagraph } from '../api/contract';

/**
 * LISTENING TO A JUDGMENT — `FEATURE_PARITY.md` §2.13.
 *
 * The advocate is "frequently over fifty", reads "in daylight, in court
 * corridors", and travels between hearings. Listening on the way to court is a
 * genuine unlock, and it carries NO legal-quality risk because it reads
 * published text aloud rather than generating anything. Nothing here touches a
 * model, a citation, or a verification tier.
 *
 * SPEECH IS DRIVEN PARAGRAPH BY PARAGRAPH, NOT AS ONE BLOB.
 *
 * The reading view already dims every paragraph except `current`, so speaking
 * one paragraph at a time and advancing on `onDone` gives the reading position
 * for free — the same visual the design shows, driven by the same state that
 * drives scroll position, in-text search and saved progress. Speaking the whole
 * judgment as one utterance would leave the eye with no idea where the voice is.
 */

/**
 * `Speech.speak` REJECTS TEXT OVER `maxSpeechInputLength` — the type declares
 * it and a long judgment paragraph will exceed it. A silently unspoken
 * paragraph is the worst outcome: the advocate hears the judgment skip a step
 * and has no way to know it happened.
 *
 * Split on sentence ends, never mid-sentence: TTS prosody is built per
 * utterance, so a chunk boundary inside a sentence is audible as a wrong pause.
 */
function chunk(text: string, limit: number): string[] {
  if (text.length <= limit) return [text];

  const out: string[] = [];
  let rest = text.trim();

  while (rest.length > limit) {
    const window = rest.slice(0, limit);

    /**
     * Prefer a sentence end, then a word break, and only split hard if a single
     * run somehow exceeds the limit with no break in it at all.
     *
     * `lastIndexOf` returns -1 when absent, and -1 IS TRUTHY — so each fallback
     * is tested with an explicit `> 0`. Chained with `||` this silently slices
     * to -1, drops one character per pass and never terminates.
     *
     * `।` is the Devanagari danda: Hindi judgment text ends sentences with it,
     * not with a full stop, so omitting it would leave every Hindi paragraph to
     * the word-break fallback.
     */
    const sentence = Math.max(
      window.lastIndexOf('. '),
      window.lastIndexOf('। '),
      window.lastIndexOf('? '),
      window.lastIndexOf('! ')
    );
    const word = window.lastIndexOf(' ');
    const cut = sentence > 0 ? sentence + 1 : word > 0 ? word : limit;

    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }

  if (rest) out.push(rest);
  return out;
}

const DEVANAGARI = /[ऀ-ॿ]/;

export type SpeechAvailability = 'ready' | 'no-hindi-voice';

export function useJudgmentSpeech({
  paragraphs,
  onParagraph,
}: {
  paragraphs: JudgmentParagraph[];
  /**
   * Fires as each paragraph begins, so the view can move the reading position.
   *
   * REPORTS THE INDEX, NOT THE PRINTED NUMBER. Speech has to address every
   * paragraph including the unnumbered header, and a printed number is
   * nullable — it is the citable unit, not an identity. Index is always
   * present and is what the list is keyed on.
   */
  onParagraph: (paragraphIndex: number) => void;
}) {
  const [speaking, setSpeaking] = useState(false);
  const [availability, setAvailability] = useState<SpeechAvailability>('ready');

  /** A voice whose language is Hindi, if the device has one installed. */
  const hindiVoice = useRef<string | undefined>(undefined);
  /** Set while stopping, so a queued `onDone` does not advance past the stop. */
  const cancelled = useRef(false);

  useEffect(() => {
    let alive = true;
    void Speech.getAvailableVoicesAsync().then((voices) => {
      if (!alive) return;
      hindiVoice.current = voices.find((v) => v.language?.toLowerCase().startsWith('hi'))?.identifier;
    });
    return () => {
      alive = false;
      // Speech outlives the screen unless it is stopped — an advocate who
      // navigates away must not still be read to from a judgment they left.
      cancelled.current = true;
      void Speech.stop();
    };
  }, []);

  const stop = useCallback(() => {
    cancelled.current = true;
    setSpeaking(false);
    void Speech.stop();
  }, []);

  /**
   * Speaks from `startAt` to the end of the judgment, one paragraph at a time.
   *
   * Recursion rather than a queue because `onDone` is the only honest signal
   * that an utterance finished — a timer would drift against the device's own
   * speech rate, which the advocate may have changed in system settings.
   */
  const speakFrom = useCallback(
    (startAt: number) => {
      cancelled.current = false;
      setSpeaking(true);

      const speakParagraph = (pIndex: number) => {
        if (cancelled.current || pIndex >= paragraphs.length) {
          setSpeaking(false);
          return;
        }

        const paragraph = paragraphs[pIndex];
        // Indexed access is `T | undefined` under `noUncheckedIndexedAccess`,
        // and the guard is real: the list can change under a running utterance
        // if the judgment reloads.
        if (!paragraph) {
          setSpeaking(false);
          return;
        }
        onParagraph(pIndex);

        /**
         * SCRIPT FOLLOWS THE STRING, not the app locale — the same rule
         * `Text.tsx` applies. A Hindi passage quoted inside an English
         * judgment is Hindi, and reading it with an English voice produces
         * sounds that are not words.
         */
        const devanagari = DEVANAGARI.test(paragraph.text);

        /**
         * NO HINDI VOICE IS AN HONEST STATE, NOT A FALLBACK.
         *
         * Reading Devanagari through an English voice does not degrade
         * gracefully — it is unintelligible. `FEATURE_PARITY.md` §2.13 requires
         * a Devanagari-capable voice, so when the device has none we stop and
         * say so rather than emitting noise the advocate has to decode.
         */
        if (devanagari && !hindiVoice.current) {
          setAvailability('no-hindi-voice');
          setSpeaking(false);
          return;
        }

        const pieces = chunk(paragraph.text, Speech.maxSpeechInputLength);

        const speakPiece = (i: number) => {
          if (cancelled.current) return;
          const piece = pieces[i];
          if (!piece) {
            speakParagraph(pIndex + 1);
            return;
          }
          Speech.speak(piece, {
            language: devanagari ? 'hi-IN' : 'en-IN',
            voice: devanagari ? hindiVoice.current : undefined,
            onDone: () => {
              if (cancelled.current) return;
              if (i + 1 < pieces.length) speakPiece(i + 1);
              else speakParagraph(pIndex + 1);
            },
            onError: () => {
              // An utterance that fails must not strand the reader mid-judgment.
              if (!cancelled.current) setSpeaking(false);
            },
          });
        };

        speakPiece(0);
      };

      speakParagraph(startAt);
    },
    [paragraphs, onParagraph]
  );

  /** Toggle from a given paragraph index — the one the advocate is looking at. */
  const toggle = useCallback(
    (fromParagraphIndex: number) => {
      if (speaking) {
        stop();
        return;
      }
      speakFrom(Math.max(0, Math.min(fromParagraphIndex, paragraphs.length - 1)));
    },
    [speaking, stop, paragraphs.length, speakFrom]
  );

  return { speaking, availability, toggle, stop };
}
