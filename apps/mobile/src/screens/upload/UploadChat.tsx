import { StyleSheet, View } from 'react-native';
import { Lock } from 'lucide-react-native';

import { Text } from '../../components/Text';
import { color, radius, space } from '../../theme/tokens';

/**
 * ASK ONE DOCUMENT — `FEATURE_PARITY.md` §2.5.
 *
 * ONE DOCUMENT PER CONVERSATION, STRUCTURALLY.
 *
 * `POST /uploads/:id/chat` is scoped to a single `uploadId` in the path, and
 * there is no endpoint that accepts two document ids. That is not an oversight
 * to be worked around on the client — mixing case files in one context makes
 * the model conflate parties between matters, which is a confidentiality breach
 * between two of the same advocate's clients and is invisible in fluent output.
 *
 * So this component takes ONE upload. It has no array, no multi-select and no
 * "add another file". Adding a second document starts a new conversation, which
 * the header says out loud so the constraint reads as deliberate rather than
 * missing.
 *
 * THE DPA GATE IS SERVER-SIDE AND MUST STAY THERE.
 *
 * OD-6 is resolved on routing but the countersigned DPA is still owed, and the
 * admin surface refuses sensitive routing without one — with no founder
 * override. This screen renders that refusal honestly rather than pretending
 * the feature is merely unfinished. The client must never be the thing standing
 * between an uploaded case file and a model, so it does not decide: it reports.
 */

export type UploadTurn =
  | { role: 'advocate'; question: string }
  | { role: 'lawmind'; answer: string; passages: { page: number; text: string }[] };

export function UploadChat({
  fileName,
  turns,
  available,
}: {
  fileName: string;
  turns: UploadTurn[];
  /**
   * False until the DPA exists. Sourced from the server, never inferred here —
   * a client that decides its own eligibility to send a client's case file is
   * the wrong place for that decision to live.
   */
  available: boolean;
}) {
  return (
    <View style={styles.host}>
      <View style={styles.docBar}>
        <Lock color={color.parchment} size={16} strokeWidth={1.8} />
        <Text variant="ui" style={styles.docName}>
          {fileName}
        </Text>
        <Text variant="eyebrow" style={styles.docCount}>
          1 DOCUMENT
        </Text>
      </View>

      <Text variant="ui" style={styles.muted}>
        Answers come only from this document. Add a second file to start a new conversation.
      </Text>

      {!available ? (
        /*
          THE HONEST UNAVAILABLE STATE, not a disabled input with no explanation.
          Same rule as an AI outage: say so plainly, never serve a degraded
          substitute. An advocate who knows why can plan around it; one who sees
          a dead text field assumes the app is broken.
        */
        <View style={styles.blocked}>
          <Text variant="uiStrong">This is not switched on yet</Text>
          <Text variant="ui" style={styles.muted}>
            Asking questions of an uploaded document sends its contents to a model. We do not
            do that until the data-processing agreement covering it is signed, so this stays
            off until then.
          </Text>
        </View>
      ) : (
        turns.map((t, i) =>
          t.role === 'advocate' ? (
            <View key={i} style={styles.question}>
              <Text variant="ui" style={styles.questionText}>
                {t.question}
              </Text>
            </View>
          ) : (
            <View key={i} style={styles.answer}>
              <Text variant="ui">{t.answer}</Text>
              {/*
                EVERY ANSWER CITES A PASSAGE FROM THIS DOCUMENT. This endpoint
                returns no judgment citations at all — authority questions go to
                /search, where they pass the verification tiers. An answer here
                that named a case would be a citation nobody checked.
              */}
              {t.passages.map((p, j) => (
                <View key={j} style={styles.passage}>
                  <Text variant="legal" style={styles.passageText}>
                    {p.text}
                  </Text>
                  <Text opticalNudge variant="record">
                    Page {p.page}
                  </Text>
                </View>
              ))}
            </View>
          )
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  host: { padding: space.sm, gap: space.xs },
  docBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    backgroundColor: color.ink,
    borderRadius: radius.base,
    padding: space.xs,
  },
  docName: { color: color.parchment, flex: 1 },
  docCount: { color: color.parchment },
  muted: { color: color.inkFaint },

  blocked: {
    backgroundColor: color.card,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: color.inkFaint,
    borderRadius: radius.base,
    padding: space.sm,
    gap: space.xs,
  },

  question: {
    alignSelf: 'flex-end',
    maxWidth: '78%',
    backgroundColor: color.ink,
    borderRadius: radius.base,
    padding: space.xs,
  },
  questionText: { color: color.parchment },
  answer: {
    alignSelf: 'flex-start',
    maxWidth: '88%',
    backgroundColor: color.card,
    borderWidth: 1,
    borderColor: color.rule,
    borderRadius: radius.base,
    padding: space.xs,
    gap: space.xs,
  },
  passage: {
    backgroundColor: color.paperDesk,
    borderLeftWidth: 2,
    borderLeftColor: color.oxblood,
    padding: space.xs,
    gap: 4,
  },
  passageText: { color: color.ink },
});
