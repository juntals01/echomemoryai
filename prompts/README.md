> Part of [FriendAI Architecture Documentation](../docs/README.md)

# FriendAI — Prompt Templates

All AI prompt templates used by the FriendAI backend. Each prompt is maintained as a standalone Markdown file so it can be reviewed, versioned, and iterated on independently of the application code.

---

## Prompts

| Prompt | Used By | Purpose |
|--------|---------|---------|
| [Chat System](./chat-system.prompt.md) | `ChatService.buildPrompt()` | AI persona and behavioral rules for chat |
| [Memory Classification](./memory-classification.prompt.md) | `AIService.classifyMemory()` | Decides if a message is worth remembering and scores it |
| [Fact Extraction](./fact-extraction.prompt.md) | `AIService.extractFacts()` | Extracts stable long-term facts from messages |
| [Summarization](./summarization.prompt.md) | `AIService.summarizeMemory()` | Summarizes content before embedding |

---

## How Prompts Are Used

```
User message arrives
  │
  ├─ Chat System Prompt ──────── builds the system message for the LLM response
  │
  └─ After response, async jobs:
       │
       ├─ Memory Classification ── decides if exchange is memorable
       │
       ├─ Fact Extraction ──────── pulls stable facts from the message
       │
       └─ Summarization ────────── condenses content before embedding
```

---

## Template Variables

All prompts use `{{VARIABLE}}` placeholders that are replaced at runtime:

| Variable | Used In | Source |
|----------|---------|--------|
| `{{USER_MESSAGE}}` | Memory Classification | Current user message |
| `{{ASSISTANT_MESSAGE}}` | Memory Classification | Current AI response |
| `{{MESSAGE}}` | Fact Extraction | Memory or message content |
| `{{CONTENT}}` | Summarization | Raw text to summarize |

---

## Guidelines for Editing Prompts

1. **Test changes** — Prompt edits can significantly change AI behavior. Test with real examples before deploying.
2. **Keep output structured** — Classification and extraction prompts must return valid JSON. Keep the output format instructions explicit.
3. **Never remove safety rules** — The chat system prompt includes anti-hallucination rules. These are critical for trust.
4. **Version with git** — All prompt changes are tracked in version control. Use clear commit messages.
