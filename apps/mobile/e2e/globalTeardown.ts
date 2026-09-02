/**
 * Ask the harness to tidy up after itself.
 *
 * `/shutdown` is a request rather than a kill because the fixture rows live in
 * the DEVELOPMENT database — the advocates, the matter and the saved authority
 * are real rows in `users`, `matters` and `matter_authorities`, and a killed
 * process leaves them there. The two disposable corpus databases are dropped on
 * the same path. `unlinkSync` is last so a failed shutdown is still diagnosable.
 */
import { unlinkSync } from 'node:fs';

import { HANDSHAKE_PATH, readHandshake } from './handshake';

export default async function globalTeardown(): Promise<void> {
  try {
    const { controlUrl } = readHandshake();
    await fetch(`${controlUrl}/shutdown`, { method: 'POST' }).catch(() => {});
    unlinkSync(HANDSHAKE_PATH);
  } catch {
    /* Nothing booted, or it is already gone. Either way there is nothing to do. */
  }
}
