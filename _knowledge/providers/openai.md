---
provider: openai
name: OpenAI
api_base: https://api.openai.com/v1
auth: Bearer token
---

# OpenAI

## API Quirks
- Streaming uses `data: [DONE]` sentinel — handle it or your parser hangs
- Function calling and tool_choice are separate from Anthropic's tool_use
- o3/o4-mini reasoning models use internal chain-of-thought (no streaming of reasoning)
- Rate limits vary wildly by tier (Tier 1 = 500 RPM, Tier 5 = 10K RPM)
- Response format `json_object` requires "JSON" in the prompt or it 400s

## Model Selection Guide

| Model | Context | Speed | Best For |
|-------|---------|-------|----------|
| o3 | 200K | Slow | Hardest reasoning, math, competition-level code |
| o4-mini | 200K | Medium | Strong reasoning at 1/10 o3 cost |
| GPT-4.1 | 1M | Medium | Instruction following, long-context, coding |
| GPT-4.1 mini | 1M | Fast | Everyday tasks, good cost/performance ratio |
| GPT-4.1 nano | 1M | Very Fast | Classification, extraction, bulk processing |

## Pricing (per 1M tokens, USD)

| Model | Input | Output |
|-------|-------|--------|
| o3 | $10.00 | $40.00 |
| o4-mini | $1.10 | $4.40 |
| GPT-4.1 | $2.00 | $8.00 |
| GPT-4.1 mini | $0.40 | $1.60 |
| GPT-4.1 nano | $0.10 | $0.40 |

Cached input: 50-75% discount. Batch API: 50% discount.

## Tips
- GPT-4.1 has 1M context and excels at instruction following — best for agents
- o4-mini is the reasoning sweet spot; use o3 only for competition-level problems
- Use structured outputs (response_format with json_schema) for reliable parsing
- Predicted outputs can cut latency by 2-4x for code editing tasks
- nano is absurdly cheap for classification and routing tasks
