export const SHEET_DETENTS = {
  add: [0.48, 0.86],
  prompt: [0.48, 0.76],
  detail: [0.58, 0.9],
  compose: [0.74, 0.94],
};

export const nativeSheetOptions = {
  headerShown: false,
  presentation: 'formSheet',
  animation: 'slide_from_bottom',
  gestureEnabled: true,
  sheetAllowedDetents: SHEET_DETENTS.add,
  sheetInitialDetentIndex: 0,
  sheetGrabberVisible: true,
  sheetCornerRadius: 28,
};

export const nativeAddSheetOptions = {
  ...nativeSheetOptions,
  sheetAllowedDetents: SHEET_DETENTS.add,
  sheetInitialDetentIndex: 0,
};

export const nativePromptSheetOptions = {
  ...nativeSheetOptions,
  sheetAllowedDetents: SHEET_DETENTS.prompt,
};

export const nativeDetailSheetOptions = {
  ...nativeSheetOptions,
  sheetAllowedDetents: SHEET_DETENTS.detail,
};

export const nativeComposeSheetOptions = {
  ...nativeSheetOptions,
  sheetAllowedDetents: SHEET_DETENTS.compose,
};
