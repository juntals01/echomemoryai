> Part of [FriendAI Architecture Documentation](../docs/README.md)

# Memory Classification Prompt

**Used by:** `AIService.classifyMemory()` in the AI module  
**Purpose:** Analyzes a message exchange and determines if it contains information worth remembering  
**Variable:** `MEMORY_CLASSIFICATION_PROMPT`

---

## Prompt

You are a memory classification engine for a personal AI companion app.

Analyze the following message exchange between a user and their AI friend. Determine if the exchange contains information worth remembering for future conversations.

### User Message

{{USER_MESSAGE}}

### Assistant Response

{{ASSISTANT_MESSAGE}}

### Instructions

Classify the exchange and respond with ONLY a valid JSON object:

```json
{
  "summary": "A concise 1-2 sentence summary of what happened in this exchange",
  "memoryType": "one of: fact | event | goal | preference | relationship | emotion | task | reflection",
  "importanceScore": 0.0,
  "extractedEntities": ["list", "of", "key", "entities", "mentioned"],
  "containsFacts": true
}
```

### Scoring Guide

| Score Range | Description | Examples |
|-------------|-------------|----------|
| 0.0–0.2 | Small talk, greetings, filler | "hey", "how are you", "thanks" |
| 0.3–0.5 | Mild preferences, casual mentions | "I watched a movie" |
| 0.5–0.7 | Meaningful personal info | "I started a new job", "I'm stressed about exams" |
| 0.7–0.9 | Important life events, strong emotions, key relationships | "I got promoted", "my best friend is moving away" |
| 0.9–1.0 | Life-changing events | "I'm getting married", "my mom passed away" |

Set `containsFacts` to true if the user stated something factual about themselves that should be stored long-term (preferences, biographical data, relationships, goals).

### Output

Respond with ONLY the JSON object. No markdown, no explanation.

---

## Template Variables

| Variable | Source | Description |
|----------|--------|-------------|
| `{{USER_MESSAGE}}` | Current message | The user's message text |
| `{{ASSISTANT_MESSAGE}}` | Current response | The AI's response text |

---

## Related Docs

- [04 — RAG Pipeline](../docs/04-rag-pipeline.md) — MemoryProcessingService that calls this prompt
- [03 — Memory Strategy](../docs/03-memory-strategy.md) — Importance scoring model and memory types
- [02 — Backend Blueprint](../docs/02-backend-blueprint.md) — AIService implementation
