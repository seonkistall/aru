export function shouldKeepLearningCrop({ datasetConsent }: { datasetConsent: boolean }): boolean {
  return datasetConsent;
}

export function shouldShowFeedback({
  hasReads,
  staffMode,
  datasetConsent,
}: {
  hasReads: boolean;
  staffMode: boolean;
  datasetConsent: boolean;
}): boolean {
  return hasReads && (staffMode || datasetConsent);
}
