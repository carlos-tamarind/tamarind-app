export function selectCurrentTopic(params: {
  topics: Array<{ id: string; score: number }>;
  currentTopicId: string | null;
  hysteresis: number;
}): string | null {
  if (params.topics.length === 0) return params.currentTopicId;

  const ranked = [...params.topics].sort(
    (a, b) => b.score - a.score || a.id.localeCompare(b.id),
  );
  const winner = ranked[0];
  if (!winner) return params.currentTopicId;

  if (!params.currentTopicId) return winner.id;

  const current = params.topics.find((topic) => topic.id === params.currentTopicId);
  if (!current) return winner.id;
  if (winner.id === current.id) return current.id;
  if (winner.score > current.score * (1 + params.hysteresis)) return winner.id;
  return current.id;
}
