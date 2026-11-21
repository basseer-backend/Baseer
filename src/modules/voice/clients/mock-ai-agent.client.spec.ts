import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MockAiVoiceAgentClient } from './mock-ai-agent.client';

describe('MockAiVoiceAgentClient (Dev & Test Only)', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  describe('Simulation Capabilities in Development', () => {
    it('should classify document reading query in development', async () => {
      const mock = new MockAiVoiceAgentClient();
      const result = await mock.classifyIntent('اقرأ لي الورقة دي');

      expect(result.intent).toBe('READ_DOCUMENT');
      expect(result.isSupported).toBe(true);
      expect(result.requiresClarification).toBe(false);
      expect(result.confidence).toBe(0.95);
    });

    it('should simulate requiresClarification when user says ambiguous phrase', async () => {
      const mock = new MockAiVoiceAgentClient();
      const result = await mock.classifyIntent('عايز أروح');

      expect(result.intent).toBe('INDOOR_NAVIGATION');
      expect(result.requiresClarification).toBe(true);
      expect(result.entities.missing).toContain('destination');
      expect(result.suggestedResponse).toContain('تحب تروح فين');
    });

    it('should simulate UNKNOWN intent for random unsupported queries', async () => {
      const mock = new MockAiVoiceAgentClient();
      const result = await mock.classifyIntent('الطقس النهاردة عامل إيه');

      expect(result.intent).toBe('UNKNOWN');
      expect(result.isSupported).toBe(false);
    });
  });

  describe('Mock Production Protection (Point 5 & 9)', () => {
    it('should throw critical error when instantiated in production environment', () => {
      process.env.NODE_ENV = 'production';

      expect(() => new MockAiVoiceAgentClient()).toThrowError(
        /MockAiVoiceAgentClient is strictly forbidden in production environments/i,
      );
    });

    it('should throw critical error if classifyIntent is called in production environment', async () => {
      const mock = new MockAiVoiceAgentClient(); // created in development
      process.env.NODE_ENV = 'production'; // switched to production

      await expect(mock.classifyIntent('اقرأ')).rejects.toThrowError(
        /MockAiVoiceAgentClient is strictly forbidden in production environments/i,
      );
    });
  });
});
