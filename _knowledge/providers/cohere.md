---
provider: cohere
name: Cohere
api_base: https://api.cohere.com/v2
auth: Bearer token
---

# Cohere

## API Quirks
- v2 API uses OpenAI-compatible chat format; v1 used custom format (deprecated)
- RAG is a first-class citizen: `documents` parameter for grounded generation
- Embeddings (Embed v4) are best-in-class for enterprise retrieval
- Rerank API separate from chat — dedicated endpoint for search reranking
- Streaming uses SSE with `event: text-generation` for content chunks

## Model Selection Guide

| Model | Context | Speed | Best For |
|-------|---------|-------|----------|
| Command A | 256K | Medium | Flagship: agentic, RAG, enterprise |
| Command R+ | 128K | Medium | Strong RAG and multilingual |
| Command R | 128K | Fast | Cost-effective general tasks |
| Embed v4 | 512 tokens | Fast | Embeddings for search and RAG |

## Pricing (per 1M tokens, USD)

| Model | Input | Output |
|-------|-------|--------|
| Command A | $2.50 | $10.00 |
| Command R+ | $2.50 | $10.00 |
| Command R | $0.15 | $0.60 |
| Embed v4 | $0.10 | N/A |

Free tier: 1K API calls/month for Command R, 100/month for Command A.

## Tips
- Best-in-class for RAG: built-in citation support with source attribution
- Embed v4 supports 128 languages and has state-of-the-art retrieval accuracy
- Rerank endpoint improves any search pipeline with minimal integration effort
- Enterprise-focused: SOC 2, data privacy guarantees, on-premise available
- Multilingual strength: 100+ languages with consistent quality
