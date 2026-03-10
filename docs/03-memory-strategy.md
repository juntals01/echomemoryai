> Part of [FriendAI Architecture Documentation](./README.md)

# FriendAI Memory Strategy

Internal strategy document for product and engineering. Defines how memory works in FriendAI — what gets remembered, how it's scored, how it's retrieved, how it decays, and how to build it responsibly and affordably.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Memory Principles](#2-memory-principles)
3. [Types of Memory](#3-types-of-memory)
4. [What Should Be Remembered](#4-what-should-be-remembered)
5. [What Should Usually Not Be Remembered](#5-what-should-usually-not-be-remembered)
6. [Memory Importance Scoring](#6-memory-importance-scoring)
7. [Memory Extraction Rules](#7-memory-extraction-rules)
8. [Long-Term Fact Extraction](#8-long-term-fact-extraction)
9. [Relationship Memory](#9-relationship-memory)
10. [Emotional Memory](#10-emotional-memory)
11. [Memory Decay and Reinforcement](#11-memory-decay-and-reinforcement)
12. [Retrieval Strategy](#12-retrieval-strategy)
13. [Memory Consolidation](#13-memory-consolidation)
14. [Memory From Shared Content](#14-memory-from-shared-content)
15. [User Controls and Trust](#15-user-controls-and-trust)
16. [Privacy and Safety](#16-privacy-and-safety)
17. [Cost-Aware Memory Design](#17-cost-aware-memory-design)
18. [Suggested Data Model](#18-suggested-data-model)
19. [Example Memory Classification Table](#19-example-memory-classification-table)
20. [Example Retrieval Scenarios](#20-example-retrieval-scenarios)
21. [Engineering Recommendations](#21-engineering-recommendations)
22. [MVP Recommendation](#22-mvp-recommendation)

---

## 1. Overview

FriendAI is an AI companion that remembers your life. Not like a search engine remembers — like a close friend remembers. The kind of person who knows you prefer oat milk, remembers that your sister just moved to Portland, and asks you how the job interview went two weeks later without being prompted.

Memory is the core differentiator. Without memory, FriendAI is just another chatbot. With memory, it becomes something people genuinely rely on — a companion that gets better the more you use it.

The memory system has three jobs:

1. **Decide what matters.** Most of what people say in a day is noise. A good friend instinctively knows the difference between "I'm thinking about quitting my job" and "I had a sandwich." The memory system must make this distinction automatically.

2. **Store it durably and affordably.** Memories must survive across conversations, be searchable by meaning (not just keywords), and remain cheap enough to serve users who can't afford premium pricing.

3. **Retrieve it naturally.** When the user says something that connects to a past memory, the system must surface that memory in the AI's response — without dumping a database into the prompt, without hallucinating details that weren't there, and without feeling invasive.

If the memory system works, users will say: "It actually remembers me." That is the entire product thesis.

---

## 2. Memory Principles

These principles govern every design decision in the memory system. When in doubt, refer back to these.

### Remember what matters

Not every message deserves to be a memory. A friend doesn't memorize your grocery list — but they remember that you're training for a marathon, that your dad is in the hospital, and that you've been stressed about rent. The system should have strong opinions about what is worth remembering.

### Do not remember everything equally

Importance is not binary. A user mentioning their wedding date is a 10. Mentioning they had pasta for lunch is a 2. The system must assign importance scores and use them to prioritize storage, retrieval, and context window budget.

### Be useful, not creepy

There is a line between "I remember you mentioned you've been stressed" and "I've been analyzing your emotional patterns and I notice a recurring sadness on Tuesdays." Stay on the useful side. When in doubt, understate. A good friend doesn't perform a psychological evaluation — they just remember and respond with care.

### Be transparent and editable

Users must be able to see what FriendAI remembers about them, correct it, and delete it. Memory must never feel like surveillance. The user is always in control.

### Never hallucinate personal history

This is the hardest and most important rule. If the AI cannot find a relevant memory, it must say "I don't remember you mentioning that" rather than inventing a plausible-sounding recollection. Hallucinated memories destroy trust instantly and permanently.

### Keep memory retrieval affordable

FriendAI is designed for people who may not be able to afford expensive AI services. This means we cannot send 10,000 tokens of memory context into every LLM call. Memory retrieval must be selective, ranked, and budget-conscious. We'd rather retrieve 5 highly relevant memories than 50 loosely related ones.

### Protect user privacy

Memory is intimate data. It must be stored per-user, never shared, never used for training, and actually deleted when the user requests deletion. The system must be designed so that a data breach of one user's memories does not expose another's.

---

## 3. Types of Memory

### Short-Term Conversation Context

**What it is:** The immediate back-and-forth of the current conversation. The last 10–20 messages.

**Examples:**
- "You just told me you're at the airport"
- "We were talking about your resume"

**Duration:** Lives only for the duration of the conversation. Not stored as a memory item — loaded directly from the messages table.

**Retrieval:** Always included. Load the most recent N messages from the active conversation.

---

### Episodic Memory

**What it is:** A specific event or exchange that happened. A moment in time.

**Examples:**
- "You told me about your fight with your roommate on March 3rd"
- "You shared a link about starting a bakery last week"
- "You mentioned your mom's surgery was scheduled for next Tuesday"

**Duration:** Long-term. May decay if never accessed and importance is low.

**Retrieval:** Semantic vector search against memory chunks. Retrieved when the user's current message is semantically similar to a past episode.

---

### Semantic Memory / User Facts

**What it is:** Stable, structured knowledge about the user. Things that are true over time, not tied to a single moment.

**Examples:**
- "You're allergic to peanuts"
- "You work as a nurse"
- "Your birthday is September 12th"
- "You prefer dark mode"

**Duration:** Permanent until superseded or corrected. Facts can become stale and should be re-evaluated periodically.

**Retrieval:** Direct lookup by category and keyword. Always include high-confidence core facts in every prompt, regardless of query relevance.

---

### Relationship Memory

**What it is:** Knowledge about people in the user's life — who they are, what the relationship is, key details.

**Examples:**
- "Sarah is your sister. She lives in Portland and just started a new job."
- "Mark is your coworker. You've mentioned he's difficult to work with."
- "Mom — you talk to her every Sunday."

**Duration:** Permanent. Updated on each mention.

**Retrieval:** Triggered when a person's name appears in the user's message. Pull the person profile and inject into context.

---

### Goal Memory

**What it is:** Things the user wants to achieve, is working toward, or has expressed as aspirations.

**Examples:**
- "You want to run a marathon before you turn 30"
- "You're saving up to move to Austin"
- "You want to learn to play guitar"

**Duration:** Long-term. Should decay or be archived if the user stops mentioning the goal and indicates it's no longer relevant.

**Retrieval:** When the user discusses progress, setbacks, or topics related to a stored goal.

---

### Preference Memory

**What it is:** Likes, dislikes, opinions, and tastes.

**Examples:**
- "You love horror movies but hate jump scares"
- "You prefer oat milk in your coffee"
- "You think remote work is better than office work"

**Duration:** Long-term. Preferences can change and should be superseded when contradicted.

**Retrieval:** When the user asks for opinions, recommendations, or when the topic aligns with a known preference.

---

### Emotional Memory

**What it is:** Emotional states the user has expressed over time. Patterns, not diagnostics.

**Examples:**
- "You've been feeling anxious about your finances lately"
- "You seemed really happy when you talked about your new dog"
- "You mentioned feeling burned out at work several times"

**Duration:** Moderate. Recent emotional states are more relevant than old ones. Should decay faster than facts.

**Retrieval:** When the user's message has emotional content or when the AI is deciding on tone.

**Caution:** See [Section 10: Emotional Memory](#10-emotional-memory) for guardrails.

---

### Task / Reminder Memory

**What it is:** Things the user asked the AI to remember for a specific purpose, or commitments they mentioned.

**Examples:**
- "Remind me to call the dentist on Monday"
- "I need to submit my taxes before April 15th"
- "Don't let me forget to buy milk"

**Duration:** Until the task is completed or the deadline passes.

**Retrieval:** Time-based and topic-based. Surface when the deadline approaches or when the user discusses the related topic.

---

### Imported Content Memory

**What it is:** Content shared from other apps — links, PDFs, images, text snippets.

**Examples:**
- "You shared an article about sourdough baking from NYT"
- "You saved a PDF of your apartment lease"
- "You shared a YouTube video about investing for beginners"

**Duration:** Long-term as searchable reference. May become a stronger memory if the user references it in conversation.

**Retrieval:** Semantic search when the user asks about something they shared. Link back to the original source when possible.

---

## 4. What Should Be Remembered

The memory system should actively look for and store:

| Category | Examples |
|---|---|
| **Repeated goals** | "I keep thinking about starting my own business" (mentioned 4 times) |
| **Important life events** | "I'm getting married in June", "My dad passed away last year" |
| **Preferences** | "I'm vegan", "I hate country music", "I love hiking" |
| **Important people** | "My best friend Jake", "My therapist Dr. Chen", "My boss Maria" |
| **Commitments** | "I promised my mom I'd visit next month", "I committed to running 3x/week" |
| **Recurring problems** | "I've been having trouble sleeping again", "My landlord still hasn't fixed the leak" |
| **Meaningful reflections** | "I think I need to set better boundaries", "I realized I was projecting" |
| **Useful imported content** | "This article about meal prep is exactly what I needed" (shared with a note) |
| **Identity statements** | "I'm a first-generation college student", "I grew up in a small town" |
| **Deadlines and dates** | "The application is due March 30th", "My lease ends in August" |

---

## 5. What Should Usually Not Be Remembered

| Category | Examples | Why |
|---|---|---|
| **Filler chat** | "hey", "lol", "ok thanks", "hmm" | No informational content |
| **One-word replies** | "yes", "no", "maybe" | Ambiguous without context |
| **Casual assistant instructions** | "make it shorter", "rewrite that", "add a comma" | Task, not personal info |
| **Low-value temporary details** | "I'm eating a sandwich", "it's raining outside" | Transient, not meaningful |
| **Content with weak personal relevance** | A shared link with no note and no follow-up discussion | User didn't signal importance |
| **Repetitive noise** | Same greeting pattern every day | Adds no new information |
| **Speculative or hypothetical statements** | "I wonder what it's like to live in Japan" | Not a fact or commitment |
| **Meta-conversation about the AI** | "You're being weird today", "Can you talk differently?" | Feedback about the tool, not about the user |

The system should err on the side of **not remembering** when uncertain. It's better to miss a low-value memory than to clutter retrieval with noise.

---

## 6. Memory Importance Scoring

Every memory gets an importance score from 1 to 10. This score determines retrieval priority, decay rate, and context window budget.

### Signals That Increase Importance

| Signal | Impact | Example |
|---|---|---|
| **Repetition** | +2 each time | User mentions wanting to learn Spanish in 3 different conversations |
| **Emotional weight** | +1 to +3 | "I've been feeling really depressed" vs "I'm a bit tired" |
| **Future usefulness** | +1 to +2 | "My interview is next Thursday" — useful for follow-up |
| **Relationship relevance** | +1 | Mentions a specific person by name with context |
| **User emphasis** | +2 to +3 | "This is really important to me", "Please remember this" |
| **Explicit save intent** | +3 | User shares content with a note, or says "save this" |
| **Deadline attached** | +2 | "I need to do this before Friday" |
| **Identity or goal** | +2 | "I'm a vegetarian", "I want to write a book" |
| **Life-changing event** | +3 to +4 | "I'm pregnant", "I got fired", "We broke up" |

### Signals That Lower Importance

| Signal | Impact |
|---|---|
| Short message with no personal content | -2 |
| Generic/hypothetical statement | -2 |
| No follow-up or engagement | -1 |
| Already stored as a fact | -1 (avoid duplication) |
| Content shared without note or discussion | -1 |

### Concrete Examples

| User Input | Score | Reasoning |
|---|---|---|
| "I got engaged last weekend!" | 10 | Life-changing event, high emotional weight |
| "My mom has cancer. We found out yesterday." | 10 | Critical life event, family, emotional |
| "I've been thinking about starting a bakery" | 6 | Goal, first mention, moderate commitment |
| "I've been thinking about starting a bakery" (4th mention) | 9 | Repetition boosted a goal to near-certain |
| "I prefer working at night" | 5 | Preference, stable fact |
| "I had pasta for lunch" | 2 | Low value, transient |
| "hey what's up" | 1 | Zero informational content |
| "Please remember: my daughter's name is Mia and she's 4" | 9 | Explicit save intent, relationship, identity |
| "Check this out" + shared link with no note | 3 | Weak signal, no annotation |
| "This article changed how I think about money" + shared link | 7 | Strong engagement, personal relevance, annotated |

---

## 7. Memory Extraction Rules

For every new message or ingested item, the memory system must determine whether it should be remembered and how.

### Extraction Output

The AI classification step should return:

```json
{
  "shouldRemember": true,
  "memoryType": "goal",
  "summary": "User is considering starting a bakery business",
  "rawText": "I've been really thinking about opening my own bakery...",
  "extractedEntities": ["bakery", "business"],
  "importanceScore": 6,
  "emotionalScore": 3,
  "confidence": 0.85,
  "sourceType": "conversation"
}
```

### Field Definitions

| Field | Type | Description |
|---|---|---|
| `shouldRemember` | boolean | Whether this content should be stored as a memory |
| `memoryType` | enum | `episodic`, `fact`, `goal`, `preference`, `relationship`, `emotion`, `task`, `imported` |
| `summary` | string | 1-2 sentence summary of what to remember |
| `rawText` | string | Original text (for chunking and embedding) |
| `extractedEntities` | string[] | People, places, topics, dates mentioned |
| `importanceScore` | 1-10 | How important this memory is |
| `emotionalScore` | 0-5 | Emotional intensity (0 = neutral, 5 = very intense) |
| `confidence` | 0-1 | How confident the AI is in this classification |
| `sourceType` | enum | `conversation`, `shared_link`, `shared_text`, `shared_pdf`, `shared_image` |

### Examples

**Chat message:** "I just found out I'm going to be a dad"

```json
{
  "shouldRemember": true,
  "memoryType": "episodic",
  "summary": "User found out they are going to be a father",
  "extractedEntities": ["fatherhood", "baby"],
  "importanceScore": 10,
  "emotionalScore": 5,
  "confidence": 0.98,
  "sourceType": "conversation"
}
```

**Chat message:** "Can you make that paragraph shorter?"

```json
{
  "shouldRemember": false,
  "confidence": 0.95,
  "sourceType": "conversation"
}
```

**Shared link:** "https://youtube.com/watch?v=abc123" with note "Great talk about stoicism"

```json
{
  "shouldRemember": true,
  "memoryType": "imported",
  "summary": "User saved a YouTube video about stoicism, described as a 'great talk'",
  "extractedEntities": ["stoicism", "youtube"],
  "importanceScore": 5,
  "emotionalScore": 1,
  "confidence": 0.80,
  "sourceType": "shared_link"
}
```

**Shared PDF:** "lease-agreement-2026.pdf" with note "My new apartment lease"

```json
{
  "shouldRemember": true,
  "memoryType": "imported",
  "summary": "User saved their 2026 apartment lease agreement",
  "extractedEntities": ["apartment", "lease", "2026"],
  "importanceScore": 6,
  "emotionalScore": 0,
  "confidence": 0.90,
  "sourceType": "shared_pdf"
}
```

---

## 8. Long-Term Fact Extraction

Facts are stable truths about the user. They are extracted from episodic memories and stored separately in a structured format for fast retrieval without vector search.

### What Gets Extracted as a Fact

| Fact Type | Examples |
|---|---|
| **Biographical** | Name, age, birthday, location, job, education |
| **Preferences** | Favorite food, music taste, coffee order, sleep schedule |
| **Goals** | Career aspirations, fitness goals, learning goals |
| **Relationships** | Spouse name, children, best friend, therapist |
| **Routines** | Morning routine, workout schedule, weekly calls with mom |
| **Worries** | Recurring financial stress, health concerns |
| **Medical/dietary** | Allergies, dietary restrictions, medications |

### Fact Structure

```json
{
  "category": "preference",
  "subject": "coffee",
  "predicate": "order",
  "value": "oat milk latte, no sugar",
  "confidence": 0.95,
  "sourceMemoryId": "uuid-of-the-memory-that-produced-this",
  "sourceMessageId": "uuid-of-the-original-message",
  "isActive": true,
  "createdAt": "2026-03-10T...",
  "updatedAt": "2026-03-10T..."
}
```

### Fact Confidence

| Confidence Level | When |
|---|---|
| 0.90–1.00 | User directly stated it: "I'm vegan" |
| 0.70–0.89 | Strongly implied: "I always order the salad" |
| 0.50–0.69 | Loosely implied, could be temporary |
| Below 0.50 | Do not store — too speculative |

### Updating Facts

When a new fact conflicts with an existing one:

1. Compare confidence scores
2. If new confidence ≥ old confidence, or the values are different:
   - Mark the old fact as `isActive: false` (preserve history)
   - Insert the new fact as `isActive: true`
3. If new confidence < old confidence and values are the same type:
   - Keep the old fact, discard the new extraction

**Example:**
- Stored: `{ subject: "diet", value: "vegetarian", confidence: 0.85 }`
- New extraction: `{ subject: "diet", value: "vegan", confidence: 0.90 }`
- Result: Old fact deactivated. New fact stored. The user's diet preference is now "vegan."

### Stale Facts

A fact should be reviewed if:
- It was extracted more than 6 months ago and never reinforced
- The user contradicted it (even indirectly)
- Confidence was below 0.80 at creation

Review means: the next time a relevant topic comes up, the AI should gently verify. "Last time we talked, you mentioned you were vegetarian — is that still the case?"

---

## 9. Relationship Memory

People are central to a user's life. FriendAI should maintain a profile for each person the user mentions.

### Person Profile

| Field | Description | Example |
|---|---|---|
| `name` | Person's name | "Sarah" |
| `relationship` | How the user knows them | "sister" |
| `notes` | Accumulated context | "Lives in Portland. Just started a new job at a nonprofit. Considering moving to Austin." |
| `mentionCount` | How often they come up | 14 |
| `lastMentionedAt` | Most recent mention | 2026-03-08 |
| `sentiment` | General tone when discussed | "positive" |
| `topics` | Recurring subjects | ["career", "moving", "family dinners"] |

### Examples

**Mother:**
```
Name: Mom / Linda
Relationship: mother
Notes: User calls her every Sunday. She had knee surgery in January.
  Recovering well. Lives in Ohio. User worries about her living alone.
Sentiment: warm, concerned
Topics: health, family, weekly calls
```

**Close friend:**
```
Name: Jake
Relationship: best friend
Notes: Known since college. Lives in the same city.
  They go hiking together. Jake is going through a divorce.
Sentiment: positive, supportive
Topics: hiking, social plans, Jake's divorce
```

**Difficult coworker:**
```
Name: Mark
Relationship: coworker
Notes: User finds him frustrating. Mark takes credit for others' work.
  User has complained about him 5 times.
Sentiment: negative, frustrated
Topics: work politics, credit-taking, meetings
```

### Merging Mentions

When the user mentions someone:
1. Check if a person profile exists (fuzzy name match)
2. If yes: update notes, increment mention count, update lastMentionedAt
3. If no: create a new profile
4. Always preserve prior notes — append, don't overwrite

---

## 10. Emotional Memory

Emotional data is powerful but dangerous. Used well, it makes the AI feel genuinely caring. Used poorly, it makes the AI feel like a surveillance tool or a manipulative companion.

### What Can Be Stored

- Emotional states the user **explicitly expressed**: "I've been feeling really anxious"
- Emotional patterns observed over multiple conversations: user has mentioned stress about work in 5 of the last 8 conversations
- Emotional associations with topics or people: "User seems happier when discussing music"

### How It Should Be Phrased

The system should store emotional information in **observational, non-diagnostic language**.

| Good (store this) | Bad (never store this) |
|---|---|
| "User has expressed anxiety about finances several times" | "User has an anxiety disorder" |
| "User seemed happy discussing their new dog" | "User uses their dog as emotional support" |
| "User mentioned feeling burned out at work" | "User is experiencing clinical burnout" |
| "User expressed frustration about their landlord" | "User has anger management issues" |

### How Emotion Shapes the AI's Tone

If a user has been expressing sadness or stress recently, the AI should:
- Be gentler and more empathetic
- Ask "how are you doing?" naturally
- Not force positivity or toxic optimism
- Not bring up stressful topics unless the user does

If a user has been expressing excitement or happiness, the AI should:
- Match the energy
- Celebrate with them
- Ask follow-up questions about positive developments

### Guardrails

**Do not overclaim.** Never say "I can tell you've been depressed." Say "You've mentioned feeling down a few times — how are things going?"

**Do not pretend to diagnose.** The AI is not a therapist. It should never label emotions, suggest diagnoses, or recommend medication.

**Do not intensify dependency.** The AI should encourage real-world connections, not position itself as a replacement for human relationships. If a user expresses severe distress, the AI should gently suggest professional support.

**Do not weaponize emotional data.** Emotional memory must never be used to manipulate the user into engagement, purchases, or continued usage.

---

## 11. Memory Decay and Reinforcement

Memories are not permanent by default. They follow a natural lifecycle of creation, reinforcement, decay, and eventual consolidation or deletion.

### Decay Rules

| Condition | Decay Rate | Example |
|---|---|---|
| Low importance (1-3) + never retrieved | -0.5 per month | "User mentioned it was raining" |
| Medium importance (4-6) + not retrieved in 3 months | -0.3 per month | "User tried a new restaurant" |
| High importance (7-10) | No automatic decay | "User is getting married in June" |
| Imported content with no note + never referenced | -0.5 per month | A link shared with no annotation |

When a memory's effective importance drops below 1.0, it becomes eligible for archival (excluded from retrieval but not deleted).

### Reinforcement Rules

| Condition | Boost | Example |
|---|---|---|
| User mentions the same topic again | +1 per mention (max +3) | "I'm still thinking about that bakery idea" |
| Memory is retrieved and used in a response | +0.5 per retrieval | AI mentions a memory, user engages with it |
| User explicitly confirms a memory | +2 | "Yes, that's right, I did say that" |
| User corrects a memory | Reset to corrected value, +1 | "Actually it's my cousin, not my sister" |
| Related fact is extracted | +1 to source memory | A fact about "bakery" reinforces the bakery goal memory |

### Practical Implementation

Run a background job weekly:

1. Query all memory items with `importance < 4` and `lastAccessedAt > 90 days ago`
2. Reduce their importance by the appropriate decay rate
3. Archive any memory whose importance has dropped below 1.0
4. Log all decay actions for debugging

Run reinforcement in real-time:
- When a memory is retrieved for context assembly, update `lastAccessedAt`
- When the extraction pipeline identifies a topic that matches an existing memory, boost that memory's importance

---

## 12. Retrieval Strategy

Retrieval is the most performance-sensitive part of the memory system. It runs synchronously during every chat response.

### Retrieval Layers

When a user sends a message, the system retrieves context from five sources, in parallel:

| Layer | Source | Method | Budget |
|---|---|---|---|
| 1. Recent messages | `messages` table | Direct query, last 20 messages | ~2000 tokens |
| 2. Episodic memories | `memory_chunks` table | pgvector cosine similarity search | ~2000 tokens |
| 3. User facts | `user_facts` table | Keyword match + core facts always included | ~500 tokens |
| 4. People context | `people` table | Name match against user message | ~300 tokens |
| 5. Imported content | `memory_chunks` (source_type = ingestion) | pgvector search (same query) | ~500 tokens |

**Total context budget: ~5000 tokens** for retrieval. This leaves room for the system prompt and the LLM's response within typical context windows.

### Ranking Signals

After gathering candidates from all sources, rank by composite score:

```
score = (0.40 × similarity) + (0.25 × importance) + (0.20 × recency) + (0.10 × confidence) + (0.05 × retrieval_count)
```

| Signal | Weight | Source | Range |
|---|---|---|---|
| **Semantic similarity** | 0.40 | pgvector cosine: `1 - (a <=> b)` | 0.0–1.0 |
| **Importance** | 0.25 | `memory_items.importance` / 10 | 0.0–1.0 |
| **Recency** | 0.20 | `exp(-age_days / 30)` | 0.0–1.0 |
| **Confidence** | 0.10 | `memory_items.confidence` or fact confidence | 0.0–1.0 |
| **Retrieval count** | 0.05 | Normalized access frequency | 0.0–1.0 |

### Cost Efficiency

- Fetch 20 candidates from pgvector, rerank, use top 10
- Do not embed the query if the message is under 5 words and looks like filler ("hey", "thanks", "ok")
- Cache embeddings for identical queries within a session
- User facts are cheap (no embedding needed) — always include high-confidence core facts
- Do not retrieve memories for system messages or tool-use messages

### What Gets Injected Into the Prompt

The final prompt is assembled in this order:

```
1. System prompt (persona + rules)                   ~300 tokens
2. User facts (top 10 by confidence)                  ~500 tokens
3. People context (if names mentioned)                ~300 tokens
4. Retrieved memories (top 5-10 by composite score)   ~2000 tokens
5. Recent conversation messages (last 20)             ~2000 tokens
6. Current user message                               variable
```

The AI must be instructed: "Only reference the provided context. If you don't have information about something, say so."

---

## 13. Memory Consolidation

Over time, many small memories about the same topic should be merged into stronger, consolidated summaries. This is background work that runs periodically.

### What Gets Consolidated

| Pattern | Consolidation Result |
|---|---|
| 5+ memories mentioning "bakery business idea" | Create a theme: "User has a recurring interest in starting a bakery" with timeline |
| 8 conversations mentioning work stress | Create a pattern: "User has expressed work-related stress frequently over the past 2 months" |
| 12 mentions of "Jake" across conversations | Update Jake's person profile with accumulated context |
| 3 shared articles about investing | Create a theme: "User is actively researching personal finance and investing" |

### Consolidation Jobs

Run a weekly background job:

1. **Theme detection:** Group memories by extracted entities and topics. If 3+ memories share a topic cluster, create a consolidated theme memory.

2. **Person profile updates:** For each person mentioned in the last 7 days, regenerate their profile notes from all associated memories.

3. **Fact reinforcement:** For each active fact, count how many memories support it. If a fact has 3+ supporting memories, boost confidence to 0.95+.

4. **Stale cleanup:** Archive consolidated source memories that have been fully absorbed into themes or facts.

### Artifacts Updated

| Artifact | What Changes |
|---|---|
| `memory_items` | New consolidated memory created with higher importance |
| `people` | Notes field updated with latest accumulated context |
| `user_facts` | Confidence boosted for well-supported facts |
| Source memories | Importance reduced once absorbed into consolidation |

---

## 14. Memory From Shared Content

When a user shares content from another app (via the share sheet), the system must decide how to remember it.

### Processing by Content Type

| Content | Processing | Memory Created |
|---|---|---|
| **Link (generic)** | Normalize URL, extract hostname, store metadata. Future: fetch + readability extraction + summarize. | Searchable reference. Promoted to full memory if user discusses it later. |
| **YouTube link** | Extract video ID, store metadata. Future: fetch transcript + summarize. | Searchable reference with video metadata. |
| **PDF** | Store in MinIO, extract text (future). Summarize if text available. | Document memory linked to file. Full text searchable after extraction. |
| **Image** | Store in MinIO. Future: vision model description + OCR. | Image memory with description. Searchable by description content. |
| **Text snippet** | Store raw text. Summarize via AI. Extract facts if applicable. | Full memory with embedding. Fact extraction if personal content. |

### The Note Matters

The user's optional note is the strongest signal of intent:

- **No note:** Low importance (3). User shared it but didn't indicate why. Store as reference.
- **Short note:** Medium importance (5). "Good article" → user found it valuable.
- **Descriptive note:** High importance (7). "This is the contract for my new apartment" → clearly important, should be durable memory.
- **Emotional note:** High importance (7-8). "This video made me cry, it's so beautiful" → emotional weight.

### Imported vs. True Memory

Not all shared content should become a first-class memory. The default path:

1. **Initial state:** Searchable reference. Can be found via semantic search but not proactively surfaced in chat.
2. **Promotion trigger:** If the user references the content in a later conversation ("what was that article about sourdough?"), the memory's importance is boosted and it becomes a regular episodic memory.
3. **Direct promotion:** If the user shared it with a note, treat it as a regular memory from the start.

### Source Linking

Every memory derived from shared content must link back to:
- The `ingested_items` record (for status tracking)
- The `files` record (for MinIO download URL) if applicable
- The original URL if it was a link

This allows the AI to say: "You shared an article from nytimes.com about sourdough. Here's the link: ..."

---

## 15. User Controls and Trust

Trust is not a feature — it's the foundation. If users don't trust the memory system, they won't use it honestly, and the product fails.

### What Users Must Be Able To Do

| Action | Implementation |
|---|---|
| **View all memories** | Memories screen in the app. Scrollable, searchable list of what FriendAI remembers. |
| **View memory details** | Tap a memory to see: summary, raw source text, when it was created, source (conversation or shared content), importance score. |
| **Edit a memory** | Change the summary or correct details. Updated memory gets a confidence boost. |
| **Delete a memory** | Hard delete. Removes the memory item, all associated chunks, and embeddings. Cascading. Irreversible. |
| **View facts** | Separate section showing structured facts: "You told me you're vegan (March 3, 2026)." |
| **Correct a fact** | User can change the value. Old value is archived, new value becomes active with confidence 1.0. |
| **Delete a fact** | Hard delete. |
| **Understand why** | Each memory should have a "source" label: "From your conversation on March 3" or "From a link you shared." |
| **Bulk delete** | "Delete all memories from this conversation" or "Delete everything before [date]." |

### What Users See

The memory should be presented in plain language, not technical format:

**Good:** "You mentioned your daughter Mia is 4 years old (from your conversation on March 5)"
**Bad:** `{ category: "relationship", subject: "Mia", predicate: "age", value: "4" }`

---

## 16. Privacy and Safety

### Core Safety Rules

**Private by default.** All memory data is scoped per user. There is no cross-user memory, no shared knowledge base, no collaborative memory. Each user's memories are completely isolated.

**Delete means delete.** When a user deletes a memory, it is hard-deleted from:
- `memory_items` table
- `memory_chunks` table (and their embeddings)
- Any associated `user_facts` derived from that memory
- Any job queue references

There is no "soft delete" or "30-day recovery" for memory data. Deletion is immediate and permanent.

**Avoid sensitive inference beyond evidence.** The system should not:
- Infer sexual orientation from relationship mentions
- Infer mental health conditions from emotional patterns
- Infer financial status from spending mentions
- Infer political views from casual comments

If the user explicitly states something, it can be stored. But the system should never connect dots to form sensitive conclusions the user didn't make themselves.

**Do not fabricate memories.** The AI's retrieval must be grounded. If a memory is not in the context, the AI must not reference it. This is enforced by the system prompt and should be tested regularly.

**Avoid manipulative emotional language.** The AI should never:
- Use guilt ("I remembered this for you and you forgot?")
- Create artificial urgency ("You'd better act on this before it's too late")
- Leverage emotional data for engagement ("I noticed you're sad — want to talk more?")

**Per-user storage isolation.** Every database query must include `WHERE userId = ?`. There is no scenario where one user's memories should be accessible to another.

---

## 17. Cost-Aware Memory Design

FriendAI is designed to be affordable. Memory processing must be cheap.

### Cost Model

| Operation | Cost Level | When It Happens |
|---|---|---|
| Store a message in PostgreSQL | Very cheap | Every message |
| Classify a message for memory | Moderate (1 LLM call) | Every message (async) |
| Generate embedding (1 chunk) | Cheap (~$0.0001) | Per memory chunk |
| Extract facts (1 LLM call) | Moderate | Only when classification says containsFacts |
| Summarize content (1 LLM call) | Moderate | Only for shared content |
| Retrieve context (1 embedding + 1 SQL query) | Cheap | Every chat message |
| Generate chat response (1 LLM call) | Most expensive | Every chat message |

### Cost-Saving Strategies

**1. Do not embed everything.**
Only embed content that passes the memory classification step (`shouldRemember: true`). Filler messages, one-word replies, and assistant-only messages are never embedded.

**2. Summarize before embedding.**
For long content (articles, PDFs, transcripts), summarize first, then embed the summary. This reduces the number of chunks and embedding calls. The raw text is stored but only the summary is embedded.

**3. Limit context window usage.**
Cap retrieval context at ~5000 tokens. Rank aggressively. 5 highly relevant memories are better than 20 loosely related ones — and 75% cheaper.

**4. Separate cheap from expensive.**
Memory classification, embedding, and fact extraction all happen asynchronously via BullMQ. They do not block the chat response. The only synchronous LLM call is the chat response itself.

**5. Use the cheapest model for classification.**
Memory classification and fact extraction can use a smaller/cheaper model than the chat response model. Classification doesn't need to be creative — it just needs to return structured JSON accurately.

**6. Batch embedding calls.**
When a memory has multiple chunks, batch the embedding API calls rather than making one call per chunk.

**7. Cache query embeddings.**
If the user sends similar messages within a session, reuse the query embedding rather than generating a new one.

### Cost Per User Estimate

For an active user (20 messages/day):
- 20 message classifications (async): ~$0.01
- ~8 memories created (40% classification rate): ~$0.005 embedding
- ~3 fact extractions: ~$0.005
- 20 retrieval queries: ~$0.002 embedding + negligible SQL
- 20 chat responses: ~$0.10-0.30 (this is the dominant cost)

**Monthly per-user cost: ~$3-10** depending on message volume and model pricing.

---

## 18. Suggested Data Model

### MemoryItem

```
memory_items
├── id                  uuid, PK
├── userId              uuid, FK → users
├── sourceType          enum: conversation, ingestion, manual
├── sourceRefId         uuid, nullable (FK to conversation or ingested_item)
├── rawText             text, nullable (original content)
├── summary             text (AI-generated summary)
├── memoryType          enum: episodic, semantic, procedural
├── importanceScore     float (1.0–10.0)
├── emotionalScore      float (0.0–5.0)
├── confidence          float (0.0–1.0)
├── tags                text[] (extracted entities, topics)
├── eventAt             timestamptz, nullable (when the event happened)
├── lastAccessedAt      timestamptz (updated on retrieval)
├── createdAt           timestamptz
└── updatedAt           timestamptz
```

### MemoryChunk

```
memory_chunks
├── id                  uuid, PK
├── memoryItemId        uuid, FK → memory_items
├── userId              uuid (denormalized)
├── content             text (chunk text)
├── embedding           vector(1536)
├── chunkIndex          integer
├── tokenCount          integer
└── createdAt           timestamptz
```

### UserFact

```
user_facts
├── id                  uuid, PK
├── userId              uuid, FK → users
├── category            enum: preference, goal, relationship, event, emotion, biographical, opinion, routine
├── subject             varchar (what the fact is about)
├── predicate           varchar, nullable (relationship/attribute)
├── value               text (the fact itself)
├── confidence          float (0.0–1.0)
├── sourceMemoryId      uuid, nullable (FK → memory_items)
├── sourceMessageId     uuid, nullable (FK → messages)
├── isActive            boolean (false = superseded)
├── createdAt           timestamptz
└── updatedAt           timestamptz
```

### Person

```
people
├── id                  uuid, PK
├── userId              uuid, FK → users
├── name                varchar
├── relationship        varchar (sister, coworker, friend, etc.)
├── notes               text (accumulated context)
├── sentiment           varchar, nullable (positive, negative, mixed, neutral)
├── topics              text[] (recurring subjects)
├── mentionCount        integer
├── lastMentionedAt     timestamptz
├── createdAt           timestamptz
└── updatedAt           timestamptz
```

### IngestedItem

```
ingested_items
├── id                  uuid, PK
├── userId              uuid, FK → users
├── sourceType          enum: link, youtube, text_share, pdf, image, file_upload
├── status              enum: pending, processing, completed, failed
├── url                 text, nullable
├── note                text, nullable
├── title               varchar, nullable
├── rawText             text, nullable
├── processedContent    text, nullable
├── fileId              uuid, nullable (FK → files)
├── metadataJson        jsonb, nullable
├── createdAt           timestamptz
└── updatedAt           timestamptz
```

---

## 19. Example Memory Classification Table

| # | User Input | Remember? | Memory Type | Score | Reason |
|---|---|---|---|---|---|
| 1 | "I got engaged last weekend!" | Yes | episodic | 10 | Life-changing event |
| 2 | "My mom was just diagnosed with diabetes" | Yes | episodic | 10 | Critical family health event |
| 3 | "I've been thinking about quitting my job" | Yes | goal | 7 | Career decision, significant |
| 4 | "Please remember: I'm allergic to shellfish" | Yes | fact | 9 | Explicit save intent, medical |
| 5 | "My best friend Jake is getting divorced" | Yes | relationship | 8 | Key person, major life event |
| 6 | "I just finished reading Atomic Habits" | Yes | episodic | 5 | Cultural interest, moderate value |
| 7 | "I prefer working at night" | Yes | preference | 5 | Stable preference |
| 8 | "I've been feeling really burned out at work" | Yes | emotion | 7 | Emotional state, recurring if repeated |
| 9 | "I need to submit my taxes before April 15th" | Yes | task | 7 | Deadline, actionable |
| 10 | "hey" | No | — | 1 | No content |
| 11 | "Can you rewrite that paragraph?" | No | — | 1 | Assistant instruction, not personal |
| 12 | "I had a sandwich for lunch" | No | — | 2 | Transient, low value |
| 13 | "lol that's funny" | No | — | 1 | Reaction, no factual content |
| 14 | "I wonder what living in Japan is like" | No | — | 2 | Hypothetical, not a commitment |
| 15 | [Shared link with note: "This article changed how I think about money"] | Yes | imported | 7 | Annotated, personal relevance |
| 16 | [Shared link with no note, no follow-up] | Marginal | imported | 3 | Weak signal, store as reference only |
| 17 | "My daughter's first day of school is next Monday" | Yes | episodic | 8 | Family milestone, date |
| 18 | "I've been meditating every morning for a month" | Yes | routine | 6 | Routine, commitment, identity |
| 19 | "I think remote work is way better than office" | Yes | preference | 5 | Opinion, stable preference |
| 20 | "ok thanks" | No | — | 1 | Filler |

---

## 20. Example Retrieval Scenarios

### Scenario 1: "What do you remember about my business ideas?"

**Retrieved:**
- Episodic memories containing "business", "bakery", "startup" (vector search)
- User facts with category = goal, subject matching business-related keywords
- Shared links tagged with entrepreneurship topics

**AI response should reference:** The bakery idea (mentioned 4 times), the article about small business loans they shared, and the note about wanting to be their own boss.

---

### Scenario 2: "Did I ever mention my sister's birthday?"

**Retrieved:**
- Person profile for "sister" (name, relationship notes)
- User facts with subject matching sister's name
- Episodic memories mentioning sister + birthday

**If found:** "Yes! You mentioned your sister Sarah's birthday is in October. You were thinking about what to get her."
**If not found:** "I don't have a record of you mentioning her birthday. Do you want to tell me so I can remember?"

---

### Scenario 3: "What was that PDF I shared about contracts?"

**Retrieved:**
- Ingested items with source_type = pdf, keywords matching "contract"
- Memory items with source_type = ingestion, tags including "contract" or "pdf"

**AI response:** "You shared a PDF called 'lease-agreement-2026.pdf' on March 5th. You noted it was your new apartment lease."

---

### Scenario 4: "How have I been feeling about work lately?"

**Retrieved:**
- Emotional memories related to "work" (vector search)
- User facts with category = emotion, subject matching work
- Recent messages mentioning work

**AI response:** "Over the last few weeks, you've mentioned feeling burned out at work a couple of times. You also talked about your coworker Mark being frustrating. How are things going now?"

---

### Scenario 5: "What do you know about Mark?"

**Retrieved:**
- Person profile for "Mark"
- All memories tagged with "Mark" entity

**AI response:** "Mark is your coworker. You've mentioned him a few times — it sounds like he can be frustrating to work with, especially when it comes to taking credit for group projects."

---

### Scenario 6: "I'm thinking about getting a dog"

**Retrieved:**
- Any previous mentions of dogs or pets (vector search)
- User facts about living situation (apartment, house)
- Preferences related to animals

**If previous context exists:** "That's exciting! Last month you mentioned your new apartment allows pets. Have you thought about what breed?"

---

### Scenario 7: "What articles have I saved about investing?"

**Retrieved:**
- Ingested items with source_type = link or youtube, topics matching "investing", "finance", "money"
- Shared content memories with financial keywords

**AI response:** Lists saved articles with titles, sources, dates, and any notes the user added.

---

### Scenario 8: "Am I making progress on my marathon training?"

**Retrieved:**
- Goal memory: "User wants to run a marathon"
- Episodic memories mentioning running, training, distance
- Task memories about workout schedule

**AI response:** References timeline of training mentions, last reported mileage, and any setbacks mentioned.

---

### Scenario 9: "What did I tell you about my mom's surgery?"

**Retrieved:**
- Person profile for "Mom" / "Linda"
- Episodic memories mentioning mom + surgery
- User facts about mom's health

**AI response:** "You told me your mom had knee surgery in January and was recovering well. You were worried about her living alone."

---

### Scenario 10: "Remind me what my goals are right now"

**Retrieved:**
- All user facts with category = goal
- Goal-type memory items sorted by importance and recency

**AI response:** Lists active goals: "Based on what you've told me: (1) You want to start a bakery, (2) You're training for a marathon, (3) You're saving to move to Austin, (4) You want to learn guitar."

---

## 21. Engineering Recommendations

### Architecture

- **Memory extraction runs asynchronously.** After every chat response, enqueue a `memory-processing` job. Never block the response to classify or embed.
- **Embeddings live on chunks, not items.** A memory item may have multiple chunks. Each chunk has its own embedding. Retrieval queries `memory_chunks`, not `memory_items`.
- **Facts are a separate table.** Do not try to store facts inside memory items. Facts have their own lifecycle (confidence, supersession, staleness).
- **Retrieval combines vectors + metadata.** pgvector gets you candidates. Reranking with importance, recency, and confidence picks the winners.

### Observability

- **Log every classification decision.** When the system decides not to remember something, log why. This is essential for tuning.
- **Track retrieval quality.** For each chat response, record which memories were retrieved, their scores, and whether the AI actually referenced them in the response.
- **Monitor queue depths.** Memory processing, embedding generation, and fact extraction queues should have alerting for backlogs.
- **Dashboard for per-user memory stats.** Total memories, facts, people profiles, average importance, most-retrieved memories.

### Testing

- **Golden set of classification examples.** Maintain a test set of 100+ messages with expected `shouldRemember` and `importanceScore` values. Run regression tests when the classification prompt changes.
- **Retrieval relevance testing.** For a set of test queries, verify that the expected memories appear in the top 5 results.
- **Anti-hallucination tests.** Feed the AI prompts that tempt it to fabricate memories ("What did I tell you about my trip to Mars?"). Verify it responds honestly.

### Performance

- **Index `memory_chunks.embedding`** with IVFFlat or HNSW once the table exceeds 1000 rows.
- **Denormalize `userId` on `memory_chunks`** so vector search doesn't require a join for the WHERE clause.
- **Cache user facts.** Core facts for a user change infrequently. Cache them in Redis with a 5-minute TTL.
- **Connection pooling.** pgvector queries can be heavy. Use connection pooling and monitor query times.

---

## 22. MVP Recommendation

### V1 — Ship This First

| Feature | Scope |
|---|---|
| **Chat memory extraction** | Classify every message exchange. Create memory items for memorable ones. |
| **Basic fact extraction** | Extract preferences, goals, relationships, biographical facts. Upsert into user_facts. |
| **Embedding generation** | Chunk and embed memory summaries. Store in memory_chunks with pgvector. |
| **Memory retrieval** | Cosine similarity search + fact lookup + recent messages. Composite reranking. |
| **Shared content ingestion** | Accept links, text, and file uploads. Store metadata. Create basic memory from note + metadata. |
| **Memory browsing** | Mobile screen listing memories with search. |
| **Basic person tracking** | Create/update person profiles from relationship mentions. |
| **Health check** | GET /health with postgres, redis, minio status. |

### V2 — Next Quarter

| Feature | Scope |
|---|---|
| **Full link scraping** | Readability extraction for article content. YouTube transcript fetching. |
| **PDF text extraction** | pdf-parse integration. Chunk and embed extracted text. |
| **Image description** | Vision model integration for uploaded images. |
| **Memory consolidation** | Weekly background job to merge repeated themes and update person profiles. |
| **Memory decay** | Automated importance decay for low-value, unaccessed memories. |
| **Fact staleness review** | Proactively verify old facts in conversation. |
| **Memory editing** | User can edit memory summaries and fact values from the app. |
| **Bulk memory deletion** | Delete all memories from a conversation or before a date. |

### V3 — Future

| Feature | Scope |
|---|---|
| **Voice/audio ingestion** | Accept voice memos, transcribe, extract memory. |
| **Proactive memory surfacing** | AI brings up relevant memories without being asked. |
| **Emotional pattern tracking** | Detect recurring emotional themes and adjust tone. |
| **Memory timeline** | Visual timeline of life events and milestones. |
| **Cross-device sync** | Memory accessible from multiple devices. |
| **Export memories** | User can download all their memory data as JSON/PDF. |
| **Task/reminder system** | Time-based follow-ups from task memories. |

### What V1 Does Not Include

- No full-text extraction from PDFs or images (just metadata + note)
- No proactive memory surfacing (only retrieved when relevant to query)
- No memory decay or consolidation (memories are permanent in V1)
- No emotional scoring (stored but not used for tone adjustment)
- No voice/audio support
- No memory editing from the app (backend only)

This keeps V1 scoped to the core loop: **chat → extract → embed → retrieve → respond with context.** Everything else layers on top.

---

## Related Docs

- [01 — API Architecture](./01-api-architecture.md) — System architecture, database schema, and processing flows
- [02 — Backend Blueprint](./02-backend-blueprint.md) — MemoriesModule, FactsModule, PeopleModule, and RetrievalModule code
- [04 — RAG Pipeline](./04-rag-pipeline.md) — Technical implementation of memory extraction, embedding, and retrieval
- [05 — Ingestion Architecture](./05-ingestion-architecture.md) — How shared content becomes searchable memory
- [06 — Mobile Architecture](./06-mobile-architecture.md) — Memories screen and user controls in the mobile client
