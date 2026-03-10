# FriendAI — Architecture Documentation

Internal engineering handbook for the FriendAI project. An AI companion mobile app that remembers your life using RAG.

**Stack:** Expo (React Native) · NestJS · PostgreSQL · pgvector · MinIO · Redis + BullMQ · DeepSeek / Gemini

---

## Project Overview

FriendAI is a mobile AI companion that remembers user information across conversations, shared content, and ingested files. The system uses Retrieval-Augmented Generation (RAG) to provide personalized, memory-aware responses.

The documentation is organized into six areas: high-level architecture, backend implementation, memory strategy, RAG pipeline, content ingestion, and the mobile client.

---

## Architecture Documents

| Document | Description |
|----------|-------------|
| [01 — API Architecture](./01-api-architecture.md) | High-level system architecture, database schema, module structure, API endpoints, processing flows, and development roadmap |
| [02 — Backend Blueprint](./02-backend-blueprint.md) | Complete code generation plan — every file, module, entity, service, and controller with implementation code |
| [03 — Memory Strategy](./03-memory-strategy.md) | Product and technical strategy for the memory system — what to remember, scoring, decay, retrieval, privacy, and cost |
| [04 — RAG Pipeline](./04-rag-pipeline.md) | Implementation spec for memory extraction, embedding generation, semantic retrieval, and fact extraction |
| [05 — Ingestion Architecture](./05-ingestion-architecture.md) | Share-to-memory pipeline — how links, text, PDFs, and images flow from the mobile share sheet into searchable memory |
| [06 — Mobile Architecture](./06-mobile-architecture.md) | Expo React Native client — screens, components, state management, API integration, and share handler |
| [Prompt Templates](../prompts/README.md) | All AI prompt templates — chat persona, memory classification, fact extraction, summarization |

---

## Backend API

The NestJS backend is the core of FriendAI. It handles authentication, chat orchestration, memory management, content ingestion, and background processing.

- [API Architecture](./01-api-architecture.md) — System design, database schema, endpoints, and processing flows
- [Backend Blueprint](./02-backend-blueprint.md) — Full module-by-module implementation with code for all 16 NestJS modules

Key modules: `AuthModule`, `ChatModule`, `MemoriesModule`, `RetrievalModule`, `FactsModule`, `PeopleModule`, `IngestionModule`, `StorageModule`, `AiModule`, `JobsModule`

---

## Memory System

Memory is the core differentiator of FriendAI. The system extracts, scores, stores, and retrieves memories from conversations and shared content.

- [Memory Strategy](./03-memory-strategy.md) — Product-level decisions: what to remember, importance scoring (1–10), decay rules, emotional guardrails, privacy, and cost model
- [RAG Pipeline](./04-rag-pipeline.md) — Technical implementation: MemoryProcessingService, EmbeddingService, RetrievalService, FactExtractionService, BullMQ workers, pgvector queries

Key entities: `MemoryItem`, `MemoryChunk`, `UserFact`, `Person`

---

## Content Ingestion

Users share content from other apps via the mobile share sheet. The ingestion system processes it into searchable memory.

- [Ingestion Architecture](./05-ingestion-architecture.md) — Full pipeline: endpoints, DTOs, link/text/file processing services, BullMQ processors, MinIO storage integration

Supported content: links, YouTube links, plain text, PDFs, images, generic files

Key entities: `IngestedItem`, `FileObject`

---

## Mobile Application

The Expo React Native client provides chat, memory browsing, and content sharing.

- [Mobile Architecture](./06-mobile-architecture.md) — Screens, components, Zustand stores, React Query hooks, API client, share handler

Key screens: Login, Register, Conversations, Chat, Memories, Settings, Share

---

## Prompt Templates

All AI prompts are maintained as standalone Markdown files in the [`prompts/`](../prompts/README.md) folder, separate from application code.

| Prompt | Purpose |
|--------|---------|
| [Chat System](../prompts/chat-system.prompt.md) | AI persona and behavioral rules for chat |
| [Memory Classification](../prompts/memory-classification.prompt.md) | Decides if a message is worth remembering |
| [Fact Extraction](../prompts/fact-extraction.prompt.md) | Extracts stable long-term facts from messages |
| [Summarization](../prompts/summarization.prompt.md) | Summarizes content before embedding |

---

## Development Roadmap

Detailed in the [API Architecture](./01-api-architecture.md#12-development-roadmap) doc and the [Memory Strategy MVP section](./03-memory-strategy.md#22-mvp-recommendation).

### Phase 1: Foundation
Project scaffold, database entities, auth, health check, storage

### Phase 2: Core Chat
Conversations, messages, AI module, basic chat (no RAG)

### Phase 3: Memory System
MemoryItem/MemoryChunk entities, BullMQ jobs, embedding pipeline, memory processing

### Phase 4: RAG Retrieval
Fact extraction, people tracking, multi-source retrieval, reranking, RAG-powered chat

### Phase 5: Content Ingestion
File uploads, share endpoints, link/text/PDF/image processing, ingested content as memory

### Phase 6: Polish
Conversation summarization, memory decay, fact conflict resolution, rate limiting, monitoring

---

## Quick Reference

### Run the Project

```bash
npm run setup          # Install all deps + start Docker
npm start              # API (port 3000) first, then mobile
```

### Infrastructure

```bash
npm run docker:up      # PostgreSQL (pgvector) + Redis + MinIO
npm run docker:down    # Stop services
npm run docker:reset   # Reset volumes and restart
```

### API

```bash
cd api && npm run start:dev    # NestJS dev server on port 3000
```

### Mobile

```bash
cd mobile && npx expo start   # Expo dev server
```
