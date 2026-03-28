---
provider: meta-llama
name: Meta Llama
api_base: https://api.llama.com/v1
auth: Bearer token
---

# Meta Llama

## API Quirks
- Official API at llama.com; also available via every major cloud provider
- Llama 4 is MoE architecture — Maverick (17Bx128E), Scout (17Bx16E)
- OpenAI-compatible chat completions endpoint
- Tool calling supported but less battle-tested than Anthropic/OpenAI
- Open-weight: can self-host via Ollama, vLLM, TGI, or cloud endpoints

## Model Selection Guide

| Model | Architecture | Speed | Best For |
|-------|-------------|-------|----------|
| Llama 4 Maverick | MoE 17Bx128E | Medium | Flagship: multilingual, code, reasoning |
| Llama 4 Scout | MoE 17Bx16E | Fast | 10M context, lightweight tasks |
| Llama 3.3 70B | Dense 70B | Medium | Proven workhorse, wide ecosystem |

## Pricing (per 1M tokens, USD)

| Model | Input | Output |
|-------|-------|--------|
| Llama 4 Maverick | $0.20 | $0.35 |
| Llama 4 Scout | $0.15 | $0.25 |
| Llama 3.3 70B | $0.20 | $0.20 |

Prices via llama.com API. Self-hosted = free (compute cost only).
Available free on Groq, Together, Fireworks with rate limits.

## Tips
- Maverick is the best open-weight model for multilingual tasks
- Scout's 10M context window is unmatched — ideal for massive document ingestion
- Self-hosting on Ollama eliminates API costs for development
- Available on every inference provider — compare prices, they vary 3-5x
- Community fine-tunes on HuggingFace extend capabilities (coding, medical, legal)
