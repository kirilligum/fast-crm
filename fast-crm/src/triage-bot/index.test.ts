import { expect, test, describe, vi, beforeEach } from 'vitest';

// Mock the Raindrop framework
vi.mock('@liquidmetal-ai/raindrop-framework', () => ({
  Service: class Service {
    env: any;
    constructor(env: any) {
      this.env = env;
    }
  }
}));

// Mock the generated types
vi.mock('./raindrop.gen', () => ({
  Env: {}
}));

import TriageBotService from './index';
import {
  EmailPayload,
  CategoryResult,
  ValidationError,
  AIModelError
} from '../types/shared';

// Mock the environment and dependencies
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

describe('TriageBot Service Interface - TDD RED PHASE', () => {
  let triageBotService: TriageBotService;

  beforeEach(() => {
    vi.clearAllMocks();
    const mockCtx = {} as any; // Mock ExecutionContext
    triageBotService = new TriageBotService(mockCtx, mockEnv as any);
  });

  describe('fetch method', () => {
    test('should return not implemented response for HTTP requests', async () => {
      const request = new Request('http://localhost/test');

      const response = await triageBotService.fetch(request);

      expect(response.status).toBe(501);
      const text = await response.text();
      expect(text).toContain('not implemented');
      expect(text).toContain('internal service');
    });

    test('should log HTTP request attempts', async () => {
      const request = new Request('http://localhost/triage');

      await triageBotService.fetch(request);

      expect(mockEnv.logger.warn).toHaveBeenCalledWith(
        'HTTP request to internal service',
        expect.objectContaining({
          url: 'http://localhost/triage',
          method: 'GET'
        })
      );
    });
  });

  describe('categorize method', () => {
    test('should categorize valid email successfully', async () => {
      const emailData: EmailPayload = {
        sender_email: 'test@example.com',
        subject: 'Inquiry about Raindrop platform',
        body: 'I want to build AI applications using your platform'
      };

      // Mock successful categorization
      mockEnv.AGENT_MEMORY.get.mockResolvedValue({
        content: 'You are TriageBot...'
      });
      mockEnv.AI.run.mockResolvedValue({
        response: '{"category": "QUALIFY_LEAD", "reason": "Technical inquiry"}'
      });

      const result = await triageBotService.categorize(emailData);

      expect(result.category).toBe('QUALIFY_LEAD');
      expect(result.reason).toBe('Technical inquiry');
      expect(mockEnv.logger.info).toHaveBeenCalledWith(
        'Email categorization request',
        expect.objectContaining({
          sender: 'test@example.com'
        })
      );
    });

    test('should sanitize input before processing', async () => {
      const dirtyEmailData = {
        sender_email: 'test@example.com',
        subject: 'Test <script>alert("xss")</script>',
        body: 'Content with <b>HTML</b> tags'
      } as EmailPayload;

      mockEnv.AGENT_MEMORY.get.mockResolvedValue({
        content: 'You are TriageBot...'
      });
      mockEnv.AI.run.mockResolvedValue({
        response: '{"category": "ADD_LEAD", "reason": "Sanitized input"}'
      });

      const result = await triageBotService.categorize(dirtyEmailData);

      expect(result.category).toBe('ADD_LEAD');
      // Verify sanitization occurred (tested via integration)
      expect(mockEnv.AI.run).toHaveBeenCalled();
    });

    test('should handle validation errors gracefully', async () => {
      const invalidEmailData = {
        sender_email: 'invalid-email',
        subject: '',
        body: ''
      } as EmailPayload;

      const result = await triageBotService.categorize(invalidEmailData);

      expect(result.category).toBe('AMBIGUOUS');
      expect(result.reason).toContain('validation error');
      expect(mockEnv.logger.error).toHaveBeenCalled();
    });

    test('should handle AI model errors with fallback', async () => {
      const emailData: EmailPayload = {
        sender_email: 'test@example.com',
        subject: 'Test subject',
        body: 'Test body content'
      };

      mockEnv.AGENT_MEMORY.get.mockResolvedValue({
        content: 'You are TriageBot...'
      });
      mockEnv.AI.run.mockRejectedValue(new Error('AI service unavailable'));

      const result = await triageBotService.categorize(emailData);

      expect(result.category).toBe('AMBIGUOUS');
      expect(result.reason).toContain('AI model error');
      expect(mockEnv.logger.error).toHaveBeenCalled();
    });

    test('should handle memory retrieval errors', async () => {
      const emailData: EmailPayload = {
        sender_email: 'test@example.com',
        subject: 'Test subject',
        body: 'Test body content'
      };

      mockEnv.AGENT_MEMORY.get.mockRejectedValue(new Error('Memory service down'));

      const result = await triageBotService.categorize(emailData);

      expect(result.category).toBe('AMBIGUOUS');
      expect(result.reason).toContain('prompt retrieval error');
      expect(mockEnv.logger.error).toHaveBeenCalled();
    });

    test('should format response consistently', async () => {
      const emailData: EmailPayload = {
        sender_email: 'test@example.com',
        subject: 'Business inquiry',
        body: 'Interested in your services'
      };

      mockEnv.AGENT_MEMORY.get.mockResolvedValue({
        content: 'You are TriageBot...'
      });
      mockEnv.AI.run.mockResolvedValue({
        response: '{"category": "ADD_LEAD", "reason": "General business inquiry"}'
      });

      const result = await triageBotService.categorize(emailData);

      expect(result).toHaveProperty('category');
      expect(result).toHaveProperty('reason');
      expect(typeof result.category).toBe('string');
      expect(typeof result.reason).toBe('string');
      expect(['ADD_LEAD', 'QUALIFY_LEAD', 'IRRELEVANT', 'AMBIGUOUS']).toContain(result.category);
    });

    test('should log categorization attempts for monitoring', async () => {
      const emailData: EmailPayload = {
        sender_email: 'test@example.com',
        subject: 'Test subject',
        body: 'Test body'
      };

      mockEnv.AGENT_MEMORY.get.mockResolvedValue({
        content: 'You are TriageBot...'
      });
      mockEnv.AI.run.mockResolvedValue({
        response: '{"category": "IRRELEVANT", "reason": "Spam email"}'
      });

      const result = await triageBotService.categorize(emailData);

      expect(mockEnv.logger.info).toHaveBeenCalledWith(
        'Email categorization request',
        expect.objectContaining({
          sender: 'test@example.com',
          subjectLength: 'Test subject'.length,
          bodyLength: 'Test body'.length
        })
      );

      expect(mockEnv.logger.info).toHaveBeenCalledWith(
        'Email categorization completed',
        expect.objectContaining({
          sender: 'test@example.com',
          category: 'IRRELEVANT'
        })
      );
    });
  });

  describe('sanitizeInput method', () => {
    test('should sanitize email content properly', () => {
      const dirtyEmail = {
        sender_email: '  test@example.com  ',
        subject: 'Test <script>alert("xss")</script> Subject',
        body: 'Body with <b>HTML</b> and\nlinebreaks'
      } as EmailPayload;

      const sanitized = triageBotService.sanitizeInput(dirtyEmail);

      expect(sanitized.sender_email).toBe('test@example.com');
      expect(sanitized.subject).not.toContain('<script>');
      expect(sanitized.body).not.toContain('<b>');
      expect(sanitized.subject).toContain('Test');
      expect(sanitized.body).toContain('Body with HTML');
    });

    test('should handle null and undefined inputs', () => {
      expect(() => triageBotService.sanitizeInput(null as any)).toThrow(ValidationError);
      expect(() => triageBotService.sanitizeInput(undefined as any)).toThrow(ValidationError);
    });

    test('should validate required fields', () => {
      const incompleteEmail = {
        sender_email: 'test@example.com',
        subject: 'Test'
        // body is missing
      } as EmailPayload;

      expect(() => triageBotService.sanitizeInput(incompleteEmail)).toThrow(ValidationError);
      expect(() => triageBotService.sanitizeInput(incompleteEmail)).toThrow('Body is required');
    });

    test('should preserve valid email format', () => {
      const validEmail: EmailPayload = {
        sender_email: 'test@example.com',
        subject: 'Clean subject',
        body: 'Clean body content'
      };

      const sanitized = triageBotService.sanitizeInput(validEmail);

      expect(sanitized).toEqual(validEmail);
    });
  });

  describe('formatResponse method', () => {
    test('should format valid category result', () => {
      const categoryResult: CategoryResult = {
        category: 'QUALIFY_LEAD',
        reason: 'Technical inquiry about AI platform'
      };

      const formatted = triageBotService.formatResponse(categoryResult);

      expect(formatted.category).toBe('QUALIFY_LEAD');
      expect(formatted.reason).toBe('Technical inquiry about AI platform');
    });

    test('should ensure reason is properly trimmed', () => {
      const categoryResult: CategoryResult = {
        category: 'ADD_LEAD',
        reason: '  Business inquiry with extra spaces  '
      };

      const formatted = triageBotService.formatResponse(categoryResult);

      expect(formatted.reason).toBe('Business inquiry with extra spaces');
    });

    test('should validate category type in response', () => {
      const invalidResult = {
        category: 'INVALID_CATEGORY' as any,
        reason: 'Test reason'
      } as CategoryResult;

      expect(() => triageBotService.formatResponse(invalidResult)).toThrow(ValidationError);
      expect(() => triageBotService.formatResponse(invalidResult)).toThrow('Invalid category');
    });
  });

  describe('handleError method', () => {
    test('should handle ValidationError appropriately', () => {
      const validationError = new ValidationError('Email format invalid');

      const result = triageBotService.handleError(validationError);

      expect(result.category).toBe('AMBIGUOUS');
      expect(result.reason).toContain('validation error');
      expect(result.reason).toContain('Email format invalid');
    });

    test('should handle AIModelError with specific messaging', () => {
      const aiError = new AIModelError('Model timeout');

      const result = triageBotService.handleError(aiError);

      expect(result.category).toBe('AMBIGUOUS');
      expect(result.reason).toContain('AI model error');
      expect(result.reason).toContain('Model timeout');
    });

    test('should handle generic errors gracefully', () => {
      const genericError = new Error('Unexpected error');

      const result = triageBotService.handleError(genericError);

      expect(result.category).toBe('AMBIGUOUS');
      expect(result.reason).toContain('categorization error');
      expect(result.reason).toContain('Unexpected error');
    });

    test('should log all errors for debugging', () => {
      const error = new Error('Test error');

      triageBotService.handleError(error);

      expect(mockEnv.logger.error).toHaveBeenCalledWith(
        'TriageBot service error',
        expect.objectContaining({
          error: 'Test error',
          errorType: 'Error'
        })
      );
    });
  });
});
