> Part of [FriendAI Architecture Documentation](./README.md)

# FriendAI Backend API — Technical Architecture

## 1. Project Overview

FriendAI is the backend API for a mobile AI companion app. The core premise: an AI friend that remembers your life. Every conversation, every shared link, every uploaded photo contributes to a growing memory graph that the AI uses to provide deeply personalized responses.

The system is built on Retrieval-Augmented Generation (RAG). When a user sends a message, the API retrieves relevant memories, facts, and context from the user's history, then feeds that context to an LLM to generate a response that feels like talking to someone who actually knows you.

Key capabilities:

- **Conversational AI** — multi-turn chat with long-term memory
- **Fact extraction** — automatically extracts and stores facts about the user (preferences, goals, relationships, events)
- **Episodic memory** — remembers past conversations and can recall them semantically
- **Content ingestion** — processes links, PDFs, images, and text shared from the mobile share sheet
- **Vector search** — finds relevant memories using pgvector cosine similarity

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Mobile App (Expo)                        │
│                                                                 │
│  Chat UI · Share Sheet · File Upload · Memory Browser            │
└──────────────────────────────┬──────────────────────────────────┘
                               │ HTTPS
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      NestJS API (port 3000)                     │
│                                                                 │
│  /api/chat    /api/conversations    /api/memories               │
│  /api/auth    /api/ingestion        /api/files                  │
│                                                                 │
│  ┌───────────┐  ┌───────────┐  ┌────────────┐  ┌────────────┐  │
│  │  ChatSvc  │  │ MemorySvc │  │ IngestSvc  │  │ StorageSvc │  │
│  └─────┬─────┘  └─────┬─────┘  └─────┬──────┘  └─────┬──────┘  │
│        │              │              │              │            │
│        ▼              ▼              ▼              ▼            │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │               BullMQ Job Queue (Redis)                   │   │
│  │  generate-embedding · extract-facts · process-file · ... │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────┬──────────────────────────────────┘
                               │
          ┌────────────────────┼────────────────────┐
          ▼                    ▼                    ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│   PostgreSQL     │ │     MinIO        │ │   LLM Provider   │
