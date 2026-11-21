/**
 * Types and interfaces for Baseer AI Agent integration.
 * Strictly typed with zero 'any' to ensure contract safety and predictable deserialization.
 */

export interface AiAgentEntities {
  target?: string;
  destination?: string;
  missing?: string[];
  denomination?: string;
  color?: string;
  [key: string]: string | number | boolean | string[] | undefined;
}

/**
 * Validated intent classification result produced after runtime validation.
 */
export interface AiIntentClassificationResult {
  intent: string;
  confidence: number | null;
  entities: AiAgentEntities;
  requiresClarification: boolean;
  suggestedResponse: string | null;
  isSupported: boolean;
}

/**
 * Raw external payload received from the AI Agent over HTTP.
 */
export interface RawAiAgentResponse {
  intent?: unknown;
  confidence?: unknown;
  entities?: unknown;
  requiresClarification?: unknown;
  suggestedResponse?: unknown;
  isSupported?: unknown;
}

/**
 * Standard request payload dispatched from NestJS Backend to the AI Agent.
 */
export interface AiAgentClassificationRequest {
  text: string;
  language?: string;
  correlationId?: string;
}

/**
 * Token for dependency injection of the AI Voice Agent Client.
 */
export const AI_VOICE_AGENT_CLIENT = Symbol('AI_VOICE_AGENT_CLIENT');

/**
 * Interface contract that all AI Voice Agent clients (HTTP and Mock) must fulfill.
 */
export interface IAiVoiceAgentClient {
  classifyIntent(
    text: string,
    language?: string,
    correlationId?: string,
  ): Promise<AiIntentClassificationResult>;
}
