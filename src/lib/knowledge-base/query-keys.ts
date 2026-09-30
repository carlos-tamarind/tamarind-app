export function knowledgeGraphQueryKey(workspaceId: string) {
  return ["knowledge-graph", workspaceId] as const;
}

export function knowledgeTopicQueryKey(workspaceId: string, topicId: string) {
  return ["knowledge-topic", workspaceId, topicId] as const;
}
