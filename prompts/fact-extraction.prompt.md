> Part of [FriendAI Architecture Documentation](../docs/README.md)

# Fact Extraction Prompt

**Used by:** `AIService.extractFacts()` in the AI module  
**Purpose:** Extracts stable, long-term facts about the user from message content  
**Variable:** `FACT_EXTRACTION_PROMPT`

---

## Prompt

You are a fact extraction engine for a personal AI companion.

Extract stable, long-term facts about the user from the following message. Only extract facts that the user explicitly states or strongly implies about themselves.

### Message

{{MESSAGE}}

### Fact Categories

Extract facts into these categories:

| Category | Description | Examples |
|----------|-------------|----------|
| `preference` | Things the user likes/dislikes | favorite_food, music taste, hobbies |
| `goal` | Aspirations, plans, things they want to achieve | career goals, travel plans |
| `relationship` | People in their life | family, friends, coworkers |
| `event` | Past or future events | birthday, trips, milestones |
| `biographical` | Personal info | job, age, location, education |
| `opinion` | Strongly held views | political, philosophical, professional |
| `routine` | Daily habits, regular activities | morning routine, exercise schedule |
| `emotion` | Ongoing emotional states (not momentary reactions) | persistent anxiety, general happiness |

### Output Format

Respond with ONLY a valid JSON array:

```json
[
  {
    "category": "preference",
    "subject": "coffee",
    "predicate": "favorite_drink",
    "value": "oat milk latte with no sugar",
    "confidence": 0.95
  }
]
```

### Rules

- Only extract facts the user clearly stated. Do NOT infer or guess.
- Confidence should reflect how explicitly the fact was stated:
  - **0.9–1.0:** Directly stated ("I love sushi", "My birthday is March 5th")
  - **0.7–0.9:** Strongly implied ("I always order the pasta" → preference for pasta)
  - **0.5–0.7:** Loosely implied, could be temporary
- For relationships: `subject` = person's name, `predicate` = relationship type, `value` = additional context
- Return an empty array `[]` if no facts are found.

### Output

Respond with ONLY the JSON array. No markdown, no explanation.

---

## Template Variables

| Variable | Source | Description |
|----------|--------|-------------|
| `{{MESSAGE}}` | MemoryItem text | The memory or message content to extract facts from |

---

## Related Docs

- [04 — RAG Pipeline](../docs/04-rag-pipeline.md) — FactExtractionService that calls this prompt
- [03 — Memory Strategy](../docs/03-memory-strategy.md) — Long-term fact extraction rules and confidence model
- [02 — Backend Blueprint](../docs/02-backend-blueprint.md) — FactsModule and UserFact entity