│   + pgvector     │ │  (S3-compatible) │ │  (OpenAI / local)│
│                  │ │                  │ │                  │
│  users           │ │  user-audio      │ │  chat completion │
│  conversations   │ │  user-images     │ │  embeddings      │
│  messages        │ │  user-attachments│ │  summarization   │
│  memory_items    │ │  user-exports    │ │  fact extraction │
│  memory_chunks   │ │                  │ │                  │
│  user_facts      │ │                  │ │                  │
│  people          │ │                  │ │                  │
│  files           │ │                  │ │                  │
│  ingested_items  │ │                  │ │                  │
└──────────────────┘ └──────────────────┘ └──────────────────┘
```

### Component Responsibilities

| Component | Role |
|-----------|------|
| **Expo Mobile App** | Chat interface, share sheet integration, file uploads, memory browsing |
| **NestJS API** | Request handling, authentication, orchestration, real-time responses |
| **PostgreSQL + pgvector** | Persistent storage, vector similarity search on embeddings |
| **Redis + BullMQ** | Async job processing — embedding generation, fact extraction, file processing |
| **MinIO** | Object storage for user uploads (audio, images, PDFs, exports) |
| **LLM Provider** | Chat completion, embedding generation, summarization, structured extraction |

---

## 3. NestJS Module Structure

```
api/src/
├── main.ts
├── app.module.ts
├── app.controller.ts
├── app.service.ts
│
├── auth/
│   ├── auth.module.ts
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   ├── auth.guard.ts
│   ├── strategies/
│   │   └── jwt.strategy.ts
│   └── dto/
│       ├── register.dto.ts
│       └── login.dto.ts
│
├── users/
│   ├── users.module.ts
│   ├── users.service.ts
│   └── entities/
│       └── user.entity.ts
│
├── conversations/
│   ├── conversations.module.ts
│   ├── conversations.controller.ts
│   ├── conversations.service.ts
│   ├── entities/
│   │   └── conversation.entity.ts
│   └── dto/
│       └── create-conversation.dto.ts
│
├── messages/
│   ├── messages.module.ts
│   ├── messages.service.ts
│   └── entities/
│       └── message.entity.ts
│
├── chat/
│   ├── chat.module.ts
│   ├── chat.controller.ts
│   ├── chat.service.ts
│   └── dto/
│       └── send-message.dto.ts
│
├── memories/
│   ├── memories.module.ts
│   ├── memories.controller.ts
│   ├── memories.service.ts
│   ├── entities/
│   │   ├── memory-item.entity.ts
│   │   └── memory-chunk.entity.ts
│   └── dto/
│       └── search-memories.dto.ts
│
├── retrieval/
│   ├── retrieval.module.ts
│   └── retrieval.service.ts
│
├── facts/
│   ├── facts.module.ts
│   ├── facts.service.ts
│   └── entities/
│       └── user-fact.entity.ts
│
├── people/
│   ├── people.module.ts
│   ├── people.service.ts
│   └── entities/
│       └── person.entity.ts
│
├── files/
│   ├── files.module.ts
│   ├── files.controller.ts
│   ├── files.service.ts
│   └── entities/
│       └── file.entity.ts
│
├── storage/
│   ├── storage.module.ts
│   └── storage.service.ts
│
├── ingestion/
│   ├── ingestion.module.ts
│   ├── ingestion.controller.ts
│   └── ingestion.service.ts
│
├── content-processing/
│   ├── content-processing.module.ts
│   ├── content-processing.service.ts
│   └── processors/
│       ├── link.processor.ts
│       ├── youtube.processor.ts
│       ├── pdf.processor.ts
│       ├── image.processor.ts
│       └── text.processor.ts
│
├── jobs/
│   ├── jobs.module.ts
│   └── processors/
│       ├── embedding.processor.ts
│       ├── fact-extraction.processor.ts
│       ├── memory-processing.processor.ts
│       ├── conversation-summary.processor.ts
│       └── file-processing.processor.ts
│
├── ai/
│   ├── ai.module.ts
│   ├── ai.service.ts
│   ├── embedding.service.ts
│   └── prompts/
│       ├── chat-system.prompt.ts
│       ├── fact-extraction.prompt.ts
│       ├── summarization.prompt.ts
│       └── memory-classification.prompt.ts
│
├── health/
│   ├── health.module.ts
│   └── health.controller.ts
│
└── common/
    ├── decorators/
    │   └── current-user.decorator.ts
    ├── filters/
    │   └── http-exception.filter.ts
    ├── interceptors/
    │   └── transform.interceptor.ts
    └── types/
        └── index.ts
```

### Module Dependency Graph

```
AppModule
├── AuthModule         → UsersModule
├── UsersModule
├── ConversationsModule → MessagesModule
├── MessagesModule
├── ChatModule         → ConversationsModule, MessagesModule, RetrievalModule, AiModule, JobsModule
├── MemoriesModule
├── RetrievalModule    → MemoriesModule, FactsModule, MessagesModule
├── FactsModule
├── PeopleModule
├── FilesModule        → StorageModule
├── StorageModule
├── IngestionModule    → ContentProcessingModule, JobsModule, FilesModule
├── ContentProcessingModule → AiModule, StorageModule
├── JobsModule         → AiModule, MemoriesModule, FactsModule, ContentProcessingModule
├── AiModule
└── HealthModule
```

---

## 4. Database Schema

### `users`

Primary user account table.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | User identifier |
| email | varchar (unique) | Login email |
| password_hash | varchar | bcrypt hash |
| display_name | varchar | User's preferred name |
| timezone | varchar | User's timezone for context-aware responses |
| created_at | timestamptz | Account creation time |
| updated_at | timestamptz | Last update |

### `conversations`

A conversation is a session of continuous chat. A user can have many conversations.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Conversation identifier |
| user_id | uuid (FK → users) | Owner |
| title | varchar | Auto-generated or user-set title |
| summary | text | LLM-generated summary of the conversation |
| message_count | integer | Cached count for pagination |
| last_message_at | timestamptz | Time of most recent message |
| created_at | timestamptz | Conversation start |
| updated_at | timestamptz | Last update |

### `messages`

Individual messages within a conversation. Both user and assistant messages.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Message identifier |
| conversation_id | uuid (FK → conversations) | Parent conversation |
| user_id | uuid (FK → users) | Message author |
| role | enum('user', 'assistant', 'system') | Who sent the message |
| content | text | Message body |
| token_count | integer | Token length for context window budgeting |
| metadata | jsonb | Model used, latency, retrieval sources cited |
| created_at | timestamptz | Send time |

### `memory_items`

High-level memory records. Each represents a "thing the AI remembers" — a conversation topic, an ingested article, a significant event.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Memory identifier |
| user_id | uuid (FK → users) | Owner |
| source_type | enum('conversation', 'ingestion', 'manual') | Where this memory came from |
| source_id | uuid | FK to conversation or ingested_item |
| title | varchar | Short description |
| summary | text | LLM-generated summary |
| importance | float | 0.0–1.0 score for retrieval ranking |
| memory_type | enum('episodic', 'semantic', 'procedural') | Classification |
| tags | text[] | Searchable tags |
| last_accessed_at | timestamptz | Recency weighting for retrieval |
| created_at | timestamptz | When the memory was created |

### `memory_chunks`

Chunked, embedded pieces of memory content. This is what pgvector searches against.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Chunk identifier |
| memory_item_id | uuid (FK → memory_items) | Parent memory |
| user_id | uuid (FK → users) | Owner (denormalized for faster queries) |
| content | text | Raw text chunk |
| embedding | vector(1536) | pgvector embedding |
| chunk_index | integer | Order within the parent memory |
| token_count | integer | Chunk size in tokens |
| created_at | timestamptz | Chunk creation time |

**Indexes:**
```sql
CREATE INDEX idx_memory_chunks_embedding
  ON memory_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
