---
provider: gemini
name: Google Gemini
api_base: https://generativelanguage.googleapis.com/v1beta
auth: API key (query param or header)
---

# Google Gemini

## API Quirks
- Auth can be query param `?key=` or `x-goog-api-key` header
- Native multimodal — images, audio, video, PDF inline in the request
- Safety filters can silently block responses; set thresholds to BLOCK_NONE for dev
- Grounding with Google Search available as a tool declaration
- Context caching for repeated prefixes (min 32K tokens to cache)

## Model Selection Guide

| Model | Context | Speed | Best For |
|-------|---------|-------|----------|
| Gemini 2.5 Pro | 1M | Medium | Reasoning, code, multimodal analysis |
| Gemini 2.5 Flash | 1M | Fast | Balanced speed/quality, thinking optional |
| Gemini 2.0 Flash Lite | 1M | Very Fast | High-volume, cost-sensitive workloads |

## Pricing (per 1M tokens, USD)

| Model | Input | Output |
|-------|-------|--------|
| 2.5 Pro | $1.25 / $2.50* | $10.00 / $15.00* |
| 2.5 Flash | $0.15 / $0.30* | $0.60 / $3.50* |
| 2.0 Flash Lite | $0.075 | $0.30 |

*Higher price above 200K context. Thinking tokens billed at output rate.

## Tips
- 1M context window is the largest available — ideal for huge codebases
- 2.5 Flash with thinking enabled rivals Pro for most coding tasks at 1/8 cost
- Free tier generous: 15 RPM on Pro, 30 RPM on Flash (great for prototyping)
- Use context caching for system prompts over 32K tokens (60% savings)
- Native PDF/image understanding eliminates OCR preprocessing
