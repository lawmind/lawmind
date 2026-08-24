import { scrubEventProps } from './scrub';

/**
 * THE RULE UNDER TEST: an event property survives only if it is a bounded
 * id/enum-shaped scalar. Free text — a search query, a client name, a
 * matter note — is dropped whole, never partially redacted.
 */

describe('scrubEventProps', () => {
  it('keeps a bounded id-shaped string', () => {
    const { safe, droppedKeys } = scrubEventProps({ judgmentId: 'jud_abc123' });
    expect(safe).toEqual({ judgmentId: 'jud_abc123' });
    expect(droppedKeys).toEqual([]);
  });

  it('keeps booleans and finite numbers', () => {
    const { safe, droppedKeys } = scrubEventProps({ fromTrial: true, ordinal: 2 });
    expect(safe).toEqual({ fromTrial: true, ordinal: 2 });
    expect(droppedKeys).toEqual([]);
  });

  it('drops free text that looks like a search query or a note', () => {
    const { safe, droppedKeys } = scrubEventProps({
      query: 'anticipatory bail for my client Ramesh Kumar in the Sessions Court',
    });
    expect(safe).toEqual({});
    expect(droppedKeys).toEqual(['query']);
  });

  it('drops a nested object whole rather than recursing into it', () => {
    const { safe, droppedKeys } = scrubEventProps({
      matter: { clientName: 'Ramesh Kumar', notes: 'confidential' },
    });
    expect(safe).toEqual({});
    expect(droppedKeys).toEqual(['matter']);
  });

  it('drops a non-finite number', () => {
    const { safe, droppedKeys } = scrubEventProps({ cost: Number.POSITIVE_INFINITY });
    expect(safe).toEqual({});
    expect(droppedKeys).toEqual(['cost']);
  });

  it('never echoes the dropped VALUE, only the key', () => {
    const { droppedKeys } = scrubEventProps({ clientName: 'Ramesh Kumar' });
    expect(droppedKeys).toEqual(['clientName']);
    expect(JSON.stringify(droppedKeys)).not.toContain('Ramesh');
  });
});
