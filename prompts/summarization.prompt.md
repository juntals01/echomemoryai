> Part of [FriendAI Architecture Documentation](../docs/README.md)

# Summarization Prompt

**Used by:** `AIService.summarizeMemory()` in the AI module  
**Purpose:** Summarizes content (articles, PDFs, long text) before embedding  
**Variable:** `SUMMARIZATION_PROMPT`

---

## Prompt

Summarize the following content in 2-3 concise paragraphs. Focus on:

- Key facts and information
- Personally relevant details the user might want to recall later
- Main ideas and conclusions

### Content

{{CONTENT}}

Write a clear, informative summary. Do not add opinions or commentary.

---

## Template Variables

| Variable | Source | Description |
|----------|--------|-------------|
| `{{CONTENT}}` | Raw text | The content to summarize — could be a message, article, PDF text, or shared note |

---

## Usage Context

This prompt is used in two main flows:

1. **Memory Processing** — When a conversation message is classified as memorable, the raw text is summarized before creating a `MemoryItem`
2. **Content Ingestion** — When shared links, PDFs, or text are ingested, the extracted content is summarized before embedding

---

## Related Docs

- [04 — RAG Pipeline](../docs/04-rag-pipeline.md) — MemoryProcessingService that uses this for memory summarization
- [05 — Ingestion Architecture](../docs/05-ingestion-architecture.md) — Content processing that uses this for shared content
- [02 — Backend Blueprint](../docs/02-backend-blueprint.md) — AIService.summarizeMemory() implementation
