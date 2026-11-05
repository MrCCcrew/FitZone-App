import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync("prisma/schema.prisma", "utf8");
const migration = readFileSync("prisma/migrations/20260802120000_add_ai_coach_voice_quota_and_shared_knowledge/migration.sql", "utf8");

describe("voice quota migration/schema parity", () => {
  it("keeps the required indexes and foreign-key deletion rules aligned", () => {
    for (const token of [
      "@@index([userId, status])",
      "@@index([status, expiresAt])",
      "@@index([status, lastHeartbeatAt])",
      "@@index([quotaId, status])",
      "@@unique([normalizedQuestionHash, language])",
    ]) expect(schema).toContain(token);
    for (const token of [
      "VoiceRealtimeSession_userId_status_idx",
      "VoiceRealtimeSession_status_expiresAt_idx",
      "VoiceRealtimeSession_status_lastHeartbeatAt_idx",
      "VoiceRealtimeSession_quotaId_status_idx",
      "ChatKnowledgeAlias_normalizedQuestionHash_language_key",
      "ON DELETE SET NULL",
      "ON DELETE RESTRICT",
    ]) expect(migration).toContain(token);
  });
});
