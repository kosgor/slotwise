// @vitest-environment node
//
// Stage 4 on the real migrations (PGlite + pgvector): chat history is private, usage cannot be
// written by users, limits are atomic and match lib/ai/limits.ts, documents and their chunks
// belong to their provider, and search returns only what a client may see.

import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  DAILY_AI_REQUESTS,
  MAX_DOCUMENT_BYTES,
  MAX_DOCUMENTS,
  RATE_LIMIT_PER_MINUTE,
} from "@/lib/ai/limits";
import { EMBEDDING_DIMENSIONS } from "@/lib/ai/models";

vi.mock("server-only", () => ({}));

import {
  asAnon,
  asService,
  asUser,
  createTestDb,
  createUser,
  rolledBack as rolledBackIn,
} from "./db";

const ALICE = "00000000-0000-4000-8000-0000000000a1";
const BOB = "00000000-0000-4000-8000-0000000000b2";
const PRO = "00000000-0000-4000-8000-0000000000c3";
const NEW_PRO = "00000000-0000-4000-8000-0000000000d4";

let db: PGlite;
let proId: string; // approved provider owned by PRO
let newProId: string; // pending provider owned by NEW_PRO
const rolledBack = <T>(fn: () => Promise<T>) => rolledBackIn(db, fn);

/** A unit vector along one axis: identical axes → similarity 1, different axes → 0. */
const axis = (i: number) =>
  `[${Array.from({ length: EMBEDDING_DIMENSIONS }, (_, k) => (k === i ? 1 : 0)).join(",")}]`;

const claim = (userId: string, feature = "chat") =>
  asUser<{ id: string }>(db, userId, "select public.claim_ai_request($1) as id", [feature]);

/** Usage rows in the past, so the per-minute rate limit does not get in the way. */
const pastUsage = (userId: string, count: number, feature = "chat") =>
  db.query(
    `insert into public.ai_usage (user_id, feature, status, created_at)
     select $1, $2, 'finished', date_trunc('day', now() at time zone 'utc') at time zone 'utc' + interval '1 second'
     from generate_series(1, $3)`,
    [userId, feature, count],
  );

async function addDocument(owner: string, providerId: string, title = "Cancellation policy") {
  const [doc] = await asUser<{ id: string }>(
    db,
    owner,
    `insert into public.provider_documents (provider_id, title, storage_path, size_bytes)
     values ($1::uuid, $2, $1::text || '/' || gen_random_uuid() || '.txt', 100) returning id`,
    [providerId, title],
  );
  return doc!.id;
}