```

### `user_facts`

Extracted factual knowledge about the user. Structured data the AI can reference directly without vector search.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Fact identifier |
| user_id | uuid (FK → users) | Owner |
| category | enum('preference', 'goal', 'relationship', 'event', 'emotion', 'biographical', 'opinion', 'routine') | Fact type |
| subject | varchar | What/who the fact is about |
| predicate | varchar | Relationship or attribute |
| value | text | The fact content |
| confidence | float | 0.0–1.0 extraction confidence |
| source_message_id | uuid (FK → messages) | Message that produced this fact |
| valid_from | timestamptz | When the fact became true (if temporal) |
| valid_until | timestamptz | When the fact expired (if temporal) |
| is_active | boolean | Whether this fact is still current |
| created_at | timestamptz | Extraction time |
| updated_at | timestamptz | Last update |

### `people`

People the user mentions in conversations. The AI tracks relationships.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Person identifier |
| user_id | uuid (FK → users) | Owner |
| name | varchar | Person's name |
| relationship | varchar | "wife", "coworker", "friend", etc. |
| notes | text | Accumulated context about this person |
| mention_count | integer | How often they come up |
| last_mentioned_at | timestamptz | Recency |
| created_at | timestamptz | First mention |
| updated_at | timestamptz | Last update |

### `files`

Metadata for files stored in MinIO.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | File identifier |
| user_id | uuid (FK → users) | Owner |
| filename | varchar | Original filename |
| mime_type | varchar | MIME type |
| size_bytes | bigint | File size |
| bucket | varchar | MinIO bucket name |
| object_key | varchar | MinIO object key |
| status | enum('pending', 'uploaded', 'processing', 'processed', 'failed') | Processing state |
| metadata | jsonb | Extracted metadata (dimensions, duration, page count) |
| created_at | timestamptz | Upload time |

### `ingested_items`

Tracks content shared from the mobile share sheet — links, text, files.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Ingestion identifier |
| user_id | uuid (FK → users) | Owner |
| type | enum('link', 'youtube', 'text', 'pdf', 'image') | Content type |
| source_url | text | Original URL (if link/youtube) |
| raw_content | text | Original text or extracted text |
| processed_content | text | Cleaned/summarized content |
| title | varchar | Title of the content |
| file_id | uuid (FK → files) | Associated file (if applicable) |
| status | enum('pending', 'processing', 'processed', 'failed') | Pipeline state |
| metadata | jsonb | Type-specific metadata |
| created_at | timestamptz | Ingestion time |

---

## 5. RAG Retrieval System

When a user sends a message, the `RetrievalService` assembles a context window from multiple sources. The goal is to give the LLM everything it needs to respond as if it has known the user for years.

### Retrieval Sources

The system pulls from four distinct sources, each with its own retrieval strategy:

#### 1. Recent Conversation Context

The last N messages from the current conversation, loaded directly from the `messages` table. This gives the LLM immediate conversational continuity.

- Load the last 20 messages (or up to a token budget of ~2000 tokens)
- No embedding search needed — direct query ordered by `created_at DESC`

#### 2. Episodic Memory (Vector Search)

Semantically similar past memories retrieved via pgvector. These are chunks from past conversations and ingested content.

```sql
SELECT mc.content, mi.title, mi.summary, mi.importance,
       1 - (mc.embedding <=> $1) AS similarity
