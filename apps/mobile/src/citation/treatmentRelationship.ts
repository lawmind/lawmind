import type { PrecedentialEffect } from '../api/contract';

/**
 * Names the relationship to the later judgment only when the API names it.
 *
 * `overruledStatus` is deliberately not accepted here: it is the four-value
 * warning band, and OD-14 keeps it coarse. Using it to choose a verb is what
 * made proposition-level overruling render as the factually different
 * "Set aside in". Where the finer field is absent or unrecognised we retain
 * the useful title without inventing a legal relationship.
 */
export function treatmentRelationshipCopy(
  laterJudgmentTitle: string,
  effect?: PrecedentialEffect | (string & {}),
): string {
  switch (effect) {
    case 'overruled':
      return `Overruled by ${laterJudgmentTitle}`;
    case 'overruled_in_part':
      return `Overruled in part by ${laterJudgmentTitle}`;
    case 'set_aside':
      return `Set aside in ${laterJudgmentTitle}`;
    case 'partly_set_aside':
      return `Partly set aside in ${laterJudgmentTitle}`;
    case 'doubted':
      return `Doubted in ${laterJudgmentTitle}`;
    case 'none':
    case 'review_required':
    default:
      return `Later judgment: ${laterJudgmentTitle}`;
  }
}
