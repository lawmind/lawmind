import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { sourceArtifactState } from './source-artifact-state.ts';

describe('image-only official source artifact', () => {
  it('counts retained storage as held while withholding text and generation evidence', () => {
    assert.deepEqual(
      sourceArtifactState({
        rawBytes: null,
        storageKey: 'official/aws-hc/sha256.pdf',
        textState: 'IMAGE_ONLY_OCR_PENDING',
      }),
      {
        sourceArtifactHeld: true,
        textState: 'IMAGE_ONLY_OCR_PENDING',
        fullTextEvidenceAvailable: false,
        generationEvidenceAvailable: false,
      },
    );
  });

  it('does not call metadata-only observation held', () => {
    assert.equal(
      sourceArtifactState({ rawBytes: null, storageKey: null, textState: null }).sourceArtifactHeld,
      false,
    );
  });
});
