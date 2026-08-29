/** Wire-safe projection of 0090/0095 source-artifact state. */
export type SourceArtifactTextState = 'TEXT_AVAILABLE' | 'IMAGE_ONLY_OCR_PENDING' | null;

export type SourceArtifactState = {
  sourceArtifactHeld: boolean;
  textState: SourceArtifactTextState;
  fullTextEvidenceAvailable: boolean;
  generationEvidenceAvailable: boolean;
};

export function sourceArtifactState(row: {
  rawBytes: Uint8Array | null;
  storageKey: string | null;
  textState: SourceArtifactTextState;
}): SourceArtifactState {
  const sourceArtifactHeld = row.rawBytes !== null || row.storageKey !== null;
  const fullTextEvidenceAvailable = sourceArtifactHeld && row.textState === 'TEXT_AVAILABLE';
  return {
    sourceArtifactHeld,
    textState: row.textState,
    fullTextEvidenceAvailable,
    generationEvidenceAvailable: fullTextEvidenceAvailable,
  };
}
