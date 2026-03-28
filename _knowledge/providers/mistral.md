---
provider: mistral
name: Mistral AI
api_base: https://api.mistral.ai/v1
auth: Bearer token
---

# Mistral AI

## API Quirks
- OpenAI-compatible API (drop-in for most clients)
- Tool calling follows OpenAI format but parallel calls can be flaky
- JSON mode requires explicit `response_format: { type: "json_object" }`
- Codestral uses a separate endpoint: `codestral.mistral.ai`
- Streaming responses may send empty content deltas — filter them

## Model Selection Guide

| Model | Context | Speed | Best For |
|-------|---------|-------|----------|
| Mistral Large | 128K | Medium | Complex tasks, multilingual, reasoning |
| Mistral Medium | 128K | Medium-Fast | Balanced general purpose |
| Mistral Small | 128K | Fast | Everyday tasks, classification |
| Codestral | 256K | Fast | Code generation and completion |
| Devstral Small | 128K | Fast | Agentic coding, tool use |

## Pricing (per 1M tokens, USD)

| Model | Input | Output |
|-------|-------|--------|
| Large | $2.00 | $6.00 |
| Medium | $0.40 | $2.00 |
| Small | $0.10 | $0.30 |
| Codestral | $0.30 | $0.90 |
| Devstral Small | $0.10 | $0.30 |

Batch API: 50% discount. Free tier on la Plateforme for small models.

## Tips
- Codestral is best-in-class for fill-in-the-middle code completion
- Devstral Small punches above its weight for agentic coding tasks
- EU data residency by default (Paris) — good for GDPR-sensitive workloads
- Mistral Small is exceptionally cheap and handles most routine tasks
- Function calling works but test thoroughly — edge cases with complex schemas
