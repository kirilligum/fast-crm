/**
 * COMPREHENSIVE TESTS for response-bot SERVICE (index.ts)
 *
 * TDD RED PHASE: Write failing tests FIRST
 * These tests define the expected behavior for the main service interface,
 * input validation, response formatting, and error handling.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import ResponseBotService from './index';
import {
  EmailPayload,
  EmailResponse,
  CategoryType,
  ValidationError,
  TemplateError
} from '../types/shared';

// Mock the controller functions
vi.mock('./controller', () => ({
  orchestrateResponseGeneration: vi.fn(),
  setControllerEnv: vi.fn()
}));

// Mock the model functions
vi.mock('./model', () => ({
  validateEmailResponse: vi.fn(),
  formatResponseContent: vi.fn()
}));

import { orchestrateResponseGeneration } from './controller';
import { validateEmailResponse, formatResponseContent } from './model';

describe('response-bot Service - Main Interface', () => {
  let service: ResponseBotService;
  const mockEnv = {
    AI: {
      run: vi.fn()
    },
    AGENT_MEMORY: {
      get: vi.fn(),
      search: vi.fn()
    },
    logger: {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn()
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    const mockCtx = {} as any; // Mock ExecutionContext
    service = new ResponseBotService(mockCtx, mockEnv as any);
  });

  test('should have fetch method that returns not implemented', async () => {
    const request = new Request('http://localhost/test');
    const response = await service.fetch(request);
    const text = await response.text();

    expect(text).toContain('Request received');
    expect(response.status).toBe(200);
  });

  test('should generate response for ADD_LEAD category', async () => {
    const emailData: EmailPayload = {
      sender_email: 'startup@example.com',
      subject: 'Interested in AI platform',
      body: 'We are building an AI application and need a scalable platform.'
    };

    const mockResponse: EmailResponse = {
      to: 'startup@example.com',
      subject: 'Re: Interested in AI platform',
      body: 'Thank you for your interest in Raindrop. Our AI-native platform helps technical founders...'
    };

    (orchestrateResponseGeneration as any).mockResolvedValueOnce(mockResponse);
    (validateEmailResponse as any).mockReturnValueOnce({ isValid: true, errors: [] });

    const result = await service.generate('ADD_LEAD', emailData);

    expect(result).toEqual(mockResponse);
    expect(orchestrateResponseGeneration).toHaveBeenCalledWith('ADD_LEAD', emailData);
    expect(mockEnv.logger.info).toHaveBeenCalledWith('Response generation completed', {
      category: 'ADD_LEAD',
      sender: 'startup@example.com'
    });
  });

  test('should generate response for QUALIFY_LEAD category', async () => {
    const emailData: EmailPayload = {
      sender_email: 'tech@corp.com',
      subject: 'Technical requirements',
      body: 'We need specific technical details about your API integration.'
    };

    const mockResponse: EmailResponse = {
      to: 'tech@corp.com',
      subject: 'Re: Technical requirements',
      body: 'Thank you for reaching out about your technical needs. Could you share more about your current infrastructure?'
    };

    (orchestrateResponseGeneration as any).mockResolvedValueOnce(mockResponse);
    (validateEmailResponse as any).mockReturnValueOnce({ isValid: true, errors: [] });

    const result = await service.generate('QUALIFY_LEAD', emailData);

    expect(result).toEqual(mockResponse);
    expect(orchestrateResponseGeneration).toHaveBeenCalledWith('QUALIFY_LEAD', emailData);
  });

  test('should validate input category', async () => {
    const emailData: EmailPayload = {
      sender_email: 'test@example.com',
      subject: 'Test',
      body: 'Test body'
    };

    await expect(service.generate('INVALID' as CategoryType, emailData)).rejects.toThrow(ValidationError);
    expect(mockEnv.logger.error).toHaveBeenCalled();
  });

  test('should validate input email data', async () => {
    const invalidEmailData = {
      sender_email: 'invalid-email',
      subject: '',
      body: ''
    } as EmailPayload;

    await expect(service.generate('ADD_LEAD', invalidEmailData)).rejects.toThrow(ValidationError);
    expect(mockEnv.logger.error).toHaveBeenCalled();
  });

  test('should handle orchestration errors gracefully', async () => {
    const emailData: EmailPayload = {
      sender_email: 'test@example.com',
      subject: 'Test inquiry',
      body: 'Test body content'
    };

    (orchestrateResponseGeneration as any).mockRejectedValueOnce(new Error('Service unavailable'));

    const result = await service.generate('ADD_LEAD', emailData);

    expect(result.body).toContain('Thank you for your inquiry');
    expect(result.to).toBe('test@example.com');
    expect(result.subject).toBe('Re: Test inquiry');
    expect(mockEnv.logger.error).toHaveBeenCalled();
  });

  test('should sanitize email data before processing', async () => {
    const unsanitizedEmailData = {
      sender_email: '  startup@example.com  ',
      subject: '  Interested in AI platform  ',
      body: '  We need AI solutions.  '
    } as EmailPayload;

    const mockResponse: EmailResponse = {
      to: 'startup@example.com',
      subject: 'Re: Interested in AI platform',
      body: 'Thank you for your interest...'
    };

    (orchestrateResponseGeneration as any).mockResolvedValueOnce(mockResponse);
    (validateEmailResponse as any).mockReturnValueOnce({ isValid: true, errors: [] });

    const result = await service.generate('ADD_LEAD', unsanitizedEmailData);

    expect(orchestrateResponseGeneration).toHaveBeenCalledWith('ADD_LEAD', {
      sender_email: 'startup@example.com',
      subject: 'Interested in AI platform',
      body: 'We need AI solutions.'
    });
  });

  test('should log all generation attempts', async () => {
    const emailData: EmailPayload = {
      sender_email: 'user@example.com',
      subject: 'Test',
      body: 'Test body'
    };

    const mockResponse: EmailResponse = {
      to: 'user@example.com',
      subject: 'Re: Test',
      body: 'Test response'
    };

    (orchestrateResponseGeneration as any).mockResolvedValueOnce(mockResponse);
    (validateEmailResponse as any).mockReturnValueOnce({ isValid: true, errors: [] });

    await service.generate('ADD_LEAD', emailData);

    expect(mockEnv.logger.info).toHaveBeenCalledWith('Response generation started', {
      category: 'ADD_LEAD',
      sender: 'user@example.com'
    });
    expect(mockEnv.logger.info).toHaveBeenCalledWith('Response generation completed', {
      category: 'ADD_LEAD',
      sender: 'user@example.com'
    });
  });
});

describe('response-bot Service - Input Validation', () => {
  let service: ResponseBotService;
  const mockEnv = {
    AI: { run: vi.fn() },
    AGENT_MEMORY: { get: vi.fn(), search: vi.fn() },
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    const mockCtx = {} as any; // Mock ExecutionContext
    service = new ResponseBotService(mockCtx, mockEnv as any);
  });

  test('should validate category type', () => {
    const result = service.validateInput('ADD_LEAD', {} as EmailPayload);
    expect(result.isValid).toBe(false); // Email validation should fail
  });

  test('should reject invalid category', () => {
    const emailData: EmailPayload = {
      sender_email: 'test@example.com',
      subject: 'Test',
      body: 'Test body'
    };

    const result = service.validateInput('INVALID' as CategoryType, emailData);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Invalid category type');
  });

  test('should validate email format', () => {
    const emailData: EmailPayload = {
      sender_email: 'invalid-email',
      subject: 'Test',
      body: 'Test body'
    };

    const result = service.validateInput('ADD_LEAD', emailData);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Invalid email format');
  });

  test('should require subject', () => {
    const emailData: EmailPayload = {
      sender_email: 'test@example.com',
      subject: '',
      body: 'Test body'
    };

    const result = service.validateInput('ADD_LEAD', emailData);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Subject is required');
  });

  test('should require body content', () => {
    const emailData: EmailPayload = {
      sender_email: 'test@example.com',
      subject: 'Test',
      body: ''
    };

    const result = service.validateInput('ADD_LEAD', emailData);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Body content is required');
  });
});

describe('response-bot Service - Response Formatting', () => {
  let service: ResponseBotService;
  const mockEnv = {
    AI: { run: vi.fn() },
    AGENT_MEMORY: { get: vi.fn(), search: vi.fn() },
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    const mockCtx = {} as any; // Mock ExecutionContext
    service = new ResponseBotService(mockCtx, mockEnv as any);
  });

  test('should format response properly', () => {
    const response: EmailResponse = {
      to: 'test@example.com',
      subject: 'Re: Test',
      body: 'Test response content'
    };

    (formatResponseContent as any).mockReturnValueOnce('Formatted test response content');

    const formatted = service.formatResponse(response);

    expect(formatted.body).toBe('Formatted test response content');
    expect(formatResponseContent).toHaveBeenCalledWith('Test response content');
  });

  test('should preserve email structure during formatting', () => {
    const response: EmailResponse = {
      to: 'user@example.com',
      subject: 'Re: Inquiry',
      body: 'Original content'
    };

    (formatResponseContent as any).mockReturnValueOnce('Formatted content');

    const formatted = service.formatResponse(response);

    expect(formatted.to).toBe('user@example.com');
    expect(formatted.subject).toBe('Re: Inquiry');
    expect(formatted.body).toBe('Formatted content');
  });
});

describe('response-bot Service - Error Handling', () => {
  let service: ResponseBotService;
  const mockEnv = {
    AI: { run: vi.fn() },
    AGENT_MEMORY: { get: vi.fn(), search: vi.fn() },
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    const mockCtx = {} as any; // Mock ExecutionContext
    service = new ResponseBotService(mockCtx, mockEnv as any);
  });

  test('should handle ValidationError gracefully', () => {
    const error = new ValidationError('Invalid input');
    const emailData: EmailPayload = {
      sender_email: 'test@example.com',
      subject: 'Test',
      body: 'Test body'
    };

    const fallback = service.handleError(error, emailData);

    expect(fallback.to).toBe('test@example.com');
    expect(fallback.subject).toBe('Re: Test');
    expect(fallback.body).toContain('Thank you for your inquiry');
  });

  test('should handle TemplateError gracefully', () => {
    const error = new TemplateError('Template not found');
    const emailData: EmailPayload = {
      sender_email: 'user@example.com',
      subject: 'Technical question',
      body: 'Technical content'
    };

    const fallback = service.handleError(error, emailData);

    expect(fallback.body).toContain('Thank you for reaching out');
    expect(fallback.body).toContain('team will review');
  });

  test('should handle unknown errors gracefully', () => {
    const error = new Error('Unknown service error');
    const emailData: EmailPayload = {
      sender_email: 'contact@company.com',
      subject: 'General inquiry',
      body: 'General content'
    };

    const fallback = service.handleError(error, emailData);

    expect(fallback.body).toContain('Thank you for your inquiry');
    expect(fallback.body).toContain('team will review');
  });
});

describe('response-bot Service - Data Sanitization', () => {
  let service: ResponseBotService;
  const mockEnv = {
    AI: { run: vi.fn() },
    AGENT_MEMORY: { get: vi.fn(), search: vi.fn() },
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    const mockCtx = {} as any; // Mock ExecutionContext
    service = new ResponseBotService(mockCtx, mockEnv as any);
  });

  test('should sanitize email data properly', () => {
    const dirtyData = {
      sender_email: '  test@example.com  ',
      subject: '  Test Subject  ',
      body: '  Test body content  '
    } as EmailPayload;

    const sanitized = service.sanitizeEmailData(dirtyData);

    expect(sanitized.sender_email).toBe('test@example.com');
    expect(sanitized.subject).toBe('Test Subject');
    expect(sanitized.body).toBe('Test body content');
  });

  test('should handle null/undefined values', () => {
    const dirtyData = {
      sender_email: null,
      subject: undefined,
      body: '  Valid content  '
    } as any;

    const sanitized = service.sanitizeEmailData(dirtyData);

    expect(sanitized.sender_email).toBe('');
    expect(sanitized.subject).toBe('');
    expect(sanitized.body).toBe('Valid content');
  });

  test('should remove dangerous HTML/script content', () => {
    const dirtyData = {
      sender_email: 'test@example.com',
      subject: '<script>alert("xss")</script>Test Subject',
      body: '<img src="x" onerror="alert(1)">Test body'
    } as EmailPayload;

    const sanitized = service.sanitizeEmailData(dirtyData);

    expect(sanitized.subject).not.toContain('<script>');
    expect(sanitized.body).not.toContain('onerror');
  });
});
