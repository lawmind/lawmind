import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';

import { TreatmentCard } from './TreatmentCard';
import type { OverruledStatus, Treatment } from '../../api/contract';
import { state } from '../../theme/tokens';

/**
 * THE RULE UNDER TEST: a node's OWN good-law status is weighted by which of the
 * three states it is in — not merely worded differently.
 *
 * Until 11 Aug 2026 all three drew `state.cautionText`. The sentences differed
 * and the colour did not, so a treating judgment that had ITSELF been set aside
 * read exactly like one that had merely been doubted. `CITATION_HARNESS.md`
 * §"When the law moves" makes no exception for a citation-network row, and the
 * card had no test at all, so nothing was ever going to catch it.
 *
 * The second rule, older and still enforced here: `relationship` and
 * `overruledStatus` answer different questions and must never merge.
 */

const base: Treatment = {
  judgmentId: 'jdg_treating',
  caseTitle: 'Mock Later Bench v. Mock State',
  neutralCitation: 'MOCK 2021 EXAMPLE 44',
  court: 'Mock SC',
  judgmentDate: '2021-03-02',
  relationship: 'followed',
  verificationState: 'verified',
  verifiedBySource: 'corpus',
  overruledStatus: 'none',
  asOf: '2026-08-06T00:00:00.000Z',
};

const draw = (overruledStatus: OverruledStatus, relationship = base.relationship) =>
  render(<TreatmentCard onOpen={() => {}} treatment={{ ...base, overruledStatus, relationship }} />);

/** The sentence each state puts on the card, all three carrying "itself". */
const SENTENCE: Record<Exclude<OverruledStatus, 'none'>, string> = {
  set_aside: 'This judgment has itself been set aside.',
  partly_set_aside: 'Part of this judgment has itself been set aside.',
  doubted: 'This judgment has itself been doubted.',
};

const inkOf = (sentence: string) =>
  (StyleSheet.flatten(screen.getByText(sentence).props.style) as { color?: string }).color;

describe('the treating judgment’s own status', () => {
  it('says nothing when the treating judgment is itself good law', async () => {
    await draw('none');

    for (const sentence of Object.values(SENTENCE)) {
      expect(screen.queryByText(sentence)).toBeNull();
    }
  });

  it.each(['set_aside', 'partly_set_aside', 'doubted'] as const)(
    'states %s in its own words, and says "itself" so it is not read as the relationship',
    async (status) => {
      await draw(status);

      expect(screen.getByText(SENTENCE[status])).toBeTruthy();
    }
  );

  it('draws the three states in three different inks, none borrowed from another', async () => {
    const seen: (string | undefined)[] = [];
    for (const status of ['set_aside', 'partly_set_aside', 'doubted'] as const) {
      await draw(status);
      seen.push(inkOf(SENTENCE[status]));
    }

    expect(new Set(seen).size).toBe(3);
    expect(seen.every(Boolean)).toBe(true);
  });

  /**
   * Pinned specifically, because the regression this replaces is the one that
   * was live: `set_aside` drawn in the same caution ink as `doubted`.
   */
  it('pins set_aside to danger — the state that disables an authority', async () => {
    await draw('set_aside');

    expect(inkOf(SENTENCE.set_aside)).toBe(state.danger);
  });

  it('never gives doubted the danger ink, because it still binds', async () => {
    await draw('doubted');

    expect(inkOf(SENTENCE.doubted)).not.toBe(state.danger);
  });
});

describe('the two questions stay apart', () => {
  /**
   * A judgment that OVERRULED the authority being read can itself have been
   * overruled since. The card must answer both without merging them.
   */
  it('renders the relationship and the own-status separately when both are present', async () => {
    await draw('set_aside', 'overruled');

    expect(screen.getByText('OVERRULED')).toBeTruthy();
    expect(screen.getByText('The law has moved — this reliance was overruled')).toBeTruthy();
    expect(screen.getByText(SENTENCE.set_aside)).toBeTruthy();
  });

  it('says nothing about own-status on a node that merely overruled the authority', async () => {
    await draw('none', 'overruled');

    expect(screen.getByText('The law has moved — this reliance was overruled')).toBeTruthy();
    for (const sentence of Object.values(SENTENCE)) {
      expect(screen.queryByText(sentence)).toBeNull();
    }
  });
});

describe('verification stays silent unless it failed', () => {
  it('draws no verification mark on a verified row', async () => {
    await draw('none');

    expect(screen.queryByText('We could not confirm this judgment exists')).toBeNull();
  });

  it.each(['unverified', 'failed'] as const)('marks %s, and identically', async (verificationState) => {
    await render(
      <TreatmentCard onOpen={() => {}} treatment={{ ...base, verificationState }} />
    );

    expect(screen.getByText('We could not confirm this judgment exists')).toBeTruthy();
  });
});

/**
 * THE SIX RELATIONSHIP VALUES THE DATABASE ACTUALLY STORES.
 *
 * `judgment_citations.relationship` holds `cites | followed | distinguished |
 * doubted | overruled | overruled_in_part` (`packages/db/src/schema.ts:711`),
 * and `judgments/treatment.ts` applies NO filter — its `ORDER BY` even has an
 * `ELSE 4` bucket for the two the client did not know about. The client union
 * declared four until 11 Aug 2026, so a lookup miss returned `undefined` and:
 *
 *   · `cites` and `overruled_in_part` rendered a BLANK relationship label;
 *   · `lawMoved` tested `=== 'overruled'`, so a bench that overruled this
 *     authority IN PART was drawn as an ordinary citing judgment — no amber,
 *     no headline — with 20 such rows live in production.
 */
describe('every relationship the database can store', () => {
  it.each([
    ['cites', 'CITED'],
    ['followed', 'FOLLOWED'],
    ['distinguished', 'DISTINGUISHED'],
    ['doubted', 'DOUBTED'],
    ['overruled', 'OVERRULED'],
    ['overruled_in_part', 'OVERRULED IN PART'],
  ] as const)('labels %s rather than rendering blank', async (relationship, label) => {
    await render(<TreatmentCard onOpen={() => {}} treatment={{ ...base, relationship }} />);

    expect(screen.getByText(label)).toBeTruthy();
  });

  /**
   * The column is text server-side, not an enum, so a seventh value can arrive
   * without this client knowing. It must say what it received rather than
   * nothing — a blank relationship reads as "no treatment", which is a claim.
   */
  it('renders an unrecognised relationship instead of swallowing it', async () => {
    await render(
      <TreatmentCard onOpen={() => {}} treatment={{ ...base, relationship: 'affirmed' as never }} />
    );

    expect(screen.getByText('AFFIRMED')).toBeTruthy();
  });
});

/**
 * THE PHRASE THE COURT PRINTED — what makes the claim on the card checkable.
 *
 * `judgments/treatment.ts` sends `evidence` on every row, "present only for a
 * real treatment, so any row claiming one can be audited back to its own text".
 * The client did not declare the field until 11 Aug 2026, so this card asserted
 * that a later bench distinguished or overruled an authority and offered
 * nothing to check that against.
 */
describe('the evidence for the treatment', () => {
  it('quotes the court’s own phrase where the server sent one', async () => {
    await render(
      <TreatmentCard
        onOpen={() => {}}
        treatment={{ ...base, evidence: 'we respectfully differ from the view taken therein' }}
      />
    );

    expect(
      screen.getByText('“we respectfully differ from the view taken therein”')
    ).toBeTruthy();
  });

  /** Absent is ordinary — plenty of rows carry no extracted phrase. */
  it('omits the line entirely rather than apologising for it', async () => {
    await render(<TreatmentCard onOpen={() => {}} treatment={{ ...base, evidence: null }} />);

    expect(screen.queryByText(/“/)).toBeNull();
  });
});

describe('overruled in part is the law moving', () => {
  it('says so, and names the partial extent', async () => {
    await render(
      <TreatmentCard onOpen={() => {}} treatment={{ ...base, relationship: 'overruled_in_part' }} />
    );

    expect(
      screen.getByText('The law has moved — this reliance was overruled in part')
    ).toBeTruthy();
  });

  it('keeps the full wording for a wholly overruled reliance', async () => {
    await render(
      <TreatmentCard onOpen={() => {}} treatment={{ ...base, relationship: 'overruled' }} />
    );

    expect(screen.getByText('The law has moved — this reliance was overruled')).toBeTruthy();
  });

  it('says nothing of the kind for an ordinary citing judgment', async () => {
    await render(<TreatmentCard onOpen={() => {}} treatment={{ ...base, relationship: 'cites' }} />);

    expect(screen.queryByText(/The law has moved/)).toBeNull();
  });
});