FROM memory_chunks mc
JOIN memory_items mi ON mc.memory_item_id = mi.id
WHERE mc.user_id = $2
ORDER BY mc.embedding <=> $1
LIMIT 20;
```

- Embed the user's current message using the same embedding model
- Query `memory_chunks` using cosine similarity (`<=>` operator)
- Join with `memory_items` for metadata (importance, summary)
- Return top 20 candidates for reranking

#### 3. Long-Term Facts

Structured facts from `user_facts` that match the topic of conversation. These don't need vector search — they're retrieved by category and keyword matching.

```sql
SELECT * FROM user_facts
WHERE user_id = $1
  AND is_active = true
  AND (
    subject ILIKE '%' || $2 || '%'
    OR value ILIKE '%' || $2 || '%'
  )
ORDER BY confidence DESC, updated_at DESC
LIMIT 10;
```

Additionally, always include high-confidence core facts (biographical, key preferences) regardless of query relevance.

#### 4. People Context

If the user mentions a person by name, pull that person's record and any associated facts.

```sql
SELECT * FROM people
WHERE user_id = $1 AND name ILIKE '%' || $2 || '%';
```

### Reranking Strategy

After gathering candidates from all sources, apply a composite score:

```
final_score = (0.5 × similarity) + (0.2 × importance) + (0.2 × recency) + (0.1 × access_frequency)
```

Where:
- **similarity** — cosine similarity from pgvector (0.0–1.0)
- **importance** — the `importance` field on `memory_items` (0.0–1.0)
- **recency** — exponential decay based on age: `exp(-age_days / 30)`
- **access_frequency** — normalized count of how often this memory has been retrieved

Sort by `final_score DESC`, then fit as many results as possible into the context token budget (typically ~4000 tokens for retrieval context).

### Context Assembly

The final prompt sent to the LLM is assembled in this order:

```
1. System prompt (persona, instructions)
2. User facts (core biographical facts, preferences)
3. People context (if mentioned)
4. Retrieved memories (ranked, truncated to budget)
5. Recent conversation messages
6. Current user message
```

---

## 6. Memory Processing Pipeline

Not every message deserves to become a memory. The system uses an LLM-driven classification step to decide what to remember.

### Trigger

After every assistant response is sent, a `process-message-memory` BullMQ job is enqueued. This runs asynchronously so it doesn't block the chat response.

### Step 1: Significance Classification

The LLM receives the latest message exchange and classifies whether it contains memorable information:

```
Given this message exchange, classify what types of memorable information are present.
Return a JSON object with boolean fields:

{
  "contains_fact": true,       // user stated something factual about themselves
  "contains_goal": false,      // user mentioned a goal or aspiration
  "contains_preference": true, // user expressed a preference or opinion
  "contains_event": false,     // user described a past or future event
  "contains_relationship": true, // user mentioned a person and their relationship
  "contains_emotion": false,   // user expressed significant emotional state
  "is_memorable": true,        // overall: should we remember this?
  "importance": 0.7            // 0.0-1.0 how important is this information
}
```

If `is_memorable` is false, the pipeline stops.

### Step 2: Fact Extraction

If any fact categories are flagged, the LLM extracts structured facts:

```json
[
  {
    "category": "preference",
    "subject": "coffee",
    "predicate": "prefers",
    "value": "oat milk lattes, no sugar",
    "confidence": 0.95
  },
  {
    "category": "relationship",
    "subject": "Sarah",
    "predicate": "is",
    "value": "user's sister, lives in Portland",
    "confidence": 0.9
  }
]
```

Each extracted fact is upserted into `user_facts`. If a conflicting fact already exists (same subject + predicate), the old fact is marked `is_active = false` and the new one takes over — preserving history.

### Step 3: People Extraction

If `contains_relationship` is true, extract or update entries in the `people` table. Merge with existing records by name fuzzy matching.

### Step 4: Memory Creation

If `is_memorable` is true, create a `memory_item` with a summary, then chunk the relevant message content into `memory_chunks` (typically 200–500 token chunks with 50-token overlap).

### Step 5: Embedding Generation

Each `memory_chunk` is embedded via the embedding model (e.g., `text-embedding-3-small`) and stored in the `embedding` vector column. This is what powers future semantic retrieval.

### Extraction Categories

| Category | Examples |
|----------|----------|
| **Facts** | "I'm allergic to peanuts", "I work at Google", "I was born in 1990" |
| **Goals** | "I want to run a marathon", "I'm trying to learn Spanish" |
| **Preferences** | "I love horror movies", "I prefer working at night" |
| **Events** | "I'm getting married in June", "I went to Japan last year" |
| **Relationships** | "My mom's name is Linda", "Jake is my roommate" |
| **Emotions** | "I've been feeling really anxious lately", "Today was the best day" |

---

## 7. Content Ingestion System

Users can share content to FriendAI from any app on their phone via the native share sheet. The API processes this content and adds it to the user's memory.

### Share Sheet Flow

```
Mobile Share Sheet
       │
       ▼
  Detect Content Type
       │
       ├── URL → /ingestion/share-link
       ├── Text → /ingestion/share-text
       └── File → /ingestion/share-file/init + /share-file/complete
