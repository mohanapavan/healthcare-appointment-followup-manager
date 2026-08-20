import { GoogleGenerativeAI } from "@google/generative-ai";
import { getEnv } from "@/lib/env";
import type { LlmProvider, LlmResult } from "./types";

const TIMEOUT_MS = 10_000;

export class GeminiProvider implements LlmProvider {
  async generate(prompt: string): Promise<LlmResult> {
    const env = getEnv();
    const client = new GoogleGenerativeAI(env.GEMINI_API_KEY);
    const model = client.getGenerativeModel({ model: env.LLM_MODEL });

    const result = await model.generateContent(prompt, { timeout: TIMEOUT_MS });
    const text = result.response.text();
    const tokenCount = result.response.usageMetadata?.totalTokenCount;
    return { text, tokenCount };
  }
}
