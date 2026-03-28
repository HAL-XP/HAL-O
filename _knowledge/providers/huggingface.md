---
provider: huggingface
name: Hugging Face Inference
api_base: https://router.huggingface.co/v1
auth: Bearer token (HF_TOKEN)
---

# Hugging Face

## API Quirks
- OpenAI-compatible chat endpoint via Inference Router
- Free tier: rate-limited, queued, no SLA — fine for dev/testing
- PRO subscription ($9/mo) unlocks dedicated endpoints and higher limits
- Model IDs use org/model format: `meta-llama/Llama-4-Maverick-17B-128E-Instruct`
- Some models require accepting a license agreement on the Hub first

## Model Selection Guide

| Model | Type | Speed | Best For |
|-------|------|-------|----------|
| Llama 4 Maverick | MoE 17Bx128E | Medium | General-purpose, multilingual |
| Qwen3 235B-A22B | MoE 235B | Slow | Complex reasoning (22B active) |
| Devstral Small | Dense 24B | Fast | Agentic coding tasks |
| Phi-4 | Dense 14B | Fast | Lightweight inference |

## Pricing (per 1M tokens, USD)

| Tier | Cost |
|------|------|
| Free Inference API | $0 (rate-limited, queued) |
| PRO ($9/mo) | $0 for most models, usage-based for large |
| Dedicated Endpoints | $0.60-6.00/hr depending on GPU |

Pricing varies by model and demand. Check hub model card for current rates.

## Tips
- The free tier is unbeatable for prototyping and model comparison
- Use `huggingface_hub` Python client for programmatic model discovery
- Dedicated endpoints give you a private replica — predictable latency
- MoE models (Maverick, Qwen3) are cost-efficient: only active params bill
- Embed models (BGE, E5) available via the same API for RAG pipelines
