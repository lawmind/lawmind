import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

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
  onSubmit: (event: {
    eventDate: string;
    eventType: EventType;
    orderText?: string;
    notes?: string;
  }) => void;
}) {
  const [eventDate, setEventDate] = useState(() => toIso(todayCivil()));
  const [eventType, setEventType] = useState<EventType>('hearing');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const isNote = eventType === 'note';

  function submit() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
      setError('Date must be YYYY-MM-DD.');
      return;
    }
    if (!text.trim()) {
      setError(isNote ? 'A note needs some text.' : 'What did the court record?');
      return;
    }
    onSubmit({
      eventDate,
      eventType,
      ...(isNote ? { notes: text.trim() } : { orderText: text.trim() }),
    });
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

        <Button label="Save" onPress={submit} />
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
