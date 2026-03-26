# HAL-O Model Routing — Implementation Plan

> Prepared autonomously. Items marked [NEEDS USER] require a decision before proceeding.

## Phase 1: Model Router Core (can do now)

### 1.1 Provider Interfaces
File: `src/main/model-providers.ts`
- `LLMProvider` interface: `chat(messages, options) → string`
- `OllamaProvider`: HTTP client to localhost:11434
- `ClaudeProvider`: wrapper around existing Claude Code terminal IPC
- `OpenAIProvider`: generic OpenAI-compatible HTTP client
- `isAvailable()` health check per provider

### 1.2 Router Config
File: `src/main/model-router.ts`
- Role → provider mapping loaded from settings
- 5 roles: dispatcher, coder, assistant, qa, voiceRewrite
- Default preset: hybrid (local dispatcher + Claude coder + Haiku assistant)

### 1.3 Settings State
File: update `src/renderer/src/hooks/useSettings.ts`
- Add `modelRouting` section to settings state
- localStorage persistence
- 4 presets: fullLocal, claudeOnly, hybrid, budget

## Phase 2: Dispatcher Sidecar (can do now)

### 2.1 BGE-M3 Embedding Service
File: `_scripts/embed_service.py`
- FastAPI/Flask server on port 8098
- Load BGE-M3 model on startup
- Endpoint: POST /classify → { target, confidence }
- Pre-encoded utterance bank (100 examples)

### 2.2 Qwen3 Classification
- Ollama API at localhost:11434
- Structured JSON output prompt
- Fallback if Ollama not running

### 2.3 5-Layer Pipeline
File: `src/main/dispatcher.ts`
- Layer 0: regex prefix detection
- Layer 1: voice command regex
- Layer 2: context stickiness (session map)
- Layer 3: HTTP call to embed service
- Layer 4: HTTP call to Ollama
- Layer 5: return "ambiguous" → UI shows picker

## Phase 3: Settings UI (can do now)

### 3.1 Model Routing Tab
File: update `src/renderer/src/components/SettingsMenu.tsx`
- New tab: "MODELS" with icon
- Dropdown per role (dispatcher, coder, assistant, qa, voice)
- Provider status indicators (green/red dots)
- Preset buttons (Full Local, Hybrid, Claude Only, Budget)

### 3.2 Provider Configuration
- Ollama URL input (default localhost:11434)
- Claude API key status (read from credentials)
- OpenAI-compatible endpoint + key inputs
- "Test Connection" button per provider

## Phase 4: Wizard Model Detection (can do now)

### 4.1 New Wizard Step
File: update setup wizard flow
- Detect: is Ollama installed? (`ollama --version`)
- Detect: is a model pulled? (`ollama list`)
- Detect: Claude API key configured?
- Detect: any OpenAI-compatible endpoint?
- Show preset picker based on what's available
- "Download recommended model" button (runs `ollama pull qwen3:1.7b`)

## Phase 5: Telegram Bot (can do now — standalone)

### 5.1 Own TG Bot Handler
File: `_scripts/telegram_dispatcher.py`
- python-telegram-bot library
- Reads bot token from ~/.claude_credentials
- On message: classify via dispatcher pipeline
- Route to correct Claude terminal via file-based IPC
- Relay response back to TG

## [NEEDS USER] Decisions Before Rolling Out

1. **Ollama vs llama.cpp vs vLLM** — which local inference engine to standardize on?
   - Recommendation: Ollama (easiest, cross-platform, model management built-in)

2. **Default model for dispatcher** — Qwen3-1.7B vs Qwen2.5-3B vs something else?
   - Recommendation: Qwen3-1.7B Q4 (best multilingual at small size)

3. **Should non-Claude coding be supported in alpha?**
   - If yes: need OpenAI-compatible provider for Coder role
   - If no: lock Coder to Claude, add others later

4. **TG bot: own handler vs Claude channel plugin?**
   - Own handler = full control, works with local dispatcher
   - Claude plugin = existing, works now, but routes everything through Claude

5. **Settings UI: separate tab or subsection of existing?**
   - Recommendation: new "MODELS" tab in settings

6. **Embedding model download**: should the wizard auto-download BGE-M3 (~2.2GB)?
   - Or offer it as optional ("Enhanced routing — download 2.2GB model?")
