/**
 * ─────────────────────────────────────────────────────────────────────────────
 * A CORPUS ROLLBACK MUST NOT ROLL BACK AN ADVOCATE'S MATTERS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `release-restore-cli.ts` loads a corpus release by running, per table:
 *
 *     TRUNCATE <table> CASCADE
 *
 * `CASCADE` there does not mean "follow the foreign key's ON DELETE rule". It
 * means **also truncate every table that references this one**, and PostgreSQL
 * applies it regardless of whether that reference is `ON DELETE NO ACTION`.
 * `NO ACTION` protects a DELETE. It does not protect a TRUNCATE.
 *
 * Measured here, 2 September 2026, in a rolled-back transaction on disposable
 * temp tables so nothing real was touched:
 *
 *     child FK ... REFERENCES z_corpus(id) ON DELETE NO ACTION
 *     rows in the child before TRUNCATE z_corpus CASCADE   2
 *     rows in the child after                              0
 *     NOTICE: truncate cascades to table "z_user"
 *
 * On the CURRENT single database that is not hypothetical. Six user/matter
 * tables carry a foreign key into `judgments` — `matter_authorities`, `alerts`,
 * `citation_checks`, `citation_copies`, `citation_disputes`,
 * `judgment_annotations` — and one more, `verification_cache`. A corpus
 * rollback would empty every one of them, and `matter_authorities` IS the
 * retention moat: the authorities an advocate saved to a matter.
 *
 * Once corpus and user/matter live in physically separate databases the risk
 * disappears on its own, because those tables are not present in the corpus
 * database to be cascaded into. This guard therefore finds NOTHING on a correct
 * remote-alpha target and refuses loudly on a shared one — which is exactly the
 * distinction Gate C needs and exactly the one nothing checked before.
 *
 * It is a REFUSAL, not a repair: it will not silently restore a subset. The
 * operator either restores onto a target that holds only the release's own
 * tables, or says `--allow-cascade-into` and owns the consequence.
 */

/** One foreign key, as `pg_constraint` reports it: `child` references `parent`. */
export type ForeignKeyEdge = { child: string; parent: string };

export type CascadeVictim = { table: string; via: string[] };

/**
 * Tables that `TRUNCATE ... CASCADE` over `releaseTables` would ALSO empty.
 *
 * A table already in the release is not a victim — it is being reloaded from
 * the pack a moment later, which is the whole point of the restore. A self
 * reference is not a victim either. Everything else that points into the
 * release is.
 *
 * Transitive on purpose: a table referencing `matter_authorities`, which
 * references `judgments`, is truncated too, and a guard that only looked one
 * hop out would have reported a shorter list than the truth.
 */
export function cascadeVictims(
  fks: readonly ForeignKeyEdge[],
  releaseTables: readonly string[],
): CascadeVictim[] {
  const inRelease = new Set(releaseTables);
  const truncated = new Set(releaseTables);
  const via = new Map<string, Set<string>>();

  for (let grew = true; grew;) {
    grew = false;
    for (const fk of fks) {
      if (fk.child === fk.parent) continue;
      if (!truncated.has(fk.parent)) continue;
      if (inRelease.has(fk.child)) continue;
      const parents = via.get(fk.child) ?? new Set<string>();
      if (!parents.has(fk.parent)) {
        parents.add(fk.parent);
        via.set(fk.child, parents);
        grew = true;
      }
      if (!truncated.has(fk.child)) {
        truncated.add(fk.child);
        grew = true;
      }
    }
  }

  return [...via.entries()]
    .map(([table, parents]) => ({ table, via: [...parents].sort() }))
    .sort((a, b) => a.table.localeCompare(b.table));
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * HOW MANY TABLES vs HOW MUCH DATA — the gap `--allow-cascade-into` left open
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * {@link cascadeVictims} answers "which tables would also be emptied". That is
 * the right question and it is not the whole one, because the answer reads the
 * same in two situations that could not be more different:
 *
 *   A corpus-only target whose schema was migrated in full carries EMPTY copies
 *   of the user tables. They are victims, truncating them destroys nothing, and
 *   the restore is safe.
 *
 *   A shared database carries the SAME tables holding an advocate's saved
 *   authorities. They are victims, and truncating them is the thing Gate C
 *   forbids.
 *
 * Gate C hit the first case: the guard refused with **12 victims** and the
 * operator passed `--allow-cascade-into`, correctly. The problem is that the
 * second case produces a byte-identical refusal and the same flag clears it. An
 * operator who has cleared this warning once — and every restore onto a
 * fully-migrated corpus target makes them clear it — has been trained to clear
 * it again on the day it means "destroy thirteen saved authorities".
 *
 * A warning that is usually noise is not a guard. So the decision is made on
 * **rows**, not on table names:
 *
 *   every victim empty  →  nothing is destroyed. Proceed, and say so.
 *   any victim has rows →  refuse, and NAME THE COUNTS. `--allow-cascade-into`
 *                          is not enough on its own, because the flag an
 *                          operator types routinely must not also be the one
 *                          that destroys user data.
 *
 * Pure, so it is tested without a database. The counting itself lives in
 * `release-restore-cli.ts`, which is the only thing that should touch a target.
 */
export type VictimCensus = CascadeVictim & {
  /**
   * Rows found, counted with a bound. `atLeast` is true when the count stopped
   * at the bound — so the message can say "10,000+" rather than a number it did
   * not actually establish.
   */
  readonly rows: number;
  readonly atLeast?: boolean | undefined;
};

export type CascadeDamage = {
  /** Victims holding at least one row. Non-empty means the restore must refuse. */
  readonly destroys: readonly VictimCensus[];
  /** Victims that exist but hold nothing. Truncating these destroys no data. */
  readonly empty: readonly VictimCensus[];
  /** Total rows that would be destroyed, for the one-line summary. */
  readonly rows: number;
  /** True when at least one count hit its bound, so `rows` is a floor. */
  readonly rowsAreAFloor: boolean;
};

export function cascadeDamage(census: readonly VictimCensus[]): CascadeDamage {
  const destroys = census.filter((v) => v.rows > 0);
  const empty = census.filter((v) => v.rows === 0);
  return {
    // Biggest first: an operator reading a refusal should meet the worst line first.
    destroys: [...destroys].sort((a, b) => b.rows - a.rows || a.table.localeCompare(b.table)),
    empty: [...empty].sort((a, b) => a.table.localeCompare(b.table)),
    rows: destroys.reduce((n, v) => n + v.rows, 0),
    rowsAreAFloor: destroys.some((v) => v.atLeast === true),
  };
}
