---
task: cheap-inference
name: Cheap / Bulk Inference
---

# Cheap Inference

## Recommended Providers (ranked)

1. **Ollama** (local) — Zero marginal cost, no rate limits, full privacy
2. **Google** (Gemini 2.0 Flash Lite) — $0.075/$0.30 per 1M tokens
3. **OpenAI** (GPT-4.1 nano) — $0.10/$0.40 per 1M tokens, surprisingly capable
4. **Mistral** (Mistral Small) — $0.10/$0.30, EU-hosted, OpenAI-compatible
5. **Hugging Face** (free tier) — $0 with rate limits, good for prototyping

## Temperature Recommendations

| Scenario | Temperature | Notes |
|----------|-------------|-------|
| Classification / routing | 0.0 | Deterministic labels |
| Data extraction | 0.0 - 0.1 | Accuracy over variety |
| Bulk content generation | 0.5 - 0.7 | Diversity in outputs |
| Synthetic data | 0.8 - 1.0 | Maximum variation |

## Cost Comparison (1M tokens in, 200K tokens out — bulk job)

| Provider | Model | Total Cost |
|----------|-------|------------|
| Ollama | phi-4:14b | $0 |
| Google | Flash Lite | ~$0.14 |
| OpenAI | nano | ~$0.18 |
| Mistral | Small | ~$0.16 |
| HuggingFace | Free tier | $0 (rate-limited) |
| OpenAI | GPT-4.1 mini | ~$0.72 |

## Known Quirks
- Ollama has zero cost but throughput depends on your GPU (RTX 5090: ~60 tok/s for 32B)
- GPT-4.1 nano is the cheapest cloud option with reliable structured output
- Flash Lite has 1M context — can process huge documents cheaply
- Batch APIs (OpenAI, Anthropic) give 50% off with 24h turnaround for non-urgent work
- Free HuggingFace tier queues during peak hours — not for production
- For routing/classification: nano or Small are as accurate as frontier models
