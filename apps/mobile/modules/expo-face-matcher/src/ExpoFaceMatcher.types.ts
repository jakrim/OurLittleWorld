export type FaceBox = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type FaceEmbedding = {
  embedding: number[];
  faceCount: number;
  primaryBox: FaceBox | null;
  captureQuality: number | null;
  faceSizeRatio: number;
  sharpness: number;
  yaw: number | null;
  roll: number | null;
  brightness: number | null;
};

export type CandidateInput = {
  assetId: string;
  localUri: string;
};

export type MatchResult = {
  assetId: string;
  /** Cosine similarity to the reference embedding, ~[0..1]. */
  score: number;
  faceCount: number;
  captureQuality: number | null;
  faceSizeRatio: number;
  sharpness: number;
  yaw: number | null;
  roll: number | null;
  brightness: number | null;
};

export type ExpoFaceMatcherModuleEvents = Record<string, never>;
