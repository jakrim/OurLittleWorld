export const ASSISTED_FIRST_COPY = Object.freeze({
  title: 'Could this be the moment?',
  candidateLabel: 'Possible First',
  confirmLabel: 'Confirm First',
  chooseAnotherLabel: 'Choose another',
  dateCaption: 'From this photo’s capture date. Nothing is asserted until you confirm.',
  correctDateLabel: 'Correct date',
  editTitleLabel: 'Edit first title',
  noteCaption: 'Optional. One small detail is enough.',
});

export function assistedFirstPresentation({ assisted = false, existing = false } = {}) {
  return {
    title: existing ? 'edit this first' : assisted ? ASSISTED_FIRST_COPY.title : 'add a first',
    showCandidateFirst: assisted,
    primaryAction: assisted ? ASSISTED_FIRST_COPY.confirmLabel : 'Save',
    correctionActions: assisted
      ? [ASSISTED_FIRST_COPY.correctDateLabel, ASSISTED_FIRST_COPY.editTitleLabel, ASSISTED_FIRST_COPY.chooseAnotherLabel]
      : [],
  };
}
