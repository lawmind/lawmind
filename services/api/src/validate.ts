/**
 * Zod validation, wired once. Routes call `validate('json', schema)` and inherit
 * the `{ ok: false, error }` envelope on failure — no route shapes its own
 * validation error.
 *
 * `.ai/04-coding-standards.md`: Zod-validate every API input at the boundary.
 */
import type { ValidationTargets } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { ZodType } from 'zod';

import { fail } from './envelope.ts';

export function validate<T extends ZodType>(target: keyof ValidationTargets, schema: T) {
  return zValidator(target, schema, (result, c) => {
    if (!result.success) {
      const first = result.error.issues[0];
      const where = first?.path.join('.');
      const message = first
        ? `${where ? `${where}: ` : ''}${first.message}`
        : 'request failed validation';
      return fail(c, 'INVALID_REQUEST', message, 400);
    }
    return undefined;
  });
}
