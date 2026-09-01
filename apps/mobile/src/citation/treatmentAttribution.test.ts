import type { TreatmentAttribution } from '../api/contract';
import { attributionLabel, attributionLine, mayStateAsHolding } from './treatmentAttribution';

/**
 * NODE BUILT-INS, TYPED LOCALLY — the reason `screens/routeGates.test.ts`
 * gives, verbatim: `@types/node` is not in this workspace's `tsconfig.json`
 * and adding it would touch the root lockfile while other lanes work in the
 * same tree, to satisfy the imports of a handful of test files.
 */
declare const __dirname: string;
declare function require(id: string): unknown;

const { readFileSync } = require('fs') as {
  readFileSync: (path: string, encoding: 'utf8') => string;
};
const { join } = require('path') as { join: (...parts: string[]) => string };

const ALL: TreatmentAttribution[] = ['COURT', 'REPORTER', 'DEFECTIVE', 'UNKNOWN'];

describe('mayStateAsHolding', () => {
  it('permits only COURT', () => {
    expect(mayStateAsHolding('COURT')).toBe(true);
    for (const a of ['REPORTER', 'DEFECTIVE', 'UNKNOWN'] as const) {
      expect(mayStateAsHolding(a)).toBe(false);
    }
  });

  /** A route that never sent the field is not a court. */
  it('refuses a missing value', () => {
    expect(mayStateAsHolding(undefined)).toBe(false);
  });
});

describe('attributionLine', () => {
  it('renders every union value', () => {
    for (const a of ALL) expect(attributionLine(a)).toEqual(expect.any(String));
  });

  /**
   * THE FIFTH CASE. `undefined` is not `UNKNOWN`: it means the route did not
   * send the field, and printing "we have not recorded who said so" for it
   * would be this client observing a silence that was never on the wire.
   */
  it('says nothing at all when the field is missing', () => {
    expect(attributionLine(undefined)).toBeNull();
    expect(attributionLabel(undefined)).toBeNull();
  });

  /** Only COURT may be worded as something a bench held. */
  it('words only COURT as the court speaking', () => {
    expect(attributionLine('COURT')).toMatch(/later court said so/i);
    for (const a of ['REPORTER', 'DEFECTIVE', 'UNKNOWN'] as const) {
      expect(attributionLine(a)).not.toMatch(/the later court (said|held)/i);
    }
  });

  /** A reporter's note is attributed to the reporter, in the same sentence. */
  it('attributes REPORTER to the reporter and denies it the court', () => {
    const line = attributionLine('REPORTER')!;
    expect(line).toMatch(/reporter/i);
    expect(line).toMatch(/not the court/i);
  });

  /**
   * DEFECTIVE and UNKNOWN are not two names for one thing — one is a broken
   * record, the other is an absent classification, and they want opposite
   * responses from a reader.
   */
  it('keeps DEFECTIVE and UNKNOWN distinct and promotes neither', () => {
    expect(attributionLine('DEFECTIVE')).not.toBe(attributionLine('UNKNOWN'));
    expect(attributionLine('DEFECTIVE')).toMatch(/damaged/i);
    expect(attributionLine('UNKNOWN')).toMatch(/not recorded/i);
    for (const a of ['DEFECTIVE', 'UNKNOWN'] as const) {
      expect(attributionLine(a)).not.toMatch(/\bheld\b|\bruled\b|good law/i);
    }
  });

  /** Our own uncertainty is neutral ink. Amber is reserved for LAW MOVED. */
  it('names no colour and claims no good-law status', () => {
    for (const a of ALL) {
      expect(attributionLine(a)).not.toMatch(/B4690E|amber|good law|safe to file/i);
    }
  });
});

/**
 * THE ASYMMETRY NEW3 R16 §4 LEFT WITH LCC, PINNED SO IT CANNOT BE CLOSED HERE.
 *
 * `services/api/src/search/route.ts` drops `treatmentAttribution` from both the
 * structured and hybrid projections. Until LCC preserves it there, a search row
 * carries no attribution, and a client that declared one would print a fact
 * nobody sent. This reads the contract source rather than a type, because a
 * missing optional property is invisible to the type system at runtime.
 */
describe('the search route asymmetry', () => {
  const contract = readFileSync(join(__dirname, '..', 'api', 'contract.ts'), 'utf8');

  it('does not declare treatmentAttribution on SearchResult', () => {
    const start = contract.indexOf('export type SearchResult = {');
    const end = contract.indexOf('\n};\n', start);
    expect(start).toBeGreaterThan(-1);
    expect(contract.slice(start, end)).not.toContain('treatmentAttribution');
  });
});
