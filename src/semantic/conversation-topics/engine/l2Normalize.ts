export function l2NormalizeSum(vectors: number[][]): number[] {
  if (vectors.length === 0) {
    throw new Error("cannot L2-normalize an empty set of embeddings");
  }

  const dimensions = vectors[0]?.length ?? 0;
  if (dimensions === 0) {
    throw new Error("cannot L2-normalize zero-dimension embeddings");
  }

  const sum = new Array<number>(dimensions).fill(0);
  for (const vector of vectors) {
    if (vector.length !== dimensions) {
      throw new Error(
        `cannot L2-normalize embeddings with mixed dimensions (${dimensions} vs ${vector.length})`,
      );
    }
    for (let i = 0; i < dimensions; i += 1) {
      sum[i] += vector[i] ?? 0;
    }
  }

  const norm = Math.sqrt(sum.reduce((acc, value) => acc + value * value, 0));
  if (norm === 0) return sum;
  return sum.map((value) => value / norm);
}

export function hasCanonicalIdentity(topic: {
  name: string | null;
  description: string | null;
}): boolean {
  return Boolean(topic.name?.trim() && topic.description?.trim());
}
