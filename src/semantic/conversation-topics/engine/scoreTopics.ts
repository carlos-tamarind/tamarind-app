export function topicScore(
  historicalWeight: number,
  lastSeenAt: Date,
  now: Date,
  halfLifeHours: number,
): number {
  const deltaHours = Math.max(0, (now.getTime() - lastSeenAt.getTime()) / (1000 * 60 * 60));
  return historicalWeight * 0.5 ** (deltaHours / halfLifeHours);
}