```

### Link Processing Pipeline

```
URL received
  │
  ├── Is YouTube? → YouTube processor
  │     │
  │     ├── Extract video ID
  │     ├── Fetch transcript (youtube-transcript-api or similar)
  │     ├── Fetch metadata (title, channel, duration)
  │     ├── Summarize transcript via LLM
  │     └── Create memory_item + chunks + embeddings
  │
  └── Regular link → Link processor
        │
        ├── Fetch page content (readability extraction)
        ├── Strip HTML → clean text
        ├── Extract title, description, author
        ├── Summarize via LLM
        └── Create memory_item + chunks + embeddings
```

### Text Processing Pipeline

```
Text snippet received
  │
  ├── Classify content (note, quote, idea, etc.)
  ├── Extract key information via LLM
  ├── Create memory_item
  ├── Chunk if longer than 500 tokens
  └── Generate embeddings
```

### PDF Processing Pipeline

```
PDF file uploaded
  │
  ├── Upload to MinIO (user-attachments bucket)
  ├── Create file record (status: processing)
  ├── Extract text (pdf-parse or similar)
  ├── Extract metadata (title, author, page count)
  ├── Summarize via LLM
  ├── Chunk text (500 tokens, 50 overlap)
  ├── Generate embeddings for each chunk
  ├── Create memory_item + memory_chunks
  └── Update file record (status: processed)
```

### Image Processing Pipeline

```
Image file uploaded
  │
  ├── Upload to MinIO (user-images bucket)
  ├── Create file record (status: processing)
  ├── Generate description via vision LLM
  ├── Extract any text (OCR if applicable)
  ├── Create memory_item with description
  ├── Generate embedding from description
  └── Update file record (status: processed)
```

### Ingestion Status

Each ingested item goes through states: `pending → processing → processed | failed`. The mobile app can poll the status or receive push notifications when processing completes.

---

## 8. MinIO Storage Design

### Bucket Structure

| Bucket | Purpose | Content Types |
|--------|---------|---------------|
| `user-audio` | Voice messages, audio recordings | .mp3, .m4a, .wav |
| `user-images` | Photos, screenshots shared by users | .jpg, .png, .webp, .heic |
| `user-attachments` | PDFs, documents, general files | .pdf, .docx, .txt |
| `user-exports` | Generated exports (memory dumps, conversation exports) | .json, .csv, .pdf |

### Object Key Convention

```
{bucket}/{user_id}/{year}/{month}/{uuid}.{ext}

Example:
user-images/550e8400-e29b-41d4-a716-446655440000/2026/03/a1b2c3d4.jpg
```

### Signed Upload Flow (Mobile → MinIO)

The mobile app never sends file bytes through the API server. Instead, it gets a presigned URL and uploads directly to MinIO.

```
1. Mobile → POST /files/upload-url
   Body: { filename: "photo.jpg", mimeType: "image/jpeg", sizeBytes: 204800 }

2. API creates file record (status: pending)
   API generates presigned PUT URL from MinIO (expires in 15 min)
   API responds: { fileId, uploadUrl, expiresAt }

