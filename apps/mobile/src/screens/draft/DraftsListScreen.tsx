import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { EmptyState } from '../../components/EmptyState';
import { Pressable } from '../../components/Pressable';
import { Screen } from '../../components/Screen';
import { SkeletonCard } from '../../components/SkeletonCard';
import { Text } from '../../components/Text';
import { api } from '../../api/client';
import type { DraftListItem } from '../../api/contract';
import { color, radius, space } from '../../theme/tokens';

/**
 * DRAFTS — R4, `docs/API_CONTRACTS.md` §Drafts list, added 11 Aug 2026.
 *
 * The only tab route still wired to a bare `ScreenShell` until now.
 * `GET /documents/:id` has existed since 8 Aug, but nothing could list what
 * an advocate had already written to obtain an id to pass it — this screen is
 * that list, and only that: no `content` crosses the wire here (sensitive-
 * class, and twenty drafts would ship twenty full documents to render twenty
 * titles), so a row shows what the list response actually carries.
 *
 * `unverifiedCount` COUNTS `failed` TOGETHER WITH `unverified`. Copied as
 * "could not confirm", never "verification failed" — the advocate cannot act
 * on the difference between the two, and a provider outage must not read as a
 * gap in the corpus. `docs/CITATION_HARNESS.md`.
 */
export function DraftsListScreen({
  onOpenDocument,
}: {
  onOpenDocument: (documentId: string) => void;
}) {
  const [documents, setDocuments] = useState<DraftListItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    void api.documents().then((r) => {
      if (r.ok) setDocuments(r.data.documents);
      else setLoadError(r.error.message);
    });
  }, []);

  return (
    <Screen topInset>
      <View style={styles.head}>
        <Text variant="eyebrow">Drafts</Text>
      </View>

      {documents === null ? (
        <View style={styles.list}>
          {loadError ? (
            <EmptyState
              actions={[]}
              body={loadError}
              title="We could not load your drafts"
            />
          ) : (
            [0, 1, 2].map((i) => <SkeletonCard index={i} key={i} />)
          )}
        </View>
      ) : documents.length === 0 ? (
        <View style={styles.list}>
          {/*
            NO "Start a draft" ACTION HERE. `POST /documents` has no client
            caller yet — offering a button with nowhere to go would be the
            same dead-end this screen's empty states elsewhere refuse to draw.
          */}
          <EmptyState
            body="Documents you generate will appear here, newest first."
            title="No drafts yet"
          />
        </View>
      ) : (
        <FlatList
          contentContainerStyle={styles.list}
          data={documents}
          keyExtractor={(d) => d.documentId}
          renderItem={({ item }) => <DraftRow document={item} onPress={() => onOpenDocument(item.documentId)} />}
        />
      )}
    </Screen>
  );
}

function DraftRow({ document, onPress }: { document: DraftListItem; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.card}>
      <Text variant="uiStrong">{document.matterTitle ?? humanize(document.documentType)}</Text>
      <Text variant="ui" style={styles.muted}>
        {document.matterTitle ? humanize(document.documentType) : formatWhen(document.createdAt)}
        {document.language === 'hi' ? ' · हिं' : ''}
      </Text>
      <Text variant="ui" style={styles.muted}>
        {countLine(document)}
      </Text>
    </Pressable>
  );
}

/** "bail_application" -> "Bail application". Not a translation, just readable. */
function humanize(documentType: string): string {
  const s = documentType.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "6 August 2026." Never a raw ISO timestamp on screen. */
function formatWhen(at: string): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return at;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * "3 citations, could not confirm 1" — never "verification failed". A draft
 * with nothing to flag says only the count; one flagged is the one thing an
 * advocate must see before filing.
 */
function countLine(document: DraftListItem): string {
  const citations = document.citationCount === 1 ? '1 citation' : `${document.citationCount} citations`;
  if (document.unverifiedCount === 0) return citations;
  const flagged =
    document.unverifiedCount === 1 ? 'could not confirm 1' : `could not confirm ${document.unverifiedCount}`;
  return `${citations}, ${flagged}`;
}

const styles = StyleSheet.create({
  head: { padding: space.sm, paddingBottom: 0 },
  list: { padding: space.sm, gap: space.sm, paddingBottom: space.xxl },
  card: {
    backgroundColor: color.card,
    borderRadius: radius.base,
    borderWidth: 1,
    borderColor: color.rule,
    padding: space.sm,
    gap: 2,
  },
  muted: { color: color.inkMuted },
});
