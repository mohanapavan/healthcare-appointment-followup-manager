export interface LlmResult {
  text: string;
  tokenCount?: number;
}

export interface LlmProvider {
  /** Throws on timeout or any provider error — callers handle fallback. */
  generate(prompt: string): Promise<LlmResult>;
}