3. Mobile → PUT {uploadUrl}
   Body: raw file bytes
   Headers: Content-Type: image/jpeg

4. Mobile → POST /ingestion/share-file/complete
   Body: { fileId }

5. API updates file record (status: uploaded)
   API enqueues process-uploaded-file job
   API responds: { status: "processing" }
```

### Signed Download Flow

```
1. Mobile → GET /files/:id/url

2. API verifies ownership
   API generates presigned GET URL from MinIO (expires in 1 hour)
   API responds: { downloadUrl, expiresAt }

3. Mobile loads content from downloadUrl directly
```

---

## 9. Background Jobs

All heavy processing runs asynchronously via BullMQ workers backed by Redis. The API server enqueues jobs and returns immediately.

### Queue Architecture

| Queue | Purpose | Concurrency |
|-------|---------|-------------|
| `memory` | Memory extraction from messages | 5 |
| `embedding` | Vector embedding generation | 10 |
| `facts` | Fact extraction and upsert | 5 |
| `ingestion` | Content processing (links, PDFs, images) | 3 |
| `maintenance` | Summarization, cleanup, reindexing | 2 |

### Job Types

#### `process-message-memory`

**Queue:** memory
**Trigger:** After every assistant response
**Input:** `{ messageId, conversationId, userId }`
**Steps:**
1. Load the latest message exchange
2. Classify significance via LLM
3. If memorable → create memory_item, enqueue `extract-facts` and `generate-embedding`

#### `generate-embedding`

**Queue:** embedding
**Trigger:** New memory_chunk or updated content
**Input:** `{ chunkId, content }`
**Steps:**
1. Call embedding API (e.g., OpenAI `text-embedding-3-small`)
2. Store 1536-dimensional vector in `memory_chunks.embedding`

#### `extract-facts`

**Queue:** facts
**Trigger:** Message classified as containing facts
**Input:** `{ messageId, userId, categories }`
**Steps:**
1. Send message to LLM with fact extraction prompt
2. Parse structured JSON response
3. Upsert facts into `user_facts` (deactivate conflicting old facts)
4. Upsert people into `people` table if relationships found

#### `summarize-conversation`

**Queue:** maintenance
**Trigger:** Conversation reaches 50+ messages or on conversation close
**Input:** `{ conversationId }`
**Steps:**
1. Load all messages in conversation
2. Generate summary via LLM
3. Update `conversations.summary`
4. Create consolidated memory_item from summary

#### `process-uploaded-file`

**Queue:** ingestion
**Trigger:** File upload completed
**Input:** `{ fileId, userId }`
**Steps:**
1. Download file from MinIO
2. Route to appropriate content processor (PDF, image, etc.)
3. Extract text / generate description
4. Create memory_item + chunks
5. Enqueue `generate-embedding` for each chunk
6. Update file status to `processed`

### Job Configuration

All jobs use the following defaults:

```typescript
{
  attempts: 3,
  backoff: { type: 'exponential', delay: 1000 },
  removeOnComplete: { age: 86400, count: 1000 },
  removeOnFail: { age: 604800 }
}
```

---

## 10. API Endpoints

All endpoints are prefixed with `/api`. Protected endpoints require a Bearer JWT token.

### Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/register` | No | Create account. Body: `{ email, password, displayName }` |
| POST | `/auth/login` | No | Get JWT. Body: `{ email, password }`. Returns: `{ accessToken, user }` |
| GET | `/auth/me` | Yes | Get current user profile |

### Chat

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/chat/send` | Yes | Send a message and get AI response. Body: `{ conversationId?, message }`. If no `conversationId`, creates a new conversation. Returns: `{ conversationId, message, assistantMessage }` |

### Conversations

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/conversations` | Yes | Create empty conversation. Body: `{ title? }` |
| GET | `/conversations` | Yes | List user's conversations. Query: `?page=1&limit=20` |
| GET | `/conversations/:id` | Yes | Get conversation details including summary |
| GET | `/conversations/:id/messages` | Yes | Get messages. Query: `?page=1&limit=50&before=cursor` |

