import { DebugLogger } from "@/lib/debugLogger";

import { PAGE_CHUNK_CONFIG } from "../engine/config";
import type { ProposedPageChunk } from "../engine/chunkPageContent";
import {
  deletePageChunksByIds,
  findPageChunksByPageId,
  insertPageChunks,
  insertQueuedPageEmbeddings,
  touchPageChunks,
  updatePageChunkPosition,
} from "./pageChunksRepository";

const LOG_SCOPE = "page-chunks";
const POSITION_SHIFT = 1_000_000;

export type ReconcilePageChunksResult = {
  kept: number;
  inserted: number;
  deleted: number;
  queued: number;
};

export async function reconcilePageChunks(
  pageId: string,
  proposed: ProposedPageChunk[],
): Promise<ReconcilePageChunksResult> {
  const existing = await findPageChunksByPageId(pageId);
  const unmatchedExisting = [...existing];
  const matched: Array<{ id: string; targetPosition: number }> = [];
  const toInsert: Array<ProposedPageChunk & { position: number }> = [];

  for (let position = 0; position < proposed.length; position += 1) {
    const chunk = proposed[position];
    const matchIndex = unmatchedExisting.findIndex((row) => row.checksum === chunk.checksum);
    if (matchIndex >= 0) {
      const [row] = unmatchedExisting.splice(matchIndex, 1);
      matched.push({ id: row.id, targetPosition: position });
      continue;
    }
    toInsert.push({ ...chunk, position });
  }

  const toDeleteIds = unmatchedExisting.map((row) => row.id);

  if (toDeleteIds.length > 0) {
    await deletePageChunksByIds(toDeleteIds);
    DebugLogger.log({
      scope: LOG_SCOPE,
      event: "CHUNKS_DELETED",
      message: `${pageId} · ${toDeleteIds.length}`,
    });
  }

  const needsPositionRewrite = matched.some((row) => {
    const current = existing.find((chunk) => chunk.id === row.id);
    return current != null && current.position !== row.targetPosition;
  });

  if (needsPositionRewrite) {
    for (const row of matched) {
      const current = existing.find((chunk) => chunk.id === row.id);
      if (!current) continue;
      await updatePageChunkPosition(row.id, current.position + POSITION_SHIFT);
    }
    for (const row of matched) {
      await updatePageChunkPosition(row.id, row.targetPosition);
    }
  }

  const insertedRows = await insertPageChunks(
    toInsert.map((chunk) => ({
      page_id: pageId,
      position: chunk.position,
      content: chunk.content,
      checksum: chunk.checksum,
      token_count: chunk.token_count,
    })),
  );

  if (insertedRows.length > 0) {
    await insertQueuedPageEmbeddings(
      insertedRows.map((row) => ({
        chunk_id: row.id,
        checksum: row.checksum,
        embedding_model: PAGE_CHUNK_CONFIG.PAGE_EMBEDDING_MODEL,
      })),
    );
    DebugLogger.log({
      scope: LOG_SCOPE,
      event: "CHUNKS_QUEUED",
      message: `${pageId} · ${insertedRows.length} embeddings QUEUED`,
    });
  }

  await touchPageChunks(matched.map((row) => row.id));

  DebugLogger.log({
    scope: LOG_SCOPE,
    event: "RECONCILED",
    message: `${pageId} · kept ${matched.length} · inserted ${insertedRows.length} · deleted ${toDeleteIds.length}`,
  });

  return {
    kept: matched.length,
    inserted: insertedRows.length,
    deleted: toDeleteIds.length,
    queued: insertedRows.length,
  };
}
