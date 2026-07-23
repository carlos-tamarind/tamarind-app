export type NormalizationResult = {
  shouldPersist: boolean;
  rawMessage: string;
  normalizedText?: string;
  skipReason?: string;
};