### Memories

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/memories` | Yes | List user's memories. Query: `?type=episodic&page=1&limit=20` |
| GET | `/memories/search` | Yes | Semantic search. Query: `?q=trip+to+japan&limit=10`. Returns ranked results with similarity scores |
| DELETE | `/memories/:id` | Yes | Delete a memory and its chunks |

### Ingestion

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/ingestion/share-link` | Yes | Process a shared URL. Body: `{ url }` |
| POST | `/ingestion/share-text` | Yes | Process shared text. Body: `{ text, title? }` |
| POST | `/ingestion/share-file/init` | Yes | Initialize file upload. Body: `{ filename, mimeType, sizeBytes }`. Returns: `{ fileId, uploadUrl }` |
| POST | `/ingestion/share-file/complete` | Yes | Mark upload complete, start processing. Body: `{ fileId }` |

### Files

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/files/upload-url` | Yes | Get a presigned upload URL. Body: `{ filename, mimeType, sizeBytes }` |
| GET | `/files/:id/url` | Yes | Get a presigned download URL |

### Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | No | Returns `{ status, timestamp, services: { db, redis, minio } }` |

---

## 11. Processing Flows

### Flow 1: User Sends a Chat Message

```
User types: "I had dinner with Sarah last night, she's thinking about moving to Austin"
  │
  ▼
POST /api/chat/send { conversationId: "abc", message: "..." }
  │
  ▼
ChatService.send()
  │
  ├── 1. Save user message to messages table
  │
  ├── 2. RetrievalService.getContext(userId, message)
  │     │
  │     ├── Embed the message
  │     ├── Vector search memory_chunks → top 10 relevant memories
  │     ├── Query user_facts WHERE subject ILIKE '%sarah%'
  │     ├── Query people WHERE name ILIKE '%sarah%'
  │     ├── Load last 20 messages from this conversation
  │     └── Assemble + rerank → context window
  │
  ├── 3. AiService.chat(systemPrompt, context, messages)
  │     │
  │     └── LLM generates response using full context
  │         "That sounds great! Last time you mentioned Sarah was
  │          considering a job change too. How's she feeling about
  │          the move?"
  │
  ├── 4. Save assistant message to messages table
  │
  ├── 5. Return response to mobile app immediately
  │
  └── 6. Enqueue async job: process-message-memory
        │
        └── [Runs in background via BullMQ]
              │
              ├── Classify: contains_relationship ✓, contains_event ✓
              │
              ├── Extract facts:
              │   - { category: "event", subject: "dinner with Sarah",
              │     value: "had dinner last night" }
              │   - { category: "relationship", subject: "Sarah",
              │     predicate: "considering", value: "moving to Austin" }
              │
              ├── Update people record for Sarah:
              │   notes += "considering moving to Austin (March 2026)"
              │
              ├── Create memory_item (importance: 0.6)
              │
              ├── Create memory_chunk with message content
              │
              └── Enqueue generate-embedding for chunk
```

### Flow 2: User Shares a Link

```
User shares: "https://arxiv.org/abs/2401.12345" via share sheet
  │
  ▼
POST /api/ingestion/share-link { url: "https://arxiv.org/abs/2401.12345" }
  │
  ▼
IngestionService.shareLink()
  │
  ├── 1. Create ingested_item (status: pending)
  ├── 2. Return { id, status: "processing" } immediately
  └── 3. Enqueue process-shared-link job
        │
        └── [BullMQ worker]
              │
              ├── Detect type: regular link (not YouTube)
              │
              ├── LinkProcessor.process()
              │   ├── Fetch page HTML
              │   ├── Readability extraction → clean text
              │   ├── Extract: title, author, description
              │   └── Return structured content
              │
              ├── AiService.summarize(content)
              │   └── Returns 2-3 paragraph summary
              │
              ├── Update ingested_item (status: processed)
              │
              ├── Create memory_item
              │   source_type: "ingestion"
              │   title: "Research paper: Attention Mechanisms..."
              │   summary: <LLM summary>
              │   importance: 0.5
              │
              ├── Chunk content (500 tokens, 50 overlap)
              │   → memory_chunk[0], memory_chunk[1], ...
              │
              └── Enqueue generate-embedding for each chunk
```

### Flow 3: User Uploads a PDF

```
User shares a PDF from their phone
  │
  ▼
POST /api/ingestion/share-file/init
  { filename: "resume.pdf", mimeType: "application/pdf", sizeBytes: 204800 }
  │
  ▼
