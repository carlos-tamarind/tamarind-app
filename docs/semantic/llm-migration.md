# GPT-6 Luna migration

The active LLM model is `gpt-6-luna` for conversation-topic classification and promotion, canonical-topic arbitration and regeneration, page-topic generation, and conversation-suggestion judging. The shared provider default and all four feature model settings use this model.

The Responses API, strict JSON schemas, prompts, `reasoning.effort: "none"`, 20-second timeouts, confidence thresholds, error handling, and embeddings are unchanged. There are no database migrations or automatic model fallbacks.

OpenAI recommends this replacement before the April 1, 2027 shutdown of `gpt-5.4-nano`. Luna supports structured outputs and `none` reasoning. See the [deprecation notice](https://developers.openai.com/api/docs/deprecations) and [model documentation](https://developers.openai.com/api/docs/models/gpt-6-luna).

## Verification status

Live model behavior, output quality, latency and token usage have not been verified because no OpenAI API key was available locally. Production-worker acceptance remains unverified.
