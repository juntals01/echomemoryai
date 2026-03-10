> Part of [FriendAI Architecture Documentation](./README.md)

# FriendAI RAG Memory Pipeline — Implementation Spec

Complete implementation specification for the memory extraction, embedding, retrieval, and fact extraction pipeline.

---

## Table of Contents

1. [Pipeline Overview](#1-pipeline-overview)
2. [Async Job Flow](#2-async-job-flow)
3. [Memory Processing Service](#3-memory-processing-service)
4. [Embedding Service](#4-embedding-service)
5. [Retrieval Service](#5-retrieval-service)
6. [Chat RAG Pipeline](#6-chat-rag-pipeline)
7. [Fact Extraction Service](#7-fact-extraction-service)
8. [BullMQ Workers](#8-bullmq-workers)
9. [pgvector Queries](#9-pgvector-queries)
10. [Prompt Templates](#10-prompt-templates)
11. [Entity Definitions](#11-entity-definitions)
12. [Queue Constants](#12-queue-constants)

---

## 1. Pipeline Overview

When a user sends a chat message, the system must:

1. **Respond immediately** using retrieved context (RAG)
2. **Process the message asynchronously** to extract memories, generate embeddings, and store facts

The pipeline has two halves:

**Synchronous (blocking the response):**
```
user message → save → retrieve context → build prompt → LLM call → save reply → return
```

**Asynchronous (background after response):**
```
enqueue memory-processing job
  → classify message → create MemoryItem
  → enqueue embedding-generation job
    → chunk text → generate vectors → store in memory_chunks
  → enqueue fact-extraction job (if applicable)
    → extract structured facts → upsert into user_facts
```

---

## 2. Async Job Flow

```
POST /api/chat/send
  │
  ├── [sync] Save user message to messages table
  ├── [sync] RetrievalService.retrieveContext(userId, message)
  │     ├── Embed the query
  │     ├── pgvector similarity search → top 10 memory chunks
  │     ├── Load related MemoryItems
  │     ├── Load UserFacts
  │     └── Load recent conversation messages
  │
  ├── [sync] Build prompt (system + facts + memories + history + message)
  ├── [sync] AIService.generateChatReply(prompt)
  ├── [sync] Save assistant message
  ├── [sync] Return response to client
  │
  └── [async] Enqueue: memory-processing
        │
        ▼
  MemoryProcessingWorker.process(job)
        │
        ├── Load message content
        ├── AIService.classifyMemory(text)
        │     Returns: { summary, memoryType, importanceScore, extractedEntities }
        │
        ├── Create MemoryItem record
        │
        ├── Enqueue: embedding-generation
        │     │
        │     ▼
        │   EmbeddingWorker.process(job)
        │     ├── Split summary into chunks (500 tokens, 50 overlap)
        │     ├── For each chunk:
        │     │   ├── Call embedding API → vector(1536)
        │     │   └── INSERT into memory_chunks
        │     └── Done
        │
        └── Enqueue: fact-extraction (if classification flags facts)
              │
              ▼
          FactExtractionWorker.process(job)
              ├── Load memory summary
              ├── AIService.extractFacts(text)
              │     Returns: [{ category, subject, predicate, value, confidence }]
              ├── For each fact:
              │   ├── Check for existing conflicting fact
              │   ├── If new confidence > old → deactivate old, insert new
              │   └── Attach source_memory_id
              └── Done
```

---

## 3. Memory Processing Service

### File: `src/memories/memory-processing.service.ts`

This service is called by the `MemoryProcessingWorker`. It orchestrates the full memory analysis pipeline for a single message.

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { MessagesService } from '../messages/messages.service';
import { MemoriesService } from './memories.service';
import { AiService } from '../ai/ai.service';
import { QUEUES } from '../jobs/queues/queue.constants';
import { SourceType } from './entities/memory-item.entity';

export interface MemoryClassificationResult {
  summary: string;
  memoryType: 'fact' | 'event' | 'goal' | 'preference' | 'relationship' | 'emotion' | 'task' | 'reflection';
  importanceScore: number;
  extractedEntities: string[];
  containsFacts: boolean;
}

@Injectable()
export class MemoryProcessingService {
  private readonly logger = new Logger(MemoryProcessingService.name);

  constructor(
    private messagesService: MessagesService,
    private memoriesService: MemoriesService,
    private aiService: AiService,
    @InjectQueue(QUEUES.EMBEDDING_GENERATION) private embeddingQueue: Queue,
    @InjectQueue(QUEUES.FACT_EXTRACTION) private factQueue: Queue,
  ) {}

  /**
   * Full memory processing pipeline for a single message.
   *
   * 1. Load the message
   * 2. Classify it via AI (summary, type, importance, entities)
   * 3. Create a MemoryItem record
   * 4. Enqueue embedding generation
   * 5. Enqueue fact extraction if the message contains extractable facts
   */
  async processMessageForMemory(
    messageId: string,
    assistantMessageId: string,
    conversationId: string,
    userId: string,
  ): Promise<void> {
    // Step 1: Load messages
    const userMessage = await this.messagesService.findById(messageId);
    const assistantMessage = await this.messagesService.findById(assistantMessageId);

    if (!userMessage || !assistantMessage) {
      this.logger.warn(`Message not found: ${messageId}`);
      return;
    }

    // Step 2: Classify via AI
    const classification = await this.aiService.classifyMemory(
      userMessage.content,
      assistantMessage.content,
    );

    // Skip if the AI says this isn't worth remembering
    if (classification.importanceScore < 0.2) {
      this.logger.debug(`Message ${messageId} below importance threshold, skipping`);
      return;
    }

    // Step 3: Create MemoryItem
    const combinedContent = [
      `User: ${userMessage.content}`,
      `Assistant: ${assistantMessage.content}`,
    ].join('\n');

    const memory = await this.memoriesService.createMemory({
      userId,
      sourceType: SourceType.CONVERSATION,
      sourceId: conversationId,
      title: classification.summary.slice(0, 200),
      summary: classification.summary,
      importance: classification.importanceScore,
      memoryType: this.mapMemoryType(classification.memoryType),
      tags: classification.extractedEntities,
      rawContent: combinedContent,
    });

    this.logger.log(
      `Created memory ${memory.id} [${classification.memoryType}] importance=${classification.importanceScore}`,
    );

    // Step 4: Enqueue embedding generation
    await this.embeddingQueue.add(
      'generate-embedding',
      {
        memoryItemId: memory.id,
        text: classification.summary,
        userId,
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    );

    // Step 5: Enqueue fact extraction if the message contains facts
    if (classification.containsFacts) {
      await this.factQueue.add(
        'extract-facts',
        {
          memoryItemId: memory.id,
          text: userMessage.content,
          userId,
          sourceMessageId: messageId,
        },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
        },
      );
    }
  }

  private mapMemoryType(
    type: string,
  ): 'episodic' | 'semantic' | 'procedural' {
    switch (type) {
      case 'fact':
      case 'preference':
      case 'relationship':
        return 'semantic';
      case 'task':
      case 'routine':
        return 'procedural';
      default:
        return 'episodic';
    }
  }
}
```

### Key Decisions

- The AI returns structured JSON with `summary`, `memoryType`, `importanceScore`, `extractedEntities`, and `containsFacts`
- Messages below a 0.2 importance threshold are discarded
- `memoryType` from the AI (8 fine-grained types) is mapped to TypeORM's 3-category enum (`episodic`, `semantic`, `procedural`)
- The raw AI memory types (`fact`, `event`, `goal`, `preference`, `relationship`, `emotion`, `task`, `reflection`) are preserved in the summary and tags for richer search

---

## 4. Embedding Service

### File: `src/ai/embedding.service.ts`

Handles vector embedding generation and chunk storage.

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface EmbeddingResult {
  embedding: number[];
  tokenCount: number;
}

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(private config: ConfigService) {
    this.apiKey = config.get('AI_API_KEY', '');
    this.model = config.get('AI_EMBEDDING_MODEL', 'text-embedding-3-small');
    this.baseUrl = config.get('AI_EMBEDDING_BASE_URL', 'https://api.openai.com/v1');
  }

  /**
   * Generate a 1536-dimensional vector embedding for a text string.
   * Uses OpenAI-compatible embedding API.
   */
  async generateEmbedding(text: string): Promise<EmbeddingResult> {
    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: text,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      this.logger.error(`Embedding API ${response.status}: ${body}`);
      throw new Error(`Embedding API error: ${response.status}`);
    }

    const data = await response.json();
    return {
      embedding: data.data[0].embedding,
      tokenCount: data.usage?.total_tokens ?? 0,
    };
  }
}
```

### File: `src/memories/memory-embedding.service.ts`

Handles the chunking + embedding + storage pipeline for a single MemoryItem.

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { MemoriesService } from './memories.service';
import { EmbeddingService } from '../ai/embedding.service';
import { chunkText } from '../common/utils/chunk.util';

@Injectable()
export class MemoryEmbeddingService {
  private readonly logger = new Logger(MemoryEmbeddingService.name);

  constructor(
    private memoriesService: MemoriesService,
    private embeddingService: EmbeddingService,
  ) {}

  /**
   * Full embedding pipeline for a memory item.
   *
   * 1. Split the text into overlapping chunks
   * 2. Generate an embedding for each chunk
   * 3. Store each chunk + embedding in memory_chunks
   */
  async storeMemoryEmbedding(
    memoryItemId: string,
    text: string,
    userId: string,
  ): Promise<void> {
    // Step 1: Chunk the text
    const chunks = chunkText(text, { maxTokens: 500, overlap: 50 });
    this.logger.log(
      `Chunked memory ${memoryItemId} into ${chunks.length} chunks`,
    );

    // Step 2 & 3: Embed and store each chunk
    for (let i = 0; i < chunks.length; i++) {
      const chunkContent = chunks[i];

      const { embedding, tokenCount } =
        await this.embeddingService.generateEmbedding(chunkContent);

      await this.memoriesService.createChunk({
        memoryItemId,
        userId,
        content: chunkContent,
        embedding,
        chunkIndex: i,
        tokenCount,
      });

      this.logger.debug(
        `Stored chunk ${i + 1}/${chunks.length} for memory ${memoryItemId} (${tokenCount} tokens)`,
      );
    }
  }
}
```

### Chunk Utility: `src/common/utils/chunk.util.ts`

```typescript
export interface ChunkOptions {
  maxTokens: number;
  overlap: number;
}

/**
 * Split text into overlapping chunks.
 * Uses word-based splitting (1 word ≈ 1.3 tokens).
 */
export function chunkText(
  text: string,
  options: ChunkOptions = { maxTokens: 500, overlap: 50 },
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const wordsPerChunk = Math.floor(options.maxTokens / 1.3);
  const overlapWords = Math.floor(options.overlap / 1.3);
  const chunks: string[] = [];

  let start = 0;
  while (start < words.length) {
    const end = Math.min(start + wordsPerChunk, words.length);
    chunks.push(words.slice(start, end).join(' '));

    if (end >= words.length) break;
    start = end - overlapWords;
  }

  return chunks;
}
```

### MemoriesService Chunk Methods

Add these methods to `src/memories/memories.service.ts`:

```typescript
/**
 * Create a memory chunk with its embedding vector.
 * Uses raw SQL to store the pgvector column.
 */
async createChunk(data: {
  memoryItemId: string;
  userId: string;
  content: string;
  embedding: number[];
  chunkIndex: number;
  tokenCount: number;
}): Promise<MemoryChunk> {
  const chunk = this.memoryChunksRepo.create({
    memoryItemId: data.memoryItemId,
    userId: data.userId,
    content: data.content,
    chunkIndex: data.chunkIndex,
    tokenCount: data.tokenCount,
    embedding: null, // set via raw SQL below
  });

  const saved = await this.memoryChunksRepo.save(chunk);

  // Store embedding via raw SQL because TypeORM doesn't natively handle vector type
  const vectorStr = `[${data.embedding.join(',')}]`;
  await this.dataSource.query(
    `UPDATE memory_chunks SET embedding = $1::vector WHERE id = $2`,
    [vectorStr, saved.id],
  );

  return saved;
}

/**
 * Retrieve chunks for a memory item, ordered by chunk_index.
 */
async getChunksByMemoryId(memoryItemId: string): Promise<MemoryChunk[]> {
  return this.memoryChunksRepo.find({
    where: { memoryItemId },
    order: { chunkIndex: 'ASC' },
  });
}
```

### MemoriesService Extended `createMemory`

The service must accept a `rawContent` field for the full text that will be chunked later:

```typescript
async createMemory(data: {
  userId: string;
  sourceType: SourceType;
  sourceId?: string;
  title: string;
  summary?: string;
  importance?: number;
  memoryType?: MemoryType;
  tags?: string[];
  rawContent?: string;
}): Promise<MemoryItem> {
  const item = this.memoryItemsRepo.create({
    userId: data.userId,
    sourceType: data.sourceType,
    sourceId: data.sourceId,
    title: data.title,
    summary: data.summary,
    importance: data.importance ?? 0.5,
    memoryType: data.memoryType ?? MemoryType.EPISODIC,
    tags: data.tags ?? [],
  });

  return this.memoryItemsRepo.save(item);
}
```

---

## 5. Retrieval Service

### File: `src/retrieval/retrieval.service.ts`

Assembles the full RAG context from multiple sources, run in parallel.

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { MessagesService } from '../messages/messages.service';
import { MemoriesService } from '../memories/memories.service';
import { FactsService } from '../facts/facts.service';
import { PeopleService } from '../people/people.service';
import { EmbeddingService } from '../ai/embedding.service';
import { DataSource } from 'typeorm';

export interface RetrievalContext {
  recentMessages: Array<{ role: string; content: string; createdAt: Date }>;
  relevantMemories: Array<{
    chunkId: string;
    content: string;
    similarity: number;
    memoryTitle: string;
    memorySummary: string;
    importance: number;
    compositeScore: number;
  }>;
  userFacts: Array<{
    category: string;
    subject: string;
    value: string;
    confidence: number;
  }>;
  mentionedPeople: Array<{
    name: string;
    relationship: string;
    notes: string;
  }>;
}

@Injectable()
export class RetrievalService {
  private readonly logger = new Logger(RetrievalService.name);

  constructor(
    private messagesService: MessagesService,
    private memoriesService: MemoriesService,
    private factsService: FactsService,
    private peopleService: PeopleService,
    private embeddingService: EmbeddingService,
    private dataSource: DataSource,
  ) {}

  /**
   * Assemble the full RAG context for generating a chat reply.
   *
   * Runs 4 retrieval sources in parallel:
   * 1. Recent conversation messages (direct DB query)
   * 2. Semantically similar memory chunks (pgvector cosine search)
   * 3. Relevant user facts (keyword match)
   * 4. Mentioned people (name match)
   */
  async retrieveContext(
    userId: string,
    conversationId: string,
    query: string,
  ): Promise<RetrievalContext> {
    const [recentMessages, relevantMemories, userFacts, mentionedPeople] =
      await Promise.all([
        this.getRecentMessages(conversationId),
        this.searchMemoryChunks(userId, query),
        this.getRelevantFacts(userId, query),
        this.getMentionedPeople(userId, query),
      ]);

    this.logger.debug(
      `Retrieved: ${recentMessages.length} msgs, ${relevantMemories.length} memories, ` +
      `${userFacts.length} facts, ${mentionedPeople.length} people`,
    );

    return { recentMessages, relevantMemories, userFacts, mentionedPeople };
  }

  // ---- Source 1: Recent Messages ----

  private async getRecentMessages(
    conversationId: string,
  ): Promise<RetrievalContext['recentMessages']> {
    const messages = await this.messagesService.getRecentMessages(
      conversationId,
      20,
    );

    // Reverse so oldest first (messages come back DESC)
    return messages.reverse().map((m) => ({
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
    }));
  }

  // ---- Source 2: Semantic Memory Search (pgvector) ----

  /**
   * Core vector similarity search.
   *
   * 1. Embed the user's query
   * 2. Run cosine similarity against memory_chunks using pgvector <=> operator
   * 3. Join with memory_items for metadata
   * 4. Apply composite reranking score
   * 5. Return top 10
   */
  private async searchMemoryChunks(
    userId: string,
    query: string,
  ): Promise<RetrievalContext['relevantMemories']> {
    try {
      // Step 1: Embed the query
      const { embedding } = await this.embeddingService.generateEmbedding(query);
      const vectorStr = `[${embedding.join(',')}]`;

      // Step 2: pgvector cosine similarity search
      const rawResults: Array<{
        chunkId: string;
        content: string;
        similarity: number;
        memoryTitle: string;
        memorySummary: string;
        importance: number;
        createdAt: Date;
        lastAccessedAt: Date | null;
      }> = await this.dataSource.query(
        `
        SELECT
          mc.id                                           AS "chunkId",
          mc.content                                      AS "content",
          1 - (mc.embedding::vector <=> $1::vector)       AS "similarity",
          mi.title                                        AS "memoryTitle",
          mi.summary                                      AS "memorySummary",
          mi.importance                                   AS "importance",
          mi."createdAt"                                  AS "createdAt",
          mi."lastAccessedAt"                             AS "lastAccessedAt"
        FROM memory_chunks mc
        JOIN memory_items mi ON mc."memoryItemId" = mi.id
        WHERE mc."userId" = $2
          AND mc.embedding IS NOT NULL
        ORDER BY mc.embedding::vector <=> $1::vector
        LIMIT 20
        `,
        [vectorStr, userId],
      );

      // Step 3: Rerank with composite score
      const now = Date.now();
      const ranked = rawResults.map((r) => {
        const ageDays =
          (now - new Date(r.createdAt).getTime()) / (1000 * 60 * 60 * 24);
        const recency = Math.exp(-ageDays / 30);
        const compositeScore =
          0.5 * r.similarity + 0.25 * r.importance + 0.25 * recency;

        return { ...r, compositeScore };
      });

      ranked.sort((a, b) => b.compositeScore - a.compositeScore);

      // Step 4: Update lastAccessedAt for retrieved memories
      const chunkIds = ranked.slice(0, 10).map((r) => r.chunkId);
      if (chunkIds.length > 0) {
        await this.dataSource.query(
          `
          UPDATE memory_items SET "lastAccessedAt" = NOW()
          WHERE id IN (
            SELECT DISTINCT mc."memoryItemId"
            FROM memory_chunks mc
            WHERE mc.id = ANY($1)
          )
          `,
          [chunkIds],
        );
      }

      return ranked.slice(0, 10);
    } catch (error) {
      this.logger.warn(`Memory search failed: ${error.message}`);
      return [];
    }
  }

  // ---- Source 3: User Facts ----

  private async getRelevantFacts(
    userId: string,
    query: string,
  ): Promise<RetrievalContext['userFacts']> {
    return this.factsService.findRelevantFacts(userId, query, 10);
  }

  // ---- Source 4: People Mentions ----

  private async getMentionedPeople(
    userId: string,
    message: string,
  ): Promise<RetrievalContext['mentionedPeople']> {
    return this.peopleService.findMentionedPeople(userId, message);
  }
}
```

### Reranking Formula

```
compositeScore = (0.50 × similarity) + (0.25 × importance) + (0.25 × recency)
```

| Factor | Weight | Source | Range |
|--------|--------|--------|-------|
| `similarity` | 0.50 | pgvector cosine: `1 - (a <=> b)` | 0.0 – 1.0 |
| `importance` | 0.25 | `memory_items.importance` | 0.0 – 1.0 |
| `recency` | 0.25 | `exp(-age_days / 30)` | 0.0 – 1.0 |

The search fetches 20 candidates from pgvector, reranks them, and returns the top 10.

---

## 6. Chat RAG Pipeline

### File: `src/chat/chat.service.ts`

The updated `ChatService` that integrates the full RAG pipeline.

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConversationsService } from '../conversations/conversations.service';
import { MessagesService } from '../messages/messages.service';
import { RetrievalService, RetrievalContext } from '../retrieval/retrieval.service';
import { AiService } from '../ai/ai.service';
import { MessageRole } from '../messages/entities/message.entity';
import { SendMessageDto } from './dto/send-message.dto';
import { QUEUES } from '../jobs/queues/queue.constants';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private conversationsService: ConversationsService,
    private messagesService: MessagesService,
    private retrievalService: RetrievalService,
    private aiService: AiService,
    @InjectQueue(QUEUES.MEMORY_PROCESSING) private memoryQueue: Queue,
  ) {}

  async send(userId: string, dto: SendMessageDto) {
    // 1. Get or create conversation
    let conversationId = dto.conversationId;
    if (!conversationId) {
      const conv = await this.conversationsService.create(userId, {});
      conversationId = conv.id;
    }

    // 2. Save user message
    const userMessage = await this.messagesService.create({
      conversationId,
      userId,
      role: MessageRole.USER,
      content: dto.message,
    });

    // 3. Retrieve RAG context
    const context = await this.retrievalService.retrieveContext(
      userId,
      conversationId,
      dto.message,
    );

    // 4. Build the full prompt and call the AI
    const prompt = this.buildPrompt(context, dto.message);
    const aiReply = await this.aiService.generateChatReply(prompt);

    // 5. Save assistant message
    const assistantMessage = await this.messagesService.create({
      conversationId,
      userId,
      role: MessageRole.ASSISTANT,
      content: aiReply,
      metadata: {
        memoriesUsed: context.relevantMemories.length,
        factsUsed: context.userFacts.length,
      },
    });

    // 6. Update conversation counters
    await this.conversationsService.incrementMessageCount(conversationId);
    await this.conversationsService.incrementMessageCount(conversationId);

    // 7. Enqueue async memory processing (does NOT block the response)
    await this.memoryQueue.add(
      'process-message-memory',
      {
        messageId: userMessage.id,
        assistantMessageId: assistantMessage.id,
        conversationId,
        userId,
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { age: 86400 },
      },
    );

    this.logger.log(`Chat completed: conversation=${conversationId}`);

    return {
      conversationId,
      message: userMessage,
      assistantMessage,
    };
  }

  /**
   * Build the full LLM prompt from retrieval context.
   *
   * Order:
   * 1. System prompt (persona + rules)
   * 2. User facts
   * 3. People context
   * 4. Retrieved memories (ranked by composite score)
   * 5. Conversation history (recent messages)
   * 6. Current user message
   */
  private buildPrompt(
    context: RetrievalContext,
    userMessage: string,
  ): Array<{ role: string; content: string }> {
    const messages: Array<{ role: string; content: string }> = [];

    // ---- System Prompt ----
    let system = SYSTEM_PROMPT;

    // Inject user facts
    if (context.userFacts.length > 0) {
      const factsBlock = context.userFacts
        .map((f) => `- [${f.category}] ${f.subject}: ${f.value}`)
        .join('\n');
      system += `\n\n## Known Facts About the User\n${factsBlock}`;
    }

    // Inject people context
    if (context.mentionedPeople.length > 0) {
      const peopleBlock = context.mentionedPeople
        .map((p) => `- ${p.name} (${p.relationship}): ${p.notes || 'no notes'}`)
        .join('\n');
      system += `\n\n## People the User Has Mentioned\n${peopleBlock}`;
    }

    // Inject relevant memories
    if (context.relevantMemories.length > 0) {
      const memoriesBlock = context.relevantMemories
        .map(
          (m) =>
            `- [score=${m.compositeScore.toFixed(2)}] ${m.memoryTitle}: ${m.content}`,
        )
        .join('\n');
      system += `\n\n## Retrieved Memories (from past conversations)\n${memoriesBlock}`;
    }

    messages.push({ role: 'system', content: system });

    // ---- Conversation History ----
    for (const msg of context.recentMessages) {
      messages.push({ role: msg.role, content: msg.content });
    }

    // ---- Current Message ----
    messages.push({ role: 'user', content: userMessage });

    return messages;
  }
}

// Prompt loaded from: prompts/chat-system.prompt.md
const SYSTEM_PROMPT = loadPrompt('chat-system');
```

> See full prompt: [`prompts/chat-system.prompt.md`](../prompts/chat-system.prompt.md)

---

## 7. Fact Extraction Service

### File: `src/facts/fact-extraction.service.ts`

Called by the `FactExtractionWorker`. Extracts structured facts from memory text and upserts them.

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import { FactsService } from './facts.service';
import { PeopleService } from '../people/people.service';
import { FactCategory } from './entities/user-fact.entity';

export interface ExtractedFact {
  category: string;
  subject: string;
  predicate: string;
  value: string;
  confidence: number;
}

@Injectable()
export class FactExtractionService {
  private readonly logger = new Logger(FactExtractionService.name);

  constructor(
    private aiService: AiService,
    private factsService: FactsService,
    private peopleService: PeopleService,
  ) {}

  /**
   * Extract structured facts from a memory's text content.
   *
   * 1. Send text to AI for fact extraction
   * 2. For each extracted fact:
   *    a. Check if a conflicting fact exists (same subject + predicate)
   *    b. If new confidence > existing → deactivate old, insert new
   *    c. If fact is a relationship → upsert the people table
   * 3. Attach source_memory_id to each fact
   */
  async extractFacts(
    memoryItemId: string,
    text: string,
    userId: string,
    sourceMessageId: string,
  ): Promise<void> {
    // Step 1: AI extraction
    const extractedFacts = await this.aiService.extractFacts(text);

    if (!extractedFacts || extractedFacts.length === 0) {
      this.logger.debug(`No facts extracted from memory ${memoryItemId}`);
      return;
    }

    this.logger.log(
      `Extracted ${extractedFacts.length} facts from memory ${memoryItemId}`,
    );

    // Step 2: Upsert each fact
    for (const fact of extractedFacts) {
      const category = this.mapCategory(fact.category);
      if (!category) {
        this.logger.warn(`Unknown fact category: ${fact.category}`);
        continue;
      }

      await this.factsService.upsertFact({
        userId,
        category,
        subject: fact.subject,
        predicate: fact.predicate,
        value: fact.value,
        confidence: fact.confidence,
        sourceMessageId,
      });

      // Step 3: If this is a relationship fact, upsert the people table
      if (category === FactCategory.RELATIONSHIP) {
        await this.peopleService.upsertPerson({
          userId,
          name: fact.subject,
          relationship: fact.predicate,
          notes: fact.value,
        });
      }
    }
  }

  private mapCategory(raw: string): FactCategory | null {
    const map: Record<string, FactCategory> = {
      preference: FactCategory.PREFERENCE,
      favorite_food: FactCategory.PREFERENCE,
      goal: FactCategory.GOAL,
      relationship: FactCategory.RELATIONSHIP,
      important_people: FactCategory.RELATIONSHIP,
      event: FactCategory.EVENT,
      birthday: FactCategory.EVENT,
      emotion: FactCategory.EMOTION,
      biographical: FactCategory.BIOGRAPHICAL,
      opinion: FactCategory.OPINION,
      routine: FactCategory.ROUTINE,
      habits: FactCategory.ROUTINE,
    };
    return map[raw.toLowerCase()] ?? null;
  }
}
```

### Fact Upsert Logic in `FactsService`

The upsert must handle conflicts: same user + subject + predicate. If a new fact has higher confidence, the old one is deactivated.

```typescript
async upsertFact(data: {
  userId: string;
  category: FactCategory;
  subject: string;
  predicate?: string;
  value: string;
  confidence: number;
  sourceMessageId?: string;
}): Promise<UserFact> {
  // Find existing active fact with same subject + predicate
  if (data.predicate) {
    const existing = await this.factsRepo.findOne({
      where: {
        userId: data.userId,
        subject: data.subject,
        predicate: data.predicate,
        isActive: true,
      },
    });

    if (existing) {
      // Only replace if new confidence is higher or values differ
      if (data.confidence >= existing.confidence || data.value !== existing.value) {
        existing.isActive = false;
        await this.factsRepo.save(existing);
        this.logger.log(
          `Deactivated old fact: ${data.subject}.${data.predicate} (confidence ${existing.confidence} → ${data.confidence})`,
        );
      } else {
        // Old fact has higher confidence, keep it
        return existing;
      }
    }
  }

  const fact = this.factsRepo.create(data);
  return this.factsRepo.save(fact);
}
```

---

## 8. BullMQ Workers

### Queue Constants: `src/jobs/queues/queue.constants.ts`

```typescript
export const QUEUES = {
  MEMORY_PROCESSING: 'memory-processing',
  EMBEDDING_GENERATION: 'embedding-generation',
  FACT_EXTRACTION: 'fact-extraction',
  FILE_PROCESSING: 'file-processing',
} as const;
```

### Worker 1: `src/jobs/processors/memory-processing.processor.ts`

```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUES } from '../queues/queue.constants';
import { MemoryProcessingService } from '../../memories/memory-processing.service';

@Processor(QUEUES.MEMORY_PROCESSING)
export class MemoryProcessingProcessor extends WorkerHost {
  private readonly logger = new Logger(MemoryProcessingProcessor.name);

  constructor(private memoryProcessingService: MemoryProcessingService) {
    super();
  }

  async process(job: Job): Promise<void> {
    const { messageId, assistantMessageId, conversationId, userId } = job.data;
    this.logger.log(`[Job ${job.id}] Processing memory for message ${messageId}`);

    await this.memoryProcessingService.processMessageForMemory(
      messageId,
      assistantMessageId,
      conversationId,
      userId,
    );

    this.logger.log(`[Job ${job.id}] Memory processing complete`);
  }
}
```

### Worker 2: `src/jobs/processors/embedding.processor.ts`

```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUES } from '../queues/queue.constants';
import { MemoryEmbeddingService } from '../../memories/memory-embedding.service';

@Processor(QUEUES.EMBEDDING_GENERATION)
export class EmbeddingProcessor extends WorkerHost {
  private readonly logger = new Logger(EmbeddingProcessor.name);

  constructor(private memoryEmbeddingService: MemoryEmbeddingService) {
    super();
  }

  async process(job: Job): Promise<void> {
    const { memoryItemId, text, userId } = job.data;
    this.logger.log(`[Job ${job.id}] Generating embeddings for memory ${memoryItemId}`);

    await this.memoryEmbeddingService.storeMemoryEmbedding(
      memoryItemId,
      text,
      userId,
    );

    this.logger.log(`[Job ${job.id}] Embeddings stored for memory ${memoryItemId}`);
  }
}
```

### Worker 3: `src/jobs/processors/fact-extraction.processor.ts`

```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUES } from '../queues/queue.constants';
import { FactExtractionService } from '../../facts/fact-extraction.service';

@Processor(QUEUES.FACT_EXTRACTION)
export class FactExtractionProcessor extends WorkerHost {
  private readonly logger = new Logger(FactExtractionProcessor.name);

  constructor(private factExtractionService: FactExtractionService) {
    super();
  }

  async process(job: Job): Promise<void> {
    const { memoryItemId, text, userId, sourceMessageId } = job.data;
    this.logger.log(`[Job ${job.id}] Extracting facts from memory ${memoryItemId}`);

    await this.factExtractionService.extractFacts(
      memoryItemId,
      text,
      userId,
      sourceMessageId,
    );

    this.logger.log(`[Job ${job.id}] Fact extraction complete for memory ${memoryItemId}`);
  }
}
```

### Jobs Module: `src/jobs/jobs.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUES } from './queues/queue.constants';
import { MemoryProcessingProcessor } from './processors/memory-processing.processor';
import { EmbeddingProcessor } from './processors/embedding.processor';
import { FactExtractionProcessor } from './processors/fact-extraction.processor';
import { MemoriesModule } from '../memories/memories.module';
import { MessagesModule } from '../messages/messages.module';
import { FactsModule } from '../facts/facts.module';
import { PeopleModule } from '../people/people.module';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: QUEUES.MEMORY_PROCESSING },
      { name: QUEUES.EMBEDDING_GENERATION },
      { name: QUEUES.FACT_EXTRACTION },
      { name: QUEUES.FILE_PROCESSING },
    ),
    MemoriesModule,
    MessagesModule,
    FactsModule,
    PeopleModule,
  ],
  providers: [
    MemoryProcessingProcessor,
    EmbeddingProcessor,
    FactExtractionProcessor,
  ],
})
export class JobsModule {}
```

---

## 9. pgvector Queries

### Create the pgvector Extension

Run automatically in `AppModule.onModuleInit()`:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### Create the IVFFlat Index

Run after the `memory_chunks` table has enough rows (recommended: at least 1000 rows before creating the index). Execute manually or in a migration:

```sql
CREATE INDEX idx_memory_chunks_embedding
  ON memory_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
```

For smaller datasets, HNSW is an alternative:

```sql
CREATE INDEX idx_memory_chunks_embedding_hnsw
  ON memory_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

### Cosine Similarity Search

The `<=>` operator computes cosine distance. To get cosine similarity: `1 - distance`.

```sql
-- Find top 10 most similar memory chunks for a user
SELECT
  mc.id,
  mc.content,
  1 - (mc.embedding <=> $1::vector) AS similarity,
  mi.title,
  mi.summary,
  mi.importance
FROM memory_chunks mc
JOIN memory_items mi ON mc."memoryItemId" = mi.id
WHERE mc."userId" = $2
  AND mc.embedding IS NOT NULL
ORDER BY mc.embedding <=> $1::vector
LIMIT 10;
```

### L2 Distance Search (alternative)

The `<->` operator computes L2 (Euclidean) distance:

```sql
SELECT *
FROM memory_chunks
WHERE "userId" = $1
ORDER BY embedding <-> $2::vector
LIMIT 10;
```

### Inner Product Search (alternative)

The `<#>` operator computes negative inner product:

```sql
SELECT *
FROM memory_chunks
WHERE "userId" = $1
ORDER BY embedding <#> $2::vector
LIMIT 10;
```

### Filtered Search (by memory type)

```sql
SELECT
  mc.content,
  1 - (mc.embedding <=> $1::vector) AS similarity
FROM memory_chunks mc
JOIN memory_items mi ON mc."memoryItemId" = mi.id
WHERE mc."userId" = $2
  AND mi."memoryType" = 'episodic'
  AND mc.embedding IS NOT NULL
ORDER BY mc.embedding <=> $1::vector
LIMIT 10;
```

---

## 10. Prompt Templates

All prompt templates are maintained as standalone Markdown files in the [`prompts/`](../prompts/README.md) folder. This keeps prompts reviewable, versionable, and separate from application code.

| Prompt | File | Used By |
|--------|------|---------|
| Chat System | [`chat-system.prompt.md`](../prompts/chat-system.prompt.md) | `ChatService.buildPrompt()` — AI persona and behavioral rules |
| Memory Classification | [`memory-classification.prompt.md`](../prompts/memory-classification.prompt.md) | `AIService.classifyMemory()` — Decides if a message is memorable |
| Fact Extraction | [`fact-extraction.prompt.md`](../prompts/fact-extraction.prompt.md) | `AIService.extractFacts()` — Extracts stable user facts |
| Summarization | [`summarization.prompt.md`](../prompts/summarization.prompt.md) | `AIService.summarizeMemory()` — Summarizes content before embedding |

In the codebase, prompts are loaded from these files at startup:

```typescript
import { CHAT_SYSTEM_PROMPT } from '../ai/prompts/chat-system.prompt';
import { MEMORY_CLASSIFICATION_PROMPT } from '../ai/prompts/memory-classification.prompt';
import { FACT_EXTRACTION_PROMPT } from '../ai/prompts/fact-extraction.prompt';
import { SUMMARIZATION_PROMPT } from '../ai/prompts/summarization.prompt';
```

---

## 11. Entity Definitions

### MemoryItem Entity

```typescript
@Entity('memory_items')
export class MemoryItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, (u) => u.memories, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'enum', enum: SourceType })
  sourceType: SourceType;           // 'conversation' | 'ingestion' | 'manual'

  @Column({ type: 'uuid', nullable: true })
  sourceId: string;                 // FK to conversation or ingested_item

  @Column({ nullable: true })
  title: string;                    // short description (max 200 chars)

  @Column({ type: 'text', nullable: true })
  summary: string;                  // AI-generated summary

  @Column({ type: 'float', default: 0.5 })
  importance: number;               // 0.0–1.0

  @Column({ type: 'enum', enum: MemoryType, default: MemoryType.EPISODIC })
  memoryType: MemoryType;           // 'episodic' | 'semantic' | 'procedural'

  @Column('text', { array: true, default: '{}' })
  tags: string[];                   // extracted entities and keywords

  @Column({ type: 'timestamptz', nullable: true })
  lastAccessedAt: Date;             // updated on retrieval

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => MemoryChunk, (c) => c.memoryItem)
  chunks: MemoryChunk[];
}
```

### MemoryChunk Entity

```typescript
@Entity('memory_chunks')
export class MemoryChunk {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  memoryItemId: string;

  @ManyToOne(() => MemoryItem, (m) => m.chunks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'memoryItemId' })
  memoryItem: MemoryItem;

  @Column()
  userId: string;                   // denormalized for faster queries

  @Column('text')
  content: string;                  // chunk text

  @Column('float', { array: true, nullable: true })
  embedding: number[] | null;       // vector(1536), stored via raw SQL

  @Column({ default: 0 })
  chunkIndex: number;               // position within parent memory

  @Column({ nullable: true })
  tokenCount: number;               // chunk size in tokens

  @CreateDateColumn()
  createdAt: Date;
}
```

### UserFact Entity

```typescript
@Entity('user_facts')
export class UserFact {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, (u) => u.facts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'enum', enum: FactCategory })
  category: FactCategory;

  @Column()
  subject: string;                  // what the fact is about

  @Column({ nullable: true })
  predicate: string;                // relationship or attribute

  @Column('text')
  value: string;                    // the fact itself

  @Column({ type: 'float', default: 0.8 })
  confidence: number;               // 0.0–1.0

  @Column({ type: 'uuid', nullable: true })
  sourceMessageId: string;          // FK to message that produced this fact

  @Column({ default: true })
  isActive: boolean;                // false = superseded by newer fact

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

---

## 12. Queue Constants

```typescript
export const QUEUES = {
  MEMORY_PROCESSING: 'memory-processing',
  EMBEDDING_GENERATION: 'embedding-generation',
  FACT_EXTRACTION: 'fact-extraction',
  FILE_PROCESSING: 'file-processing',
} as const;
```

### Default Job Options

Apply to all jobs across all queues:

```typescript
const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 1000,            // 1s, 2s, 4s
  },
  removeOnComplete: {
    age: 86400,             // keep completed jobs for 24h
    count: 1000,            // max 1000 completed jobs
  },
  removeOnFail: {
    age: 604800,            // keep failed jobs for 7 days
  },
};
```

### Queue Concurrency

| Queue | Concurrency | Rationale |
|-------|-------------|-----------|
| `memory-processing` | 5 | Each job does 1 LLM call (classification) |
| `embedding-generation` | 10 | Embedding API calls are fast and stateless |
| `fact-extraction` | 5 | Each job does 1 LLM call (extraction) |
| `file-processing` | 3 | File downloads + processing are heavier |

---

## Module Wiring Summary

```
MemoriesModule
├── exports: MemoriesService, MemoryProcessingService, MemoryEmbeddingService
├── imports: AiModule (for classification + embedding)
└── registers queues: EMBEDDING_GENERATION, FACT_EXTRACTION

FactsModule
├── exports: FactsService, FactExtractionService
└── imports: AiModule, PeopleModule

RetrievalModule
├── exports: RetrievalService
└── imports: MessagesModule, MemoriesModule, FactsModule, PeopleModule, AiModule

ChatModule
├── imports: ConversationsModule, MessagesModule, RetrievalModule, AiModule
└── registers queue: MEMORY_PROCESSING

JobsModule
├── imports: MemoriesModule, MessagesModule, FactsModule, PeopleModule
├── registers all 4 queues
└── providers: all 3 processors

AiModule (Global)
├── exports: AiService, EmbeddingService
└── no imports (uses ConfigService from global ConfigModule)
```

---

## Related Docs

- [01 — API Architecture](./01-api-architecture.md) — High-level system architecture and database schema
- [02 — Backend Blueprint](./02-backend-blueprint.md) — Full module-by-module implementation code
- [03 — Memory Strategy](./03-memory-strategy.md) — Product-level memory decisions: what to remember, scoring, decay, privacy
- [05 — Ingestion Architecture](./05-ingestion-architecture.md) — How shared content becomes memory
- [06 — Mobile Architecture](./06-mobile-architecture.md) — Expo client that sends messages and displays memories
