export type PurgeDueOptions = {
  entityIds?: string[];
};

export type PurgeDueResult = {
  purged: number;
  byType: Record<string, number>;
};

export type DueEntity = {
  entityType: string;
  id: string;
};
