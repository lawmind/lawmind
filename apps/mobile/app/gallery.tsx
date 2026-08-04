import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { FolderOpen } from 'lucide-react-native';

import { Button } from '../src/components/Button';
import { Card } from '../src/components/Card';
import { CitationFooter } from '../src/components/CitationFooter';
import { CitationMark } from '../src/components/CitationMark';
import { MOCK_RESULTS } from '../src/api/fixtures';
import { EmptyState } from '../src/components/EmptyState';
import { Input } from '../src/components/Input';
import { Screen } from '../src/components/Screen';
import { SectionRule } from '../src/components/SectionRule';
import { SettingsRow } from '../src/components/SettingsRow';
import { Sheet } from '../src/components/Sheet';
import { SkeletonCard } from '../src/components/SkeletonCard';
import { Switch } from '../src/components/Switch';
import { Text } from '../src/components/Text';
import { Toast } from '../src/components/Toast';
import { useLanguageStore } from '../src/state/language';
import { color, space } from '../src/theme/tokens';

/**
 * Every primitive, in both languages, on one screen. Compare against
 * `design/screens/renders/30-system-refined@2x.png`.
 *
 * This is also the Hindi gate: the Devanagari block below is chosen to break a
 * font without proper coverage or shaping — conjuncts (क्ष ज्ञ श्र द्व ट्र), a
 * vowel sign above and below the same cluster, a nukta form (फ़), and a
 * vocalic ऋ/कृ. If any of those renders as a dotted circle, a box, or a matra
 * clipped by the line box, the type is wrong and a court filing produced from
 * it would be wrong too.
 *
 * Build scaffolding, not one of the 87.
 */

/** Devanagari and Latin on one line — citations stay English (PD-12). */
const HINDI_MIXED = 'यह निर्णय MOCK 2026 EXAMPLE 1 में दर्ज है।';
const HINDI_STRESS = 'क्षत्रिय ज्ञानेश्वर श्रुति द्वंद्व हिन्दी ऋतु कृष्ण फ़ैसला ट्रैक निर्णय';
const HINDI_BODY =
  'उच्च न्यायालय ने अभियुक्त की जमानत याचिका स्वीकार करते हुए अभिलेख पर उपलब्ध साक्ष्य का पुनरावलोकन किया।';

/** A quote-leading string, to exercise hanging punctuation and the formatter. */
const LEGAL_QUOTE =
  '"The husband\'s contention, resting on sections 302-304 and the Penal Code, cannot be sustained on this record."';

