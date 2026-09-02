import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAttempt } from '../../hooks/useAttempt';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Pressable } from '../../components/Pressable';
import { Sheet } from '../../components/Sheet';
import { Text } from '../../components/Text';
import { toIso, todayCivil } from '../../theme/hearingDate';
import { color, radius, space } from '../../theme/tokens';

/**
 * "Add event" — `renders/09-matter-detail.png`'s sticky footer button.
 * `POST /matters/:id/events` shape: `{ eventDate, eventType, orderText?,
 * notes? }`, `services/api/src/matters/route.ts`'s `createEventBody`.
 *
 * ONE FORM, FOUR TYPES, TWO DIFFERENT FIELDS. `hearing`/`order`/`filing`
 * write the court record (`orderText` — always visible to a share);
 * `note` writes the advocate's own thinking (`notes` — private by default,
 * per-note shareable, PD-4). The canvas's own flow-flag names this: "the
 * timeline mixes court record... and the advocate's private notes. Those
 * need different weight." The field shown adapts to the type rather than
 * showing both and hoping the advocate picks the right one.
 */

const EVENT_TYPES = [
  { value: 'hearing', label: 'Hearing' },
  { value: 'order', label: 'Order' },
  { value: 'filing', label: 'Filing' },
  { value: 'note', label: 'Note' },
] as const;

type EventType = (typeof EVENT_TYPES)[number]['value'];

export function AddEventSheet({
  visible,
  onDismiss,
  onSubmit,
}: {
  visible: boolean;
  onDismiss: () => void;
  /**
   * RESOLVES TO WHETHER THE EVENT IS DURABLY WRITTEN. It used to return `void`,
   * so this sheet could not tell a landed write from a refused one and cleared
   * the advocate's typed text either way. The attempt key travels with it — the
   * caller sends it, this component owns its lifetime.
   */
  onSubmit: (
    event: {
      eventDate: string;
      eventType: EventType;
      orderText?: string;
      notes?: string;
    },
    attemptKey: string,
  ) => Promise<boolean>;
}) {
  const [eventDate, setEventDate] = useState(() => toIso(todayCivil()));
  const [eventType, setEventType] = useState<EventType>('hearing');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  /**
   * THIS SHEET HAD NO IN-FLIGHT PROTECTION AT ALL — not a ref, not state, not
   * even a `disabled` prop. `submit()` called `onSubmit` and returned, so two
   * taps in one frame appended TWO events to the matter timeline, and the
   * timeline is the one authoritative record of what the court did.
   *
   * The latch is taken on the first line, before validation and before any
   * state transition, because a React state commit is asynchronous and a tap is
   * not. See `useAttempt`.
   */
  const attempt = useAttempt();

  const isNote = eventType === 'note';

  async function submit() {
    const attemptKey = attempt.begin();
    // The second synchronous tap. It does nothing at all — not an error, not a
    // second request. One tap and one double-tap must be indistinguishable in
    // the timeline.
    if (attemptKey === null) return;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
      setError('Date must be YYYY-MM-DD.');
      // The key is KEPT: a validation failure never reached the server, and
      // R16 §5 guarantees the corrected request may reuse it.
      attempt.settle();
      return;
    }
    if (!text.trim()) {
      setError(isNote ? 'A note needs some text.' : 'What did the court record?');
      attempt.settle();
      return;
    }

    const saved = await onSubmit(
      {
        eventDate,
        eventType,
        ...(isNote ? { notes: text.trim() } : { orderText: text.trim() }),
      },
      attemptKey,
    );

    if (!saved) {
      /*
        THE TEXT STAYS. It used to be cleared unconditionally, before anyone
        knew whether the write landed — so a failed save left the advocate
        looking at an error message and an empty box, with the court's own words
        gone. The key stays too: pressing Save again is the same intentional
        mutation, and reusing it is what stops the retry from writing a second
        event if the first one actually committed.
      */
      attempt.settle();
      return;
    }

    attempt.complete();
    setText('');
    setError(null);
  }

  return (
    <Sheet onDismiss={onDismiss} visible={visible}>
      <View style={styles.body}>
        <Text variant="eyebrow">Add event</Text>

        <View style={styles.typeRow}>
          {EVENT_TYPES.map((t) => (
            <Pressable
              key={t.value}
              onPress={() => setEventType(t.value)}
              style={[styles.type, eventType === t.value ? styles.typeOn : null]}
            >
              <Text variant="ui" style={eventType === t.value ? styles.typeOnLabel : undefined}>
                {t.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Input label="Date" onChangeText={setEventDate} placeholder="YYYY-MM-DD" value={eventDate} />

        <Input
          label={isNote ? 'Your note' : 'What the court recorded'}
          multiline
          onChangeText={setText}
          placeholder={isNote ? 'Private to you unless you share it' : "The court's own words"}
          value={text}
        />

        {isNote ? (
          <Text variant="ui" style={styles.muted}>
            Private by default. Sharing is per note, from the timeline, once saved.
          </Text>
        ) : (
          <Text variant="ui" style={styles.muted}>
            The court record — always visible to anyone this matter is shared with.
          </Text>
        )}

        {error ? (
          <Text variant="ui" style={styles.error}>
            {error}
          </Text>
        ) : null}

        <Button label="Save" onPress={() => void submit()} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.sm, gap: space.xs, paddingBottom: space.md },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  type: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: space.sm,
    borderWidth: 1,
    borderColor: color.rule,
    borderRadius: radius.base,
  },
  typeOn: { backgroundColor: color.ink, borderColor: color.ink },
  typeOnLabel: { color: color.card },
  muted: { color: color.inkMuted },
  error: { color: color.oxblood },
});
