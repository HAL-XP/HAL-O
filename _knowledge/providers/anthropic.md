---
provider: anthropic
name: Anthropic
api_base: https://api.anthropic.com/v1
auth: x-api-key header
---

# Anthropic

## API Quirks
- Auth uses `x-api-key` header, not Bearer token
- Streaming uses SSE with `event: content_block_delta` — not OpenAI-compatible
- System prompt is a top-level field, not a message role
- Tool use returns `tool_use` content blocks; tool results go in `tool_result` role
- Max output tokens must be explicitly set (no default fill-to-max)

## Model Selection Guide

| Model | Context | Speed | Best For |
|-------|---------|-------|----------|
| Claude Opus 4 | 200K | Slow | Complex reasoning, architecture, long-form analysis |
| Claude Sonnet 4 | 200K | Medium | Best all-rounder: code, reasoning, writing |
| Claude Haiku 3.5 | 200K | Fast | Quick tasks, classification, extraction |

## Pricing (per 1M tokens, USD)

| Model | Input | Output |
|-------|-------|--------|
| Opus 4 | $15.00 | $75.00 |
| Sonnet 4 | $3.00 | $15.00 |
| Haiku 3.5 | $0.80 | $4.00 |

Extended thinking multiplies output cost. Prompt caching: 90% discount on cache hits.

## Tips
- Use prompt caching for repeated system prompts (5min TTL, auto-extend on hit)
- Sonnet 4 is the sweet spot for most tasks — Opus only for truly hard problems
- Extended thinking on Sonnet 4 gives Opus-tier reasoning at 1/5 the cost
- Batch API gives 50% discount with 24h turnaround
- Token counting endpoint available for pre-flight cost estimation
