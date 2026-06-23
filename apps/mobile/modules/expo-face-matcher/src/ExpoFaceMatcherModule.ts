import { NativeModule, requireNativeModule } from 'expo';

import type {
  CandidateInput,
  FaceEmbedding,
  MatchResult,
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
}

export default requireNativeModule<ExpoFaceMatcherModule>('ExpoFaceMatcher');