beforeAll(async () => {
  db = await createTestDb();
  await createUser(db, ALICE, "alice@example.com", "Alice");
  await createUser(db, BOB, "bob@example.com", "Bob");
  await createUser(db, PRO, "pro@example.com", "Petra Pro");
  await createUser(db, NEW_PRO, "new@example.com", "Nora New");
  const apply = (user: string, name: string) =>
    asUser<{ id: string }>(
      db,
      user,
      `select id from public.apply_as_provider($1, 'Yoga for beginners', '', 'yoga', 'Lisbon', 'Europe/Lisbon', true, false)`,
      [name],
    ).then((rows) => rows[0]!.id);
  proId = await apply(PRO, "Petra Pro");
  newProId = await apply(NEW_PRO, "Nora New");
  await db.query("update public.providers set status = 'approved' where id = $1", [proId]);
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe("limits mirror lib/ai/limits.ts", () => {
  it("rate limit: the 7th request within a minute is refused", async () => {
    await rolledBack(async () => {
      for (let i = 0; i < RATE_LIMIT_PER_MINUTE; i++) await claim(ALICE);
      await expect(claim(ALICE)).rejects.toThrow(/ai_rate_limited/);
      // Per user: Bob is not affected by Alice.
      await expect(claim(BOB)).resolves.toHaveLength(1);
    });
  });

  it("daily allowance: Free users get DAILY_AI_REQUESTS.free per UTC day", async () => {
    await rolledBack(async () => {
      await pastUsage(ALICE, DAILY_AI_REQUESTS.free - 1);
      await expect(claim(ALICE)).resolves.toHaveLength(1);
      await expect(claim(ALICE)).rejects.toThrow(/ai_daily_limit/);
      const [left] = await asUser<{ n: number }>(
        db,
        ALICE,
        "select public.ai_requests_left() as n",
      );
      expect(left!.n).toBe(0);
    });
  });

  it("failed requests and document embeddings do not use up the allowance", async () => {
    await rolledBack(async () => {
      await pastUsage(ALICE, DAILY_AI_REQUESTS.free, "document_embedding");
      await db.query(
        `insert into public.ai_usage (user_id, feature, status) select $1, 'chat', 'failed' from generate_series(1, 3)`,
        [ALICE],
      );
      await db.query("update public.ai_usage set created_at = now() - interval '2 minutes'");
      await expect(claim(ALICE)).resolves.toHaveLength(1);
    });
  });

  it("providers on an active Pro plan get DAILY_AI_REQUESTS.pro", async () => {
    await rolledBack(async () => {
      await db.query(
        `insert into public.provider_subscriptions (provider_id, stripe_customer_id, plan, status)
         values ($1, 'cus_test', 'pro', 'active')`,
        [proId],
      );
      await pastUsage(PRO, DAILY_AI_REQUESTS.pro - 1);
      await expect(claim(PRO, "weekly_summary")).resolves.toHaveLength(1);
      await expect(claim(PRO, "weekly_summary")).rejects.toThrow(/ai_daily_limit/);
    });
  });

  it("refuses visitors and unknown features", async () => {
    await expect(asAnon(db, "select public.claim_ai_request('chat')")).rejects.toThrow(
      /permission denied/,
    );
    await expect(claim(ALICE, "document_embedding")).rejects.toThrow(/invalid_feature/);
  });

  it("document limits match the table and the trigger", async () => {
    await rolledBack(async () => {
      for (let i = 0; i < MAX_DOCUMENTS; i++) await addDocument(PRO, proId, `Doc ${i + 1}`);
      await expect(addDocument(PRO, proId, "One too many")).rejects.toThrow(/document_limit/);
    });
    await expect(
      asUser(
        db,
        PRO,
        `insert into public.provider_documents (provider_id, title, storage_path, size_bytes)
         values ($1::uuid, 'Too big', $1::text || '/big.txt', $2)`,
        [proId, MAX_DOCUMENT_BYTES + 1],
      ),
    ).rejects.toThrow(/check constraint/);
  });
});

describe("ai_usage", () => {
  it("users read only their own rows and cannot write any", async () => {
    await rolledBack(async () => {
      await claim(ALICE);
      expect(await asUser(db, ALICE, "select * from public.ai_usage")).toHaveLength(1);
      expect(await asUser(db, BOB, "select * from public.ai_usage")).toHaveLength(0);
      await expect(
        asUser(db, ALICE, "update public.ai_usage set tokens_in = 0, cost_micros = 0"),
      ).rejects.toThrow(/permission denied/);
      await expect(
        asUser(db, ALICE, "insert into public.ai_usage (user_id, feature) values ($1, 'chat')", [
          ALICE,
        ]),
      ).rejects.toThrow(/permission denied/);
      await expect(asUser(db, ALICE, "delete from public.ai_usage")).rejects.toThrow(
        /permission denied/,
      );
    });
  });
});

describe("conversations and messages", () => {
  it("are private to their owner", async () => {
    await rolledBack(async () => {
      const [conv] = await asUser<{ id: string }>(
        db,
        ALICE,
        "insert into public.conversations (title) values ('Yoga') returning id",
      );
      await asUser(
        db,
        ALICE,
        `insert into public.messages (conversation_id, id, role, parts)
         values ($1, 'm1', 'user', '[{"type":"text","text":"hi"}]')`,
        [conv!.id],
      );

      expect(await asUser(db, BOB, "select * from public.conversations")).toHaveLength(0);
      expect(await asUser(db, BOB, "select * from public.messages")).toHaveLength(0);
      // Bob cannot write into Alice's conversation, nor claim it as his.
      await expect(
        asUser(
          db,
          BOB,
          `insert into public.messages (conversation_id, id, role, parts) values ($1, 'x', 'assistant', '[]')`,
          [conv!.id],
        ),
      ).rejects.toThrow(/row-level security/);
      await expect(
        asUser(db, BOB, "insert into public.conversations (id) values ($1)", [conv!.id]),
      ).rejects.toThrow(/duplicate key|row-level security/);
      await expect(
        asUser(db, BOB, "insert into public.conversations (user_id) values ($1)", [ALICE]),
      ).rejects.toThrow(/permission denied/);
      // Bob's update silently matches nothing.
      await asUser(db, BOB, "update public.messages set parts = '[]'");
      const [msg] = await asUser<{ parts: unknown[] }>(
        db,
        ALICE,
        "select parts from public.messages",
      );
      expect(msg!.parts).toHaveLength(1);
      await expect(asAnon(db, "select * from public.messages")).rejects.toThrow(
        /permission denied/,
      );
    });
  });
});

describe("saving messages (lib/ai/chat-store.ts)", () => {
  it("users update only parts: an upsert that rewrites every column is refused, so the store does insert + update", async () => {
    await rolledBack(async () => {
      const [conv] = await asUser<{ id: string }>(
        db,
        ALICE,
        "insert into public.conversations (title) values ('x') returning id",
      );
      const insert = `insert into public.messages (conversation_id, id, role, parts)
                      values ($1, 'm1', 'user', '[]')`;
      await asUser(db, ALICE, insert, [conv!.id]);
      // What supabase-js .upsert() sends: ON CONFLICT DO UPDATE of all columns.
      await expect(
        asUser(
          db,
          ALICE,
          `${insert} on conflict (conversation_id, id) do update
           set role = excluded.role, parts = excluded.parts`,
          [conv!.id],
        ),
      ).rejects.toThrow(/permission denied/);
      // A message cannot become an assistant message…
      await expect(
        asUser(db, ALICE, "update public.messages set role = 'assistant' where id = 'm1'"),
      ).rejects.toThrow(/permission denied/);
      // …but its parts can be updated (tool results, approvals).
      await asUser(
        db,
        ALICE,
        `update public.messages set parts = '[{"type":"text","text":"hi"}]' where id = 'm1'`,
      );
    });
  });
});

describe("documents, chunks and search", () => {
  it("only the owner adds, reads and deletes documents; status is the job's", async () => {
    await rolledBack(async () => {
      const doc = await addDocument(PRO, proId);
      await expect(addDocument(ALICE, proId)).rejects.toThrow(/row-level security/);
      expect(await asUser(db, ALICE, "select * from public.provider_documents")).toHaveLength(0);
      expect(await asUser(db, PRO, "select * from public.provider_documents")).toHaveLength(1);
      await expect(
        asUser(db, PRO, "update public.provider_documents set status = 'ready' where id = $1", [
          doc,
        ]),
      ).rejects.toThrow(/permission denied/);
      await asUser(db, ALICE, "delete from public.provider_documents where id = $1", [doc]);
      expect(await asUser(db, PRO, "select * from public.provider_documents")).toHaveLength(1);
    });
  });

  it("chunks are written only by the server, atomically, and found only above the threshold", async () => {
    await rolledBack(async () => {
      const doc = await addDocument(PRO, proId);
      const chunks = JSON.stringify([
        { content: "Cancel up to 24 hours before for free.", embedding: axis(0) },
        { content: "Bring a yoga mat and water.", embedding: axis(1) },
      ]);
      await expect(
        asUser(db, PRO, "select public.replace_document_chunks($1, $2)", [doc, chunks]),
      ).rejects.toThrow(/permission denied/);
      await expect(
        asUser(
          db,
          PRO,
          `insert into public.document_chunks (document_id, provider_id, chunk_index, content, embedding)
           values ($1, $2, 0, 'Injected', $3)`,
          [doc, proId, axis(0)],
        ),
      ).rejects.toThrow(/permission denied/);

      await asService(db, "select public.replace_document_chunks($1, $2)", [doc, chunks]);
      // Retried job: the same document again leaves one set of chunks, not two.
      await asService(db, "select public.replace_document_chunks($1, $2)", [doc, chunks]);
      const [state] = await asUser<{ status: string; chunk_count: number }>(
        db,
        PRO,
        "select status, chunk_count from public.provider_documents where id = $1",
        [doc],
      );
      expect(state).toEqual({ status: "ready", chunk_count: 2 });

      type Match = { content: string; similarity: number; document_title: string };
      const search = (user: string, provider: string, vector: string) =>
        asUser<Match>(db, user, "select * from public.match_document_chunks($1, $2, 0.6, 4)", [
          provider,
          vector,
        ]);

      // A client asks about the approved provider: the matching chunk, with its document title.
      const found = await search(ALICE, proId, axis(0));
      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({
        content: "Cancel up to 24 hours before for free.",
        document_title: "Cancellation policy",
      });
      expect(found[0]!.similarity).toBeCloseTo(1);
      // Nothing similar enough → nothing, not the nearest noise.
      expect(await search(ALICE, proId, axis(5))).toHaveLength(0);
      // Clients do not read chunks directly.
      expect(await asUser(db, ALICE, "select * from public.document_chunks")).toHaveLength(0);
      await expect(
        asAnon(db, "select * from public.match_document_chunks($1, $2)", [proId, axis(0)]),
      ).rejects.toThrow(/permission denied/);
    });
  });

  it("search skips providers that are not public, except for their owner", async () => {
    await rolledBack(async () => {
      const doc = await addDocument(NEW_PRO, newProId, "Studio rules");
      await asService(db, "select public.replace_document_chunks($1, $2)", [
        doc,
        JSON.stringify([{ content: "No shoes in the studio.", embedding: axis(2) }]),
      ]);
      const q = "select * from public.match_document_chunks($1, $2)";
      expect(await asUser(db, ALICE, q, [newProId, axis(2)])).toHaveLength(0);
      expect(await asUser(db, NEW_PRO, q, [newProId, axis(2)])).toHaveLength(1);
    });
  });

  it("storage: providers upload only into their own folder", async () => {
    await rolledBack(async () => {
      const insert = (user: string, name: string) =>
        asUser(
          db,
          user,
          "insert into storage.objects (bucket_id, name) values ('provider-documents', $1)",
          [name],
        );
      await insert(PRO, `${proId}/policy.txt`);
      await expect(insert(ALICE, `${proId}/evil.txt`)).rejects.toThrow(/row-level security/);
      await expect(insert(PRO, `${newProId}/evil.txt`)).rejects.toThrow(/row-level security/);
      await expect(insert(PRO, "not-a-uuid/file.txt")).rejects.toThrow(/row-level security/);
      expect(await asUser(db, ALICE, "select * from storage.objects")).toHaveLength(0);
      expect(await asUser(db, PRO, "select * from storage.objects")).toHaveLength(1);
    });
  });
});
