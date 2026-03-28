---
task: summarization
name: Summarization
---

# Summarization

## Recommended Providers (ranked)

1. **Google** (Gemini 2.5 Flash) — 1M context, fast, cheapest for bulk processing
2. **Anthropic** (Claude Sonnet 4) — Best at preserving nuance and structure
3. **Mistral** (Mistral Small) — Very cheap, handles routine summarization well
4. **Cohere** (Command R) — Built-in citation support, good for grounded summaries

## Temperature Recommendations

| Scenario | Temperature | Notes |
|----------|-------------|-------|
| Factual summary | 0.0 - 0.1 | Accuracy first |
| Executive brief | 0.2 - 0.3 | Slight rephrasing for readability |
| Creative condensation | 0.4 - 0.6 | Allow stylistic choices |
| Meeting notes | 0.1 - 0.2 | Stick to what was said |

## Cost Comparison (summarizing 50K input tokens to ~2K output)

| Provider | Model | Cost per call |
|----------|-------|---------------|
| Google | Gemini 2.5 Flash | ~$0.009 |
| Mistral | Small | ~$0.006 |
| Cohere | Command R | ~$0.009 |
| Anthropic | Sonnet 4 | ~$0.18 |
| OpenAI | GPT-4.1 mini | ~$0.023 |

## Known Quirks
- Gemini's 1M context means you can summarize entire codebases in one call
- Claude preserves subtle distinctions but costs 20x more than Flash for bulk work
- Cohere's citation mode returns source references — ideal for auditable summaries
- For incremental summarization (streaming docs), use map-reduce with a cheap model
- Mistral Small handles 80% of summarization tasks at near-zero cost
