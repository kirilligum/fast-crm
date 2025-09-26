import { expect, test, describe, vi, beforeEach } from 'vitest';
import {
  orchestrateCategorization,
  retrieveTriagePrompt,
  prepareAIContext,
  executeAICategorization,
  parseAIResponse,
  handleCategorizationError,
  setEnv
} from './controller';
import {
  EmailPayload,
  CategoryResult,
  AIModelError,
  KnowledgeRetrievalError
} from '../types/shared';

// Mock the environment dependencies
const mockEnv = {
  AI: {
    run: vi.fn()
  },
  AGENT_MEMORY: {
    get: vi.fn()
  },
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }
};

describe('TriageBot Controller AI Integration - TDD RED PHASE', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setEnv(mockEnv as any);
  });

  describe('orchestrateCategorization', () => {
    test('should orchestrate full categorization workflow successfully', async () => {
      const emailData: EmailPayload = {
        sender_email: 'test@example.com',
        subject: 'Inquiry about Raindrop platform',
        body: 'I want to build AI applications using your Raindrop platform'
      };

      // Mock successful workflow
      mockEnv.AGENT_MEMORY.get.mockResolvedValue({
        content: 'You are TriageBot...'
      });
      mockEnv.AI.run.mockResolvedValue({
        response: '{"category": "QUALIFY_LEAD", "reason": "Technical inquiry about Raindrop"}'
      });

      const result = await orchestrateCategorization(emailData);

      expect(result.category).toBe('QUALIFY_LEAD');
      expect(result.reason).toBe('Technical inquiry about Raindrop');
      expect(mockEnv.AGENT_MEMORY.get).toHaveBeenCalledWith('triage-prompt');
      expect(mockEnv.AI.run).toHaveBeenCalled();
      expect(mockEnv.logger.info).toHaveBeenCalled();
    });

    test('should handle AI model failures with fallback to AMBIGUOUS', async () => {
      const emailData: EmailPayload = {
        sender_email: 'test@example.com',
        subject: 'Test subject',
        body: 'Test body'
      };

      mockEnv.AGENT_MEMORY.get.mockResolvedValue({
        content: 'You are TriageBot...'
      });
      mockEnv.AI.run.mockRejectedValue(new Error('AI model timeout'));

      const result = await orchestrateCategorization(emailData);

      expect(result.category).toBe('AMBIGUOUS');
      expect(result.reason).toContain('AI model error');
      expect(mockEnv.logger.error).toHaveBeenCalled();
    });

    test('should handle memory retrieval failures', async () => {
      const emailData: EmailPayload = {
        sender_email: 'test@example.com',
        subject: 'Test subject',
        body: 'Test body'
      };

      mockEnv.AGENT_MEMORY.get.mockRejectedValue(new Error('Memory access failed'));

      const result = await orchestrateCategorization(emailData);

      expect(result.category).toBe('AMBIGUOUS');
      expect(result.reason).toContain('prompt retrieval error');
      expect(mockEnv.logger.error).toHaveBeenCalled();
    });

    test('should validate email before processing', async () => {
      const invalidEmail: EmailPayload = {
        sender_email: 'invalid-email',
        subject: '',
        body: ''
      };

      const result = await orchestrateCategorization(invalidEmail);

      expect(result.category).toBe('AMBIGUOUS');
      expect(result.reason).toContain('Invalid email data');
    });

    test('should retry on transient failures', async () => {
      const emailData: EmailPayload = {
        sender_email: 'test@example.com',
        subject: 'Test subject',
        body: 'Test body content'
      };

      mockEnv.AGENT_MEMORY.get.mockResolvedValue({
        content: 'You are TriageBot...'
      });

      // First call fails, second succeeds
      mockEnv.AI.run
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValue({
          response: '{"category": "ADD_LEAD", "reason": "Retry successful"}'
        });

      const result = await orchestrateCategorization(emailData);

      expect(result.category).toBe('ADD_LEAD');
      expect(mockEnv.AI.run).toHaveBeenCalledTimes(2);
    });
  });

  describe('retrieveTriagePrompt', () => {
    test('should retrieve triage prompt from SmartMemory', async () => {
      mockEnv.AGENT_MEMORY.get.mockResolvedValue({
        content: 'You are TriageBot, an expert CRM categorization AI...'
      });

      const prompt = await retrieveTriagePrompt();

      expect(prompt).toContain('You are TriageBot');
      expect(mockEnv.AGENT_MEMORY.get).toHaveBeenCalledWith('triage-prompt');
    });

    test('should throw KnowledgeRetrievalError on memory access failure', async () => {
      mockEnv.AGENT_MEMORY.get.mockRejectedValue(new Error('Memory service down'));

      await expect(retrieveTriagePrompt()).rejects.toThrow(KnowledgeRetrievalError);
      await expect(retrieveTriagePrompt()).rejects.toThrow('Failed to retrieve triage prompt');
    });

    test('should handle empty prompt response', async () => {
      mockEnv.AGENT_MEMORY.get.mockResolvedValue(null);

      await expect(retrieveTriagePrompt()).rejects.toThrow(KnowledgeRetrievalError);
      await expect(retrieveTriagePrompt()).rejects.toThrow('Triage prompt not found');
    });

    test('should handle malformed memory response', async () => {
      mockEnv.AGENT_MEMORY.get.mockResolvedValue({
        // missing content field
        id: 'triage-prompt'
      });

      await expect(retrieveTriagePrompt()).rejects.toThrow(KnowledgeRetrievalError);
      await expect(retrieveTriagePrompt()).rejects.toThrow('Invalid prompt format');
    });
  });

  describe('prepareAIContext', () => {
    test('should combine email data with triage prompt', () => {
      const emailData: EmailPayload = {
        sender_email: 'test@example.com',
        subject: 'Business inquiry',
        body: 'Interested in your AI platform for scaling our startup'
      };
      const prompt = 'You are TriageBot. Categorize emails into: ADD_LEAD, QUALIFY_LEAD, IRRELEVANT, AMBIGUOUS';

      const context = prepareAIContext(emailData, prompt);

      expect(context).toContain(prompt);
      expect(context).toContain('test@example.com');
      expect(context).toContain('Business inquiry');
      expect(context).toContain('Interested in your AI platform');
      expect(context).toContain('Email Content:');
      expect(context).toContain('Subject:');
      expect(context).toContain('Body:');
    });

    test('should sanitize email content in context', () => {
      const emailData: EmailPayload = {
        sender_email: 'test@example.com',
        subject: 'Test <script>alert("xss")</script>',
        body: 'Content with <b>HTML</b> tags'
      };
      const prompt = 'You are TriageBot...';

      const context = prepareAIContext(emailData, prompt);

      expect(context).not.toContain('<script>');
      expect(context).not.toContain('<b>');
      expect(context).toContain('Test alert("xss")');
      expect(context).toContain('Content with HTML tags');
    });

    test('should handle empty or null inputs', () => {
      expect(() => prepareAIContext(null as any, 'prompt')).toThrow();
      expect(() => prepareAIContext({} as EmailPayload, '')).toThrow();
      expect(() => prepareAIContext({} as EmailPayload, null as any)).toThrow();
    });

    test('should include response format instructions', () => {
      const emailData: EmailPayload = {
        sender_email: 'test@example.com',
        subject: 'Test',
        body: 'Test'
      };
      const prompt = 'You are TriageBot...';

      const context = prepareAIContext(emailData, prompt);

      expect(context).toContain('JSON format');
      expect(context).toContain('{"category": "CATEGORY_NAME", "reason": "Brief reason"}');
    });
  });

  describe('executeAICategorization', () => {
    test('should call AI model with prepared context', async () => {
      const context = 'You are TriageBot... Email: test@example.com...';
      mockEnv.AI.run.mockResolvedValue({
        response: '{"category": "ADD_LEAD", "reason": "Business inquiry"}'
      });

      const result = await executeAICategorization(context);

      expect(mockEnv.AI.run).toHaveBeenCalledWith({
        model: 'claude-3-haiku',
        messages: [
          { role: 'user', content: context }
        ],
        max_tokens: 1000,
        temperature: 0.1
      });
      expect(result).toEqual({
        response: '{"category": "ADD_LEAD", "reason": "Business inquiry"}'
      });
    });

    test('should throw AIModelError on API failure', async () => {
      const context = 'Test context';
      mockEnv.AI.run.mockRejectedValue(new Error('API rate limit exceeded'));

      await expect(executeAICategorization(context)).rejects.toThrow(AIModelError);
      await expect(executeAICategorization(context)).rejects.toThrow('AI categorization failed');
    });

    test('should handle timeout errors specifically', async () => {
      const context = 'Test context';
      mockEnv.AI.run.mockRejectedValue(new Error('Request timeout'));

      await expect(executeAICategorization(context)).rejects.toThrow(AIModelError);
      await expect(executeAICategorization(context)).rejects.toThrow('timeout');
    });

    test('should validate AI response format', async () => {
      const context = 'Test context';
      mockEnv.AI.run.mockResolvedValue({
        response: 'Invalid non-JSON response'
      });

      const result = await executeAICategorization(context);
      expect(result).toEqual({
        response: 'Invalid non-JSON response'
      });
    });

    test('should handle empty AI response', async () => {
      const context = 'Test context';
      mockEnv.AI.run.mockResolvedValue({
        response: ''
      });

      await expect(executeAICategorization(context)).rejects.toThrow(AIModelError);
      await expect(executeAICategorization(context)).rejects.toThrow('Empty response');
    });
  });

  describe('parseAIResponse', () => {
    test('should parse valid JSON response', () => {
      const validResponse = '{"category": "QUALIFY_LEAD", "reason": "Technical Raindrop inquiry"}';

      const result = parseAIResponse(validResponse);

      expect(result.category).toBe('QUALIFY_LEAD');
      expect(result.reason).toBe('Technical Raindrop inquiry');
    });

    test('should throw error on invalid JSON', () => {
      const invalidResponse = '{"category": "ADD_LEAD", "reason": "Missing quote}';

      expect(() => parseAIResponse(invalidResponse)).toThrow();
      expect(() => parseAIResponse(invalidResponse)).toThrow('Invalid JSON format');
    });

    test('should validate category field exists', () => {
      const missingCategory = '{"reason": "Missing category field"}';

      expect(() => parseAIResponse(missingCategory)).toThrow();
      expect(() => parseAIResponse(missingCategory)).toThrow('Category is required');
    });

    test('should validate reason field exists', () => {
      const missingReason = '{"category": "ADD_LEAD"}';

      expect(() => parseAIResponse(missingReason)).toThrow();
      expect(() => parseAIResponse(missingReason)).toThrow('Reason is required');
    });

    test('should validate category is valid type', () => {
      const invalidCategory = '{"category": "INVALID_TYPE", "reason": "Test reason"}';

      expect(() => parseAIResponse(invalidCategory)).toThrow();
      expect(() => parseAIResponse(invalidCategory)).toThrow('Invalid category type');
    });

    test('should handle extra fields gracefully', () => {
      const extraFields = '{"category": "ADD_LEAD", "reason": "Test", "confidence": 0.8, "extra": "field"}';

      const result = parseAIResponse(extraFields);

      expect(result.category).toBe('ADD_LEAD');
      expect(result.reason).toBe('Test');
      expect(result).not.toHaveProperty('confidence');
      expect(result).not.toHaveProperty('extra');
    });
  });

  describe('handleCategorizationError', () => {
    test('should handle ValidationError with specific message', () => {
      const error = new Error('Email validation failed');
      error.name = 'ValidationError';

      const result = handleCategorizationError(error);

      expect(result.category).toBe('AMBIGUOUS');
      expect(result.reason).toContain('validation error');
      expect(result.reason).toContain('Email validation failed');
    });

    test('should handle AIModelError with fallback', () => {
      const error = new AIModelError('Model API unavailable');

      const result = handleCategorizationError(error);

      expect(result.category).toBe('AMBIGUOUS');
      expect(result.reason).toContain('AI model error');
      expect(result.reason).toContain('Model API unavailable');
    });

    test('should handle KnowledgeRetrievalError', () => {
      const error = new KnowledgeRetrievalError('Prompt access failed');

      const result = handleCategorizationError(error);

      expect(result.category).toBe('AMBIGUOUS');
      expect(result.reason).toContain('prompt retrieval error');
      expect(result.reason).toContain('Prompt access failed');
    });

    test('should handle unknown errors gracefully', () => {
      const error = new Error('Unexpected system error');

      const result = handleCategorizationError(error);

      expect(result.category).toBe('AMBIGUOUS');
      expect(result.reason).toContain('categorization error');
      expect(result.reason).toContain('Unexpected system error');
    });

    test('should log all errors for monitoring', () => {
      const error = new Error('Test error');

      handleCategorizationError(error);

      expect(mockEnv.logger.error).toHaveBeenCalledWith(
        'Categorization error',
        expect.objectContaining({
          error: error.message,
          errorType: error.name
        })
      );
    });

    test('should handle null or undefined error input', () => {
      const result1 = handleCategorizationError(null as any);
      const result2 = handleCategorizationError(undefined as any);

      expect(result1.category).toBe('AMBIGUOUS');
      expect(result2.category).toBe('AMBIGUOUS');
      expect(result1.reason).toContain('unknown error');
      expect(result2.reason).toContain('unknown error');
    });
  });
});