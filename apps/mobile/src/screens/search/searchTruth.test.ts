import { classifySearch, looksLikeBarePartyName, partyArmDisabled } from './searchTruth';
import type { SearchResponse, SearchResult } from '../../api/contract';

const row = { judgmentId: 'j1' } as unknown as SearchResult;

type Input = Parameters<typeof classifySearch>[0];
const response = (over: Partial<SearchResponse>): Input =>
  ({ results: [], ...over }) as unknown as Input;

describe('classifySearch', () => {
  it('results with nothing withheld is answered', () => {
    expect(classifySearch(response({ results: [row] }))).toBe('answered');
  });

  /**
   * THE ONE THAT MATTERS MOST. The lexical arm refused to rank, so nothing was
   * looked at — and "No judgments matched" would tell the advocate the corpus
   * holds no authority on their point. Measured: "bail" restricted to one court
   * over one month, a window holding 45,660 judgments, is still refused.
   */
  it('a refusal is refused, never empty', () => {
    const refusal = response({
      degraded: ['sparse_unbounded'],
      emptyBecause: { reason: 'query_too_broad_to_rank', remedy: 'add_more_terms' },
    });
    expect(classifySearch(refusal)).toBe('refused');
    expect(classifySearch(refusal)).not.toBe('empty');
  });

  it('a refusal is still a refusal when the server sends only the arm', () => {
    expect(classifySearch(response({ degraded: ['sparse_unbounded'] }))).toBe('refused');
  });

  it('a timeout with zero rows is partial, not empty and not refused', () => {
    expect(classifySearch(response({ degraded: ['sparse_timeout'] }))).toBe('partial');
    expect(classifySearch(response({ degraded: ['pin_timeout'] }))).toBe('partial');
  });

  /**
   * A SWITCHED-OFF ARM IS NOT A SLOW ONE — R14 A4.9.
   *
   * Before the fifth arm was typed, an unknown arm fell through to `partial`,
   * which the screen renders as "one search method could not complete in time"
   * over a `Try again`. Nothing timed out, and the retry could never work.
   */
  it('the disabled party arm is its own state, never partial', () => {
    const off = response({ degraded: ['party_name_disabled'] });
    expect(classifySearch(off)).toBe('party_disabled');
    expect(classifySearch(off)).not.toBe('partial');
    expect(classifySearch(off)).not.toBe('empty');
  });

  /**
   * BOTH ARMS ARRIVE TOGETHER AND THE DISABLED ONE WINS. A bare party name whose
   * arm is off falls through to the generic lexical path, which then refuses it
   * as too broad. Reading the refusal first would tell an advocate who typed a
   * person's full name to add more words to it — advice that cannot work,
   * because the arm that would have answered was turned off, not overwhelmed.
   */
  it('the disabled arm outranks a refusal that came with it', () => {
    expect(
      classifySearch(
        response({
          degraded: ['party_name_disabled', 'sparse_unbounded'],
          emptyBecause: { reason: 'query_too_broad_to_rank', remedy: 'add_more_terms' },
        }),
      ),
    ).toBe('party_disabled');
  });

  it('the disabled arm is named honestly even when other arms returned rows', () => {
    expect(
      classifySearch(response({ results: [row], degraded: ['party_name_disabled'] })),
    ).toBe('party_disabled');
  });

  it('partyArmDisabled reads the arm and nothing else', () => {
    expect(partyArmDisabled(['party_name_disabled'])).toBe(true);
    expect(partyArmDisabled(['sparse_timeout', 'party_name_disabled'])).toBe(true);
    expect(partyArmDisabled(['sparse_unbounded'])).toBe(false);
    expect(partyArmDisabled([])).toBe(false);
    expect(partyArmDisabled(undefined)).toBe(false);
  });

  it('a timeout WITH rows is still partial — the set is incomplete', () => {
    expect(classifySearch(response({ results: [row], degraded: ['dense_timeout'] }))).toBe(
      'partial',
    );
  });

  it('coverage_unknown may never render as no results', () => {
    const unknown = response({
      retrievalOutcome: {
        state: 'coverage_unknown',
        reasons: ['semantic_index_insufficient'],
        safeForGeneration: false,
        exactIdentityUsable: true,
        resultCount: 0,
        contractVersion: 1,
      },
    });
    expect(classifySearch(unknown)).toBe('unknown');
    expect(classifySearch(unknown)).not.toBe('empty');
  });

  it('an honest empty is empty — we looked, and there is nothing', () => {
    expect(classifySearch(response({}))).toBe('empty');
    expect(
      classifySearch(
        response({
          retrievalOutcome: {
            state: 'abstained',
            reasons: ['low_relevance'],
            safeForGeneration: false,
            exactIdentityUsable: true,
            resultCount: 0,
            contractVersion: 1,
          },
        }),
      ),
    ).toBe('empty');
  });

  it('a response from a server that sends none of these fields still classifies', () => {
    expect(classifySearch(response({ results: [row] }))).toBe('answered');
    expect(classifySearch(response({ results: [] }))).toBe('empty');
  });
});

describe('looksLikeBarePartyName', () => {
  it('fires on the two names measured at zero', () => {
    expect(looksLikeBarePartyName('SATENDER KUMAR ANTIL')).toBe(true);
    expect(looksLikeBarePartyName('SANJAY KUMAR MISHRA @ SANJAY MISHRA')).toBe(true);
  });

  it('does not fire on a cause title, which is the shape we are asking for', () => {
    expect(looksLikeBarePartyName('Satender Kumar Antil v. CBI')).toBe(false);
    expect(looksLikeBarePartyName('Arnesh Kumar vs State of Bihar')).toBe(false);
  });

  it('does not fire on a legal phrase', () => {
    expect(looksLikeBarePartyName('anticipatory bail cheque dishonour')).toBe(false);
    // One word is a term far more often than it is a party.
    expect(looksLikeBarePartyName('bail')).toBe(false);
    // Capitalisation is the signal, so a lowercase phrase never trips it.
    expect(looksLikeBarePartyName('cheque dishonour section')).toBe(false);
  });

  it('does not fire where an exact path already works', () => {
    expect(looksLikeBarePartyName('2026:JHHC:25953')).toBe(false);
    expect(looksLikeBarePartyName('Crl.A. 221/2018')).toBe(false);
    expect(looksLikeBarePartyName('judge:"Kania" AND section:138')).toBe(false);
  });

  it('does not fire on a long prose query', () => {
    expect(
      looksLikeBarePartyName('whether a magistrate may take cognizance without sanction'),
    ).toBe(false);
  });

  it('handles Devanagari names', () => {
    expect(looksLikeBarePartyName('सतेन्दर कुमार अंतिल')).toBe(true);
  });

  it('is false for an empty query', () => {
    expect(looksLikeBarePartyName('   ')).toBe(false);
  });
});
