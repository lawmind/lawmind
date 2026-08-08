/**
 * The one statistic the A/B rig turns on, in a file that can be tested.
 *
 * It lived inline in `ab-cli.ts` for about an hour, which was long enough to
 * notice the problem: a significance test that decides whether a model ships,
 * and no way to check it against a value computed by hand.
 */

/** Lanczos approximation to log Γ(z). Accurate to ~1e-13 over the range used. */
export function lnGamma(z: number): number {
  const g = [
    676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
  const x = z - 1;
  let a = 0.99999999999980993;
  for (const [i, gi] of g.entries()) a += gi / (x + i + 1);
  const t = x + g.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** log C(n, k). Via lgamma so a few hundred queries cannot overflow. */
export function lnChoose(n: number, k: number): number {
  return lnGamma(n + 1) - lnGamma(k + 1) - lnGamma(n - k + 1);
}

/**
 * **McNemar's exact test, two-sided.**
 *
 * For paired binary outcomes — here, "did the gold answer reach the top five",
 * before and after a retrieval change — the pairs that AGREE carry no
 * information about which arm is better. A query both arms get right, or both
 * get wrong, says nothing at all. Only the discordant pairs do, and under the
 * null hypothesis they split like a fair coin.
 *
 * So the test is a two-sided binomial on the discordant pairs alone. It is
 * exact at any n, which matters because the interesting runs have few
 * discordant pairs: the first real one had 11 gains and 5 losses out of 100
 * queries, so a normal approximation over 100 differences was being driven by
 * 16 observations while presenting itself as 100.
 *
 * Returns null when nothing disagreed — no evidence either way, which is a
 * different statement from p = 1.
 */
export function mcnemarExactP(gained: number, lost: number): number | null {
  const discordant = gained + lost;
  if (discordant === 0) return null;

  const extreme = Math.max(gained, lost);
  let tail = 0;
  for (let k = extreme; k <= discordant; k++) {
    tail += Math.exp(lnChoose(discordant, k) - discordant * Math.LN2);
  }
  return Math.min(1, 2 * tail);
}

/**
 * Roughly how many queries would settle a result this size, at 80% power.
 *
 * Reported when a run comes back not-significant, because **"not significant"
 * and "no effect" are different findings and only one of them means stop.**
 * A normal-approximation sample size for a paired binary test, using the
 * discordance actually observed. Deliberately rough: it decides how much
 * compute to spend next, not whether anything ships.
 */
export function queriesToSettle(gained: number, lost: number, total: number): number | null {
  const discordant = gained + lost;
  if (discordant === 0 || total === 0) return null;

  const share = gained / discordant;
  if (Math.abs(share - 0.5) < 1e-9) return null;

  /**
   * Once the concordant pairs are set aside, McNemar's test IS a one-sample
   * binomial test of H0: π = 0.5 on the discordant pairs. So this is that
   * test's sample size, with the null and alternative standard errors kept
   * separate — under the null the spread is √0.25, under the alternative it is
   * √(π(1−π)), and collapsing them understates the requirement badly.
   *
   *   n_discordant = [ z(α/2)·√0.25 + z(β)·√(π(1−π)) ]² / (π − 0.5)²
   *
   * z(0.025) = 1.96 and z(0.20) = 0.8416, i.e. 5% two-sided at 80% power.
   *
   * The first version of this dropped the alternative-variance term and
   * divided by an extra 4, which answered "148 queries" for a run that had
   * already failed to settle at 100 — a number that was not merely imprecise
   * but pointed the wrong way. The correct answer for that run is ~338.
   */
  const zAlpha = 1.959964;
  const zBeta = 0.841621;
  const needDiscordant =
    (zAlpha * Math.sqrt(0.25) + zBeta * Math.sqrt(share * (1 - share))) ** 2 / (share - 0.5) ** 2;

  return Math.ceil(needDiscordant / (discordant / total));
}
