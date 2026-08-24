import { NativeModule, requireNativeModule } from 'expo';

import type {
  CandidateInput,
  FaceEmbedding,
  MatchBatchResult,
  MatchResult,
  ReferenceInput,
  ExpoFaceMatcherModuleEvents,
} from './ExpoFaceMatcher.types';

declare class ExpoFaceMatcherModule extends NativeModule<ExpoFaceMatcherModuleEvents> {
  /**
   * Detect the largest face in the image and return its feature print.
   * Returns null on failure or when no face is detected.
   */
  embedFace(localUri: string): Promise<FaceEmbedding | null>;

  /**
   * Score every candidate against the reference embedding. Returns one
   * row per candidate with a [0..1] cosine similarity score.
   */
  matchAgainst(
    reference: { embedding: number[] },
    candidates: CandidateInput[],
  ): Promise<MatchResult[]>;

  /**
   * Analyze each candidate once, then compare its faces against every
   * reference. The native batch always returns within the requested bound.
   */
  matchAgainstMany(
    references: ReferenceInput[],
    candidates: CandidateInput[],
    options: { batchId: string; timeoutMs: number },
  ): Promise<MatchBatchResult>;

  /** Cancel an in-flight private analysis batch without exposing asset ids. */
  cancelMatchBatch(batchId: string): boolean;
}

export default requireNativeModule<ExpoFaceMatcherModule>('ExpoFaceMatcher');
