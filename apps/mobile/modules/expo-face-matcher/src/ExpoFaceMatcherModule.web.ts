import { NativeModule, registerWebModule } from 'expo';

import type {
  CandidateInput,
  ExpoFaceMatcherModuleEvents,
  FaceEmbedding,
  MatchResult,
} from './ExpoFaceMatcher.types';

class ExpoFaceMatcherModule extends NativeModule<ExpoFaceMatcherModuleEvents> {
  async embedFace(_localUri: string): Promise<FaceEmbedding | null> {
    return null;
  }

  async matchAgainst(
    _reference: { embedding: number[] },
    candidates: CandidateInput[],
  ): Promise<MatchResult[]> {
    return (candidates || []).map((candidate) => ({
      assetId: candidate.assetId,
      score: 0.5,
      faceCount: 0,
    }));
  }
}

export default registerWebModule(ExpoFaceMatcherModule, 'ExpoFaceMatcherModule');
