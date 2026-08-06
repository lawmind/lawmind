import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { JudgmentScreen } from '../../src/screens/judgment/JudgmentScreen';

/**
 * A judgment by id — inventory rows 18–22, 83–85 and 89.
 *
 * One route, because the reading view is a MODE of a judgment rather than a
 * different screen: an advocate who taps "read" and then backs out expects to
 * be where they were, not one level further out. The overruled sub-states are
 * the same screen with different data, which is the whole point of deriving
 * what renders from the row instead of storing it.
 */
export default function Route() {
  const router = useRouter();
  const { id, read, para, check } = useLocalSearchParams<{
    id: string;
    read?: string;
    para?: string;
    /**
     * The verification-record handle, carried from the search result that led
     * here. `GET /judgments/:id` does not return one and should not: a
     * verification record belongs to a citation as it was SHOWN — which result,
     * on which search — and a judgment opened cold has no such moment. Absent is
     * a normal state and the verification surfaces say so.
     */
    check?: string;
  }>();

  /**
   * READING IS A QUERY PARAM, NOT LOCAL STATE, BECAUSE PD-9 REQUIRES PARAGRAPH
   * ANCHORS TO BE LINKABLE. A mode held in `useState` has no URL, so "¶ 11 of
   * this judgment" cannot be sent to a junior, pasted into a matter note, or
   * reopened where it was left. `?read=1&para=11` is the anchor.
   */
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <JudgmentScreen
        citationCheckId={check}
        judgmentId={id}
        onBack={() => router.back()}
        onOpenJudgment={(next) => router.push({ pathname: '/judgment/[id]', params: { id: next } })}
        onOpenTreatment={() => router.push({ pathname: '/precedent/[id]', params: { id } })}
        onSetReading={(next, paragraphNumber) =>
          router.setParams({
            read: next ? '1' : undefined,
            para: paragraphNumber ? String(paragraphNumber) : undefined,
          })
        }
        openParagraph={para ? Number(para) : undefined}
        reading={read === '1'}
      />
    </>
  );
}