export default function Gallery() {
  const { language, setLanguage } = useLanguageStore();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [switched, setSwitched] = useState(true);
  const hindi = language === 'hi';

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Primitives' }} />
      <ScrollView contentContainerStyle={styles.body}>
        <Text variant="eyebrow">Design system</Text>
        <Text variant="uiStrong" scale="title">
          Primitives
        </Text>

        <SettingsRow
          control={
            <Switch
              accessibilityLabel="Hindi"
              onValueChange={(next) => setLanguage(next ? 'hi' : 'en')}
              value={hindi}
            />
          }
          label="हिन्दी"
          subtitle="Switches the face, the size and the leading"
        />

        <SectionRule label="Type scale" />
        <Card style={styles.stack}>
          <Text variant="legal" scale="caseName">
            Mock Petitioner v. Mock State
          </Text>
          <Text variant="legal" scale="cardTitle">
            Bail — custody exceeding the statutory period
          </Text>
          <Text variant="legal" scale="documentBody">
            {LEGAL_QUOTE}
          </Text>
          <Text variant="legal">
            Holding row of the scale, 17 on 1.68. Source Serif 4 carries all legal content.
          </Text>
          <Text variant="ui">UI body — the floor. 16 on 1.6, Inter 400.</Text>
          <Text variant="uiStrong">UI strong — Inter 500.</Text>
          <Text opticalNudge variant="record">
            MOCK 2026 EXAMPLE 1 · 11–02–2026 · CNR MOCK000000002026
          </Text>
          <Text variant="eyebrow">Section eyebrow</Text>
        </Card>

        <SectionRule label="Devanagari" />
        <Card style={styles.stack}>
          <Text lang="hi" variant="legal">
            {HINDI_BODY}
          </Text>
          <Text lang="hi" variant="legal">
            {HINDI_STRESS}
          </Text>
          <Text lang="hi" variant="legal">
            {HINDI_MIXED}
          </Text>
          <Text lang="hi" variant="ui">
            {HINDI_BODY}
          </Text>
          <Text lang="hi" variant="eyebrow">
            खंड शीर्षक
          </Text>
        </Card>

        <SectionRule label="Buttons" />
        <View style={styles.stack}>
          <Button label={hindi ? 'जारी रखें' : 'Continue'} onPress={() => setToast('Primary')} />
          <Button
            label={hindi ? 'रद्द करें' : 'Cancel'}
            onPress={() => setToast('Secondary')}
            variant="secondary"
          />
          <Button
            label={hindi ? 'और देखें' : 'More'}
            onPress={() => setToast('Tertiary')}
            variant="tertiary"
          />
          <Button disabled label={hindi ? 'अनुपलब्ध' : 'Unavailable'} />
        </View>

        <SectionRule label="Input" />
        <Input
          label={hindi ? 'सी एन आर संख्या' : 'CNR number'}
          placeholder="MOCK000000002026"
        />
        <Input
          error={hindi ? 'यह संख्या मान्य नहीं है' : 'That number is not valid'}
          label={hindi ? 'नामांकन संख्या' : 'Enrolment number'}
          placeholder="D/0000/2026"
        />

        <SectionRule label="Settings rows" />
        <Card>
          <SettingsRow
            control={<Switch onValueChange={setSwitched} value={switched} />}
            label={hindi ? 'सूचनाएँ' : 'Notifications'}
          />
          <SettingsRow
            label={hindi ? 'भाषा' : 'Language'}
            subtitle={hindi ? 'ऐप और मसौदे' : 'App and drafts'}
            value={hindi ? 'हिन्दी' : 'English'}
          />
          <SettingsRow label={hindi ? 'खाता' : 'Account'} onPress={() => setToast('Row')} />
        </Card>

        <SectionRule label="Loading" />
        <SkeletonCard index={0} />
        <SkeletonCard index={1} />

        <SectionRule label="Empty" />
        <EmptyState
          actions={[{ label: hindi ? 'पहला मुक़दमा जोड़ें' : 'Add your first matter' }]}
          body={
            hindi
              ? 'यहाँ आपके मुक़दमे दिखेंगे। एक जोड़ने में लगभग एक मिनट लगता है।'
              : 'Your matters appear here. Adding one takes about a minute, and the first briefing arrives the evening before your next listing.'
          }
          icon={FolderOpen}
          title={hindi ? 'कोई मुक़दमा नहीं' : 'No matters yet'}
        />

        {/*
          The two marks that render, side by side, so the greyscale check is a
          look rather than an archaeology exercise. They differ by SHAPE — a
          dashed edge against a filled block — which is the only property that
          survives sunlight washout and colour-vision deficiency.
        */}
        <SectionRule label="Citation marks" />
        <View style={styles.stack}>
          <CitationMark label="Not confirmed" tone="unconfirmed" />
          <CitationMark label="Doubted · referred" tone="moved-quiet" />
          <CitationMark label="Paras 19–20 set aside" tone="moved" />
          <CitationMark label="Overruled" tone="moved-danger" />
        </View>

        <SectionRule label="Draft footer" />
        <CitationFooter citations={MOCK_RESULTS.slice(0, 2)} />
        <CitationFooter citations={MOCK_RESULTS.slice(0, 3)} />

        <SectionRule label="Chrome" />
        <Button
          label={hindi ? 'शीट खोलें' : 'Open sheet'}
          onPress={() => setSheetOpen(true)}
          variant="secondary"
        />
        <Button
          label={hindi ? 'टोस्ट दिखाएँ' : 'Show toast'}
          onPress={() => setToast(hindi ? 'सहेजा गया' : 'Saved')}
          variant="tertiary"
        />
        <Text variant="ui" style={styles.note}>
          Glass appears on the tab bar, the sheet and the toast — and nowhere else. The cards above
          are opaque.
        </Text>
      </ScrollView>

      <Sheet onDismiss={() => setSheetOpen(false)} visible={sheetOpen}>
        <View style={styles.sheetBody}>
          <Text variant="legal" scale="cardTitle">
            {hindi ? 'शीट' : 'Sheet'}
          </Text>
          <Text variant="ui">
            12px top corners, blur 24, hairline on the leading edge. Chrome, not content.
          </Text>
          <Button label={hindi ? 'बंद करें' : 'Close'} onPress={() => setSheetOpen(false)} />
        </View>
      </Sheet>

      <Toast message={toast} onDone={() => setToast(null)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.sm, gap: space.sm, paddingBottom: space.xxl },
  stack: { gap: space.sm },
  note: { color: color.inkMuted },
  sheetBody: { padding: space.sm, gap: space.sm },
});
