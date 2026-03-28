---
task: code-generation
name: Code Generation
---

# Code Generation

## Recommended Providers (ranked)

1. **Anthropic** (Claude Sonnet 4) — Best instruction following, understands complex codebases
2. **OpenAI** (GPT-4.1) — 1M context, excellent for large repos and multi-file edits
3. **Google** (Gemini 2.5 Pro) — Strong reasoning, 1M context, competitive pricing
4. **Mistral** (Codestral) — Purpose-built for code, fill-in-the-middle support

## Temperature Recommendations

| Scenario | Temperature | Notes |
|----------|-------------|-------|
| Bug fixes, refactoring | 0.0 - 0.2 | Deterministic, focused |
| Feature implementation | 0.3 - 0.5 | Slight creativity for design choices |
| Prototyping, exploration | 0.6 - 0.8 | More varied approaches |
| Code review / analysis | 0.0 | Consistency matters |

## Cost Comparison (generating ~2K output tokens from 10K input)

| Provider | Model | Cost per call |
|----------|-------|---------------|
| Anthropic | Sonnet 4 | ~$0.06 |
| OpenAI | GPT-4.1 | ~$0.04 |
| Google | Gemini 2.5 Flash | ~$0.003 |
| Mistral | Codestral | ~$0.005 |
| Ollama | Any | $0 (local) |

## Known Quirks
- Claude excels at understanding project conventions but can over-engineer simple tasks
- GPT-4.1 is best at following exact formatting instructions
- Gemini 2.5 Flash is the cost/quality sweet spot for routine code generation
- Codestral handles fill-in-the-middle completion (cursor-style) natively
- Local models (Ollama) have no rate limits but quality drops for complex architecture
