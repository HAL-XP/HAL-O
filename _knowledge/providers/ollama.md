---
provider: ollama
name: Ollama (Local)
api_base: http://localhost:11434
auth: none
---

# Ollama

## API Quirks
- No auth required — runs locally on port 11434
- OpenAI-compatible endpoint at `/v1/chat/completions` (enable with OLLAMA_ORIGINS)
- Native endpoint at `/api/chat` has different streaming format
- Models must be pulled first: `ollama pull llama3.3:70b`
- VRAM is the bottleneck — quantization level determines what fits

## Model Selection Guide

| Model | VRAM Needed | Speed | Best For |
|-------|-------------|-------|----------|
| llama3.3:70b | 40GB+ | Slow | Best local general-purpose |
| qwen3:32b | 20GB | Medium | Strong reasoning, multilingual |
| devstral:24b | 16GB | Medium | Agentic coding, tool use |
| gemma3:27b | 18GB | Medium | Balanced quality/speed |
| phi-4:14b | 10GB | Fast | Good for 16GB GPUs |
| deepseek-r1:32b | 20GB | Slow | Chain-of-thought reasoning |

## Pricing

Free. Your electricity bill is the only cost. RTX 5090 (32GB) can run 32B models
at full precision or 70B models at Q4 quantization.

## Tips
- Set `OLLAMA_NUM_PARALLEL=2` for concurrent requests (needs more VRAM)
- Use Q4_K_M quantization for best quality-per-VRAM ratio
- Keep-alive default is 5min; set `OLLAMA_KEEP_ALIVE=-1` to keep models loaded
- GPU offloading is automatic but check `ollama ps` to verify layers on GPU
- For RTX 5090: 70B Q4 fits comfortably, 32B models run at full Q8 precision
