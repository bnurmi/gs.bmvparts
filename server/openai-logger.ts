/**
 * Shared OpenAI usage logging wrapper.
 *
 * Every OpenAI chat/completion call in the project should go through
 * `loggedChatCompletion` so token usage and estimated USD cost are
 * persisted to `ai_usage_logs` for the Admin → AI Usage dashboard.
 *
 * Pricing table is hardcoded here — the single source of truth.
 * Update rates when OpenAI changes pricing.
 */

import OpenAI from "openai";
import { db } from "./storage";
import { aiUsageLogs } from "@shared/schema";

// ---------------------------------------------------------------------------
// Pricing table — USD per 1 000 tokens (input / output)
// ---------------------------------------------------------------------------
const PRICE_PER_1K: Record<string, { input: number; output: number }> = {
  "gpt-4o":           { input: 0.0025,  output: 0.01    },
  "gpt-4o-2024-11-20":{ input: 0.0025,  output: 0.01    },
  "gpt-4o-2024-08-06":{ input: 0.0025,  output: 0.01    },
  "gpt-4o-mini":      { input: 0.00015, output: 0.0006  },
  "gpt-4o-mini-2024-07-18": { input: 0.00015, output: 0.0006 },
  "gpt-4-turbo":      { input: 0.01,    output: 0.03    },
  "gpt-4":            { input: 0.03,    output: 0.06    },
  "gpt-3.5-turbo":    { input: 0.0005,  output: 0.0015  },
  "gpt-5.1":          { input: 0.0025,  output: 0.01    },
  "gpt-5":            { input: 0.0025,  output: 0.01    },
  // Audio models — text-token pricing (audio tokens not separately counted in usage object)
  "gpt-audio":                  { input: 0.0025,  output: 0.01    },
  "gpt-4o-audio-preview":       { input: 0.0025,  output: 0.01    },
  "gpt-4o-mini-audio-preview":  { input: 0.00015, output: 0.0006  },
  // Transcription model — usage object doesn't return tokens; cost logged at 0
  "gpt-4o-mini-transcribe":     { input: 0,       output: 0       },
  "gpt-4o-transcribe":          { input: 0,       output: 0       },
  "whisper-1":                  { input: 0,       output: 0       },
};

function getDefaultPrice() {
  return { input: 0.0025, output: 0.01 };
}

function computeCostUsd(model: string, promptTokens: number, completionTokens: number): number {
  const rates = PRICE_PER_1K[model] ?? getDefaultPrice();
  return (promptTokens / 1000) * rates.input + (completionTokens / 1000) * rates.output;
}

// ---------------------------------------------------------------------------
// Insert a usage row (fire-and-forget — never throws)
// Public alias: logUsageDirectly — for call sites that cannot use the wrappers
// (e.g. audio transcription API which has no chat.completions shape)
// ---------------------------------------------------------------------------
export async function logUsageDirectly(
  feature: string,
  model: string,
  promptTokens: number,
  completionTokens: number,
): Promise<void> {
  return insertUsageLog(feature, model, promptTokens, completionTokens);
}

async function insertUsageLog(
  feature: string,
  model: string,
  promptTokens: number,
  completionTokens: number,
): Promise<void> {
  try {
    const costUsd = computeCostUsd(model, promptTokens, completionTokens);
    await db.insert(aiUsageLogs).values({ feature, model, promptTokens, completionTokens, costUsd });
  } catch (err) {
    console.warn("[openai-logger] failed to write usage log", err);
  }
}

// ---------------------------------------------------------------------------
// Wrapped non-streaming chat completion
// ---------------------------------------------------------------------------
export async function loggedChatCompletion(
  client: OpenAI,
  feature: string,
  params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
): Promise<OpenAI.Chat.ChatCompletion> {
  const response = await client.chat.completions.create(params);
  const usage = response.usage;
  if (usage) {
    void insertUsageLog(
      feature,
      response.model || params.model,
      usage.prompt_tokens ?? 0,
      usage.completion_tokens ?? 0,
    );
  }
  return response;
}

// ---------------------------------------------------------------------------
// Wrapped streaming chat completion
// Collects the final usage chunk (requires stream_options.include_usage=true)
// and logs it after the stream ends. Returns the original stream untouched.
// ---------------------------------------------------------------------------
export async function loggedStreamingChatCompletion(
  client: OpenAI,
  feature: string,
  params: Omit<OpenAI.Chat.ChatCompletionCreateParamsStreaming, "stream">,
): Promise<AsyncIterable<OpenAI.Chat.ChatCompletionChunk>> {
  const stream = await client.chat.completions.create({
    ...params,
    stream: true,
    stream_options: { include_usage: true },
  });

  let promptTokens = 0;
  let completionTokens = 0;
  let resolvedModel = params.model;

  async function* withLogging() {
    for await (const chunk of stream) {
      if (chunk.model) resolvedModel = chunk.model;
      if (chunk.usage) {
        promptTokens = chunk.usage.prompt_tokens ?? 0;
        completionTokens = chunk.usage.completion_tokens ?? 0;
      }
      yield chunk;
    }
    void insertUsageLog(feature, resolvedModel, promptTokens, completionTokens);
  }

  return withLogging();
}
