---
task: reasoning
name: Complex Reasoning
---

# Complex Reasoning

## Recommended Providers (ranked)

1. **Anthropic** (Claude Opus 4 / Sonnet 4 Extended Thinking) — Strongest at multi-step logic
2. **OpenAI** (o3 / o4-mini) — Purpose-built reasoning models with internal chain-of-thought
3. **Google** (Gemini 2.5 Pro) — Thinking mode enables explicit reasoning chains

## Temperature Recommendations

| Scenario | Temperature | Notes |
|----------|-------------|-------|
| Math / logic problems | 0.0 | Deterministic for consistency |
| Architecture decisions | 0.2 - 0.4 | Allow some creative exploration |
| Debate / multi-perspective | 0.5 - 0.7 | Diverse viewpoints |
| Brainstorming | 0.8 - 1.0 | Maximum creativity |

Note: o3/o4-mini ignore temperature (reasoning is internal). Extended thinking budget
controls effort instead.

## Cost Comparison (complex reasoning: ~5K input, ~3K output)

| Provider | Model | Cost per call |
|----------|-------|---------------|
| Anthropic | Opus 4 | ~$0.30 |
| Anthropic | Sonnet 4 (extended) | ~$0.08 |
| OpenAI | o3 | ~$0.17 |
| OpenAI | o4-mini | ~$0.02 |
| Google | Gemini 2.5 Pro | ~$0.04 |

## Known Quirks
- o3 is the raw reasoning champion but 5-10x slower than alternatives
- Sonnet 4 with extended thinking is the best cost/reasoning tradeoff
- o4-mini is surprisingly strong — 90% of o3 quality at 10% of the cost
- Gemini 2.5 Pro thinking mode is competitive and cheaper than Anthropic
- For debates: rotate providers to get genuinely different reasoning patterns
- Local models (deepseek-r1) can reason but hallucinate more on edge cases
