import { StyleSheet, View } from 'react-native';

import { Pressable } from '../../components/Pressable';
import { Text } from '../../components/Text';
import { color, radius, space } from '../../theme/tokens';

/**
 * THE TEMPLATE PICKER — `FEATURE_PARITY.md` §2.2, 10 → 80+ templates.
 *
 * ONLY LIVE TEMPLATES ARE OFFERED. `draft_templates` carries
 * `status: draft | live | retired` and a gate score, and nothing ships below 90
 * without a founder override that writes to the audit ledger. A picker that
 * listed drafts would route an advocate into a template that had not passed
 * court-format compliance, no-invented-citations, or Hindi parity.
 *
 * THE HINDI BADGE IS A GATE, NOT A LABEL.
 *
 * OD-5: Hindi drafting is released only when two Hindi law graduates approve
 * the register on 20 sampled drafts. A `हिं` badge on a template whose Hindi
 * version has not passed that review would promise a draft we are not willing
 * to stand behind — and "a bad draft gets filed", which is why the gate exists.
 * So the badge is driven by `hindiApproved`, never by the existence of a Hindi
 * string.
 *
 * DIVERGES FROM THE RENDER on the filter chips: it draws them at
 * `border-radius:9999px`, and `DESIGN_SYSTEM.md` allows 2px (3px maximum)
 * excepting sheets and genuinely circular elements. A pill chip is neither, so
 * they are built at 2px and the divergence is flagged rather than silently
 * picked either way — the same call as the reading control bar.
 */

export type DraftTemplate = {
  documentType: string;
  label: string;
  /** e.g. "s. 480, Bharatiya Nagarik Suraksha Sanhita". Never invented. */
  statuteRef?: string;
  category: string;
  /** Only `live` reaches this list. */
  status: 'draft' | 'live' | 'retired';
  /** True only once the OD-5 review has passed for this template. */
  hindiApproved: boolean;
};

export function TemplatePicker({
  templates,
  recentlyUsed,
  onPick,
}: {
  templates: DraftTemplate[];
  recentlyUsed: DraftTemplate[];
  onPick: (documentType: string) => void;
}) {
  const live = templates.filter((t) => t.status === 'live');
  const hindiCount = live.filter((t) => t.hindiApproved).length;

  return (
    <View style={styles.host}>
      {recentlyUsed.length ? (
        <View style={styles.group}>
          <Text variant="eyebrow">RECENTLY USED</Text>
          {recentlyUsed
            .filter((t) => t.status === 'live')
            .map((t) => (
              <Pressable
                accessibilityLabel={`Start a ${t.label}`}
                accessibilityRole="button"
                key={t.documentType}
                onPress={() => onPick(t.documentType)}
                style={styles.recentCard}
              >
                <View style={styles.cardTop}>
                  <Text variant="legal" scale="holding" style={styles.label}>
                    {t.label}
                  </Text>
                  <LanguageBadges hindiApproved={t.hindiApproved} />
                </View>
                {t.statuteRef ? (
                  <Text variant="ui" style={styles.muted}>
                    {t.statuteRef}
                  </Text>
                ) : null}
              </Pressable>
            ))}
        </View>
      ) : null}

      <View style={styles.group}>
        <Text variant="eyebrow">ALL TEMPLATES</Text>
        <View style={styles.grid}>
          {live.map((t) => (
            <Pressable
              accessibilityLabel={`Start a ${t.label}`}
              accessibilityRole="button"
              key={t.documentType}
              onPress={() => onPick(t.documentType)}
              style={styles.tile}
            >
              <Text variant="uiStrong" style={styles.label}>
                {t.label}
              </Text>
              <LanguageBadges hindiApproved={t.hindiApproved} />
            </Pressable>
          ))}
        </View>
      </View>

      {/*
        The count states Hindi availability honestly rather than implying every
        template is bilingual. An advocate who drafts in Hindi needs to know
        before they pick, not after the form opens in English.
      */}
      <Text variant="ui" style={styles.footer}>
        {live.length} templates · {hindiCount} available in Hindi
      </Text>
    </View>
  );
}

function LanguageBadges({ hindiApproved }: { hindiApproved: boolean }) {
  return (
    <View style={styles.badges}>
      <View style={styles.badge}>
        <Text lang="en" variant="record">
          EN
        </Text>
      </View>
      {hindiApproved ? (
        <View style={styles.badge}>
          {/* Devanagari resolves through `Text` — never a hard-coded face. */}
          <Text lang="hi" variant="ui">
            हिं
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  host: { padding: space.sm, gap: space.sm },
  group: { gap: space.xs },
  recentCard: {
    backgroundColor: color.card,
    borderWidth: 1,
    borderColor: color.rule,
    borderTopWidth: 2,
    borderTopColor: color.oxblood,
    borderRadius: radius.base,
    padding: space.sm,
    gap: 4,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: space.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  tile: {
    flexBasis: '47%',
    flexGrow: 1,
    minHeight: 92,
    backgroundColor: color.card,
    borderWidth: 1,
    borderColor: color.rule,
    borderRadius: radius.base,
    padding: space.xs,
    justifyContent: 'space-between',
    gap: space.xs,
  },
  label: { color: color.ink },
  muted: { color: color.inkMuted },
  badges: { flexDirection: 'row', gap: 4 },
  badge: {
    borderWidth: 1,
    borderColor: color.rule,
    borderRadius: radius.base,
    paddingHorizontal: 5,
  },
  footer: { color: color.inkFaint, textAlign: 'center', paddingTop: space.xs },
});
