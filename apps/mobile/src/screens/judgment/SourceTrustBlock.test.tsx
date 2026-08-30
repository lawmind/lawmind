import { render, screen } from '@testing-library/react-native';

import { BodyTextWithheld, SourceTrustBlock } from './SourceTrustBlock';
import type { JudgmentDetail } from '../../api/contract';

/**
 * THE CLAIMS THIS BLOCK IS NOT ALLOWED TO MAKE — R12 §5, and the frozen
 * registry's `bannedClaim` on `judgment.source_evidence`.
 *
 * Two numbers, and conflating them would be the worst claim in the registry:
 *
 *   · `source_url` present ......... 18,758,460 / 18,758,460 = 100%
 *   · retained source artifact ..... 14,210 / 18,758,460 = 0.0758%
 *   · recorded provenance .......... 5,830 / 18,758,460 = 0.031%
 *
 * So "Source: <court>, <url>" is true everywhere and "verified from the
 * retained official PDF" is false for 99.92% of the corpus. The absence of a
 * provenance RECORD is not the absence of provenance, and must never render as
 * a quality claim about the judgment.
 */

const judgment = (over: Partial<JudgmentDetail> = {}): JudgmentDetail =>
  ({
    judgmentId: 'j1',
    caseTitle: 'A v. B',
    court: 'High Court of Jharkhand',
    sourceUrl: 'https://example.invalid/j/1',
    caseNumber: 'Crl.A. 221/2018',
    ...over,
  }) as unknown as JudgmentDetail;

describe('SourceTrustBlock', () => {
  it('always says where the document came from — the one fact true of every row', async () => {
    await render(<SourceTrustBlock judgment={judgment()} />);
    expect(screen.getByText(/Source · High Court of Jharkhand/)).toBeTruthy();
    expect(screen.getByText(/Open the court’s copy/)).toBeTruthy();
  });

  it('says nothing about provenance where the row carries no record', async () => {
    await render(
      <SourceTrustBlock
        judgment={judgment({
          provenance: {
            source: null,
            sourceEdition: null,
            basis: null,
            recordedAt: null,
            recorded: false,
          },
        })}
      />,
    );
    // Not "source unknown" — that would be a quality claim about the judgment
    // when the only missing thing is a structured record.
    expect(screen.queryByText(/Recorded provenance/)).toBeNull();
    expect(screen.queryByText(/unknown source/i)).toBeNull();
  });

  it('states the recorded provenance where the row has one', async () => {
    await render(
      <SourceTrustBlock
        judgment={judgment({
          provenance: {
            source: 'aws_hc',
            sourceEdition: 'court_raw',
            basis: 'aws_open_data',
            recordedAt: '2026-08-29T00:00:00.000Z',
            recorded: true,
          },
        })}
      />,
    );
    expect(screen.getByText(/Recorded provenance · aws_hc · court_raw/)).toBeTruthy();
  });

  it('never claims verification from a retained official PDF', async () => {
    await render(
      <SourceTrustBlock
        judgment={judgment({
          provenance: {
            source: 'sci_pdf',
            sourceEdition: 'court_raw',
            basis: 'public_official',
            recordedAt: '2026-08-29T00:00:00.000Z',
            recorded: true,
          },
        })}
      />,
    );
    expect(screen.queryByText(/retained official PDF/i)).toBeNull();
    expect(screen.queryByText(/verified from/i)).toBeNull();
  });

  it('names a reporter edition, because it is not the court’s own words', async () => {
    await render(<SourceTrustBlock judgment={judgment({ textOrigin: 'REPORTER_EDITION' })} />);
    expect(screen.getByText(/law reporter’s edition/)).toBeTruthy();
  });

  it('states an unknown edition as unknown, never as court-sourced', async () => {
    await render(<SourceTrustBlock judgment={judgment({ textOrigin: 'UNKNOWN' })} />);
    expect(screen.getByText(/edition of this text is not recorded/)).toBeTruthy();
    expect(screen.queryByText(/court’s own publication/)).toBeNull();
  });

  /**
   * `DATE_UNCHECKED` is what the R12 probe observed on the sampled response.
   * Present is not verified, and the screen must not imply otherwise.
   */
  it('says an unchecked date has not been checked', async () => {
    await render(<SourceTrustBlock judgment={judgment({ dateQualityState: 'DATE_UNCHECKED' })} />);
    expect(screen.getByText(/has not been checked/)).toBeTruthy();
  });

  it('warns only where the date is contradicted', async () => {
    await render(<SourceTrustBlock judgment={judgment({ dateQualityState: 'DATE_SUSPECT' })} />);
    expect(screen.getByText(/does not agree with the court’s own record/)).toBeTruthy();
  });

  it('says nothing about a verified date — silence is the verified state', async () => {
    await render(<SourceTrustBlock judgment={judgment({ dateQualityState: 'DATE_VERIFIED' })} />);
    expect(screen.queryByText(/has not been checked/)).toBeNull();
    expect(screen.queryByText(/does not agree/)).toBeNull();
  });
});

describe('BodyTextWithheld', () => {
  it('renders nothing when the body text is fine', async () => {
    const { toJSON } = await render(
      <BodyTextWithheld
        judgment={judgment({
          bodyText: { state: 'TEXT_UNKNOWN', grade: 'NONE', evidenceWithheld: false },
        })}
      />,
    );
    expect(toJSON()).toBeNull();
  });

  it('renders nothing when the server sent no envelope at all', async () => {
    const { toJSON } = await render(<BodyTextWithheld judgment={judgment()} />);
    expect(toJSON()).toBeNull();
  });

  /**
   * NEVER AN EMPTY PAGE. An empty reader reads as "this judgment has no text",
   * which is a claim about the court rather than about our copy.
   */
  it('states the refusal, and keeps everything else true', async () => {
    await render(
      <BodyTextWithheld
        judgment={judgment({
          bodyText: { state: 'TEXT_DAMAGED', grade: 'PROOF', evidenceWithheld: true },
        })}
      />,
    );
    expect(screen.getByText(/text of this judgment is not readable/)).toBeTruthy();
    expect(screen.getByText(/Everything else on this page/)).toBeTruthy();
    expect(screen.getByText(/Open the court’s copy/)).toBeTruthy();
  });
});