IngestionService.initFileUpload()
  │
  ├── Create file record (status: pending)
  ├── Generate presigned PUT URL for MinIO
  └── Return { fileId, uploadUrl, expiresAt }
  │
  ▼
Mobile app PUTs file bytes directly to MinIO via uploadUrl
  │
  ▼
POST /api/ingestion/share-file/complete { fileId: "xyz" }
  │
  ▼
IngestionService.completeFileUpload()
  │
  ├── 1. Update file (status: uploaded)
  ├── 2. Create ingested_item (type: pdf, status: pending)
  ├── 3. Return { status: "processing" } immediately
  └── 4. Enqueue process-uploaded-file job
        │
        └── [BullMQ worker]
              │
              ├── Download PDF from MinIO
              │
              ├── PdfProcessor.process()
              │   ├── pdf-parse → extract all text
              │   ├── Extract metadata (title, author, pages)
              │   └── Return structured content
              │
              ├── AiService.summarize(content)
              │
              ├── Update ingested_item (status: processed)
              ├── Update file (status: processed)
              │
              ├── Create memory_item
              │   source_type: "ingestion"
              │   memory_type: "semantic"
              │   title: "Resume — John Doe"
              │
              ├── Chunk text → memory_chunks
              │   (500 tokens per chunk, 50 token overlap)
              │
              └── Enqueue generate-embedding for each chunk
                    │
                    └── [embedding worker]
                          ├── Call embedding API
                          └── Store vector(1536) in memory_chunks.embedding
```

---

## 12. Development Roadmap

Build order, from foundation to full feature set.

### Phase 1: Foundation

1. **Project scaffold** — NestJS project, TypeORM config, Docker Compose (PostgreSQL, Redis, MinIO)
2. **Database setup** — Create entities for `users`, `conversations`, `messages`
3. **Auth module** — JWT registration/login, auth guard, current-user decorator
4. **Health module** — Health endpoint with DB/Redis/MinIO connectivity checks
5. **Storage module** — MinIO client service, bucket initialization

### Phase 2: Core Chat

6. **Conversations module** — CRUD for conversations
7. **Messages module** — Message persistence, pagination
8. **AI module** — LLM client service (OpenAI SDK or equivalent), prompt templates
9. **Chat module** — `POST /chat/send` with basic conversation context (no RAG yet)
10. **Basic chat works end-to-end** — mobile app can chat with the AI

### Phase 3: Memory System

11. **Memory entities** — `memory_items`, `memory_chunks` with pgvector column
12. **Memories module** — CRUD, search endpoint
13. **Jobs module** — BullMQ setup, `process-message-memory` processor
14. **Embedding service** — Generate and store embeddings via LLM API
15. **Memory processing pipeline** — Significance classification → memory creation → chunking → embedding

### Phase 4: RAG Retrieval

16. **Facts module** — `user_facts` entity, fact extraction processor
17. **People module** — `people` entity, relationship tracking
18. **Retrieval module** — Multi-source retrieval (vector search + facts + people + recent messages)
19. **Reranking** — Composite scoring (similarity × importance × recency)
20. **Integrate retrieval into chat** — Chat responses now use full RAG context

### Phase 5: Content Ingestion

21. **Files module** — Presigned upload/download URLs
22. **Ingestion module** — Share endpoints for links, text, files
23. **Content processors** — Link, YouTube, text, PDF, image processors
24. **File processing jobs** — BullMQ workers for async content processing
25. **Ingested content becomes searchable memory**

### Phase 6: Polish and Scale

26. **Conversation summarization** — Auto-summarize long conversations
27. **Memory importance decay** — Reduce importance of old, unaccessed memories
28. **Fact conflict resolution** — Handle contradicting facts gracefully
29. **Rate limiting and error handling** — Production-ready middleware
30. **Monitoring** — Job queue dashboards, error tracking, performance metrics

---

## Related Docs

- [02 — Backend Blueprint](./02-backend-blueprint.md) — Full module-by-module implementation code
- [03 — Memory Strategy](./03-memory-strategy.md) — Product and technical strategy for the memory system
- [04 — RAG Pipeline](./04-rag-pipeline.md) — Memory extraction, embedding, and retrieval implementation
- [05 — Ingestion Architecture](./05-ingestion-architecture.md) — Share-to-memory pipeline for links, text, and files
- [06 — Mobile Architecture](./06-mobile-architecture.md) — Expo React Native client implementation
