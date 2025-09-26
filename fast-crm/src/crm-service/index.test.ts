import { expect, test, describe, vi, beforeEach } from 'vitest';
import { EmailPayload, ProcessEmailResponse } from '../../../src/types/shared';

// Mock Raindrop framework
vi.mock('@liquidmetal-ai/raindrop-framework', () => ({
  Service: class MockService {
    async fetch(request: Request): Promise<Response> {
      throw new Error('Not implemented - should be overridden in tests');
    }
  }
}));

// Mock the Env interface
vi.mock('./raindrop.gen', () => ({
  Env: {}
}));

// Mock environment and controller functions
const mockEnv = {
  TRIAGE_BOT: {
    categorize: vi.fn()
  },
  RESPONSE_BOT: {
    generate: vi.fn()
  },
  CRM_DATABASE: {
    executeQuery: vi.fn(),
    getMetadata: vi.fn(),
    updateMetadata: vi.fn(),
    getPiiData: vi.fn()
  },
  AGENT_MEMORY: {
    startWorkingMemorySession: vi.fn(),
    getWorkingMemorySession: vi.fn(),
    rehydrateSession: vi.fn(),
    searchEpisodicMemory: vi.fn(),
    getSemanticMemory: vi.fn(),
    addSemanticMemory: vi.fn(),
    addProceduralMemory: vi.fn(),
    getProceduralMemory: vi.fn(),
    searchSemanticMemory: vi.fn(),
    putSemanticMemory: vi.fn(),
    deleteSemanticMemory: vi.fn(),
    log: vi.fn(),
    store: vi.fn()
  },
  _raindrop: {} as any,
  AI: {
    run: vi.fn()
  },
  annotation: {} as any,
  tracer: {} as any,
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    with: vi.fn(),
    log: vi.fn(),
    logAtLevel: vi.fn(),
    message: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    messageAtLevel: vi.fn(),
    withError: vi.fn()
  }
};

// Mock controller functions
vi.mock('./controller', () => ({
  processEmailWorkflow: vi.fn()
}));

import { processEmailWorkflow } from './controller';
import CrmService from './index';

describe('CRM Service HTTP Endpoint Handling - TDD RED PHASE', () => {
  let service: CrmService;

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();

    // Create service instance with mock environment
    const mockCtx = {} as any; // Mock ExecutionContext
    service = new CrmService(mockCtx, mockEnv as any);
  });

  describe('fetch method - main HTTP handler', () => {
    test('should handle POST /api/v1/process_email with valid JSON', async () => {
      const emailPayload: EmailPayload = {
        sender_email: 'test@example.com',
        subject: 'Test Subject',
        body: 'Test email body'
      };

      const expectedResponse: ProcessEmailResponse = {
        status: 'processed',
        category: 'ADD_LEAD',
        sender_email: 'test@example.com',
        db_action: 'INSERT INTO leads',
        response_email: {
          to: 'test@example.com',
          subject: 'Re: Test Subject',
          body: 'Thank you for your inquiry'
        },
        requires_review: false
      };

      (processEmailWorkflow as any).mockResolvedValue(expectedResponse);

      const request = new Request('http://localhost/api/v1/process_email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(emailPayload)
      });

      const response = await service.fetch(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
      expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Content-Type');

      const responseJson = await response.json() as any;
      expect(responseJson).toEqual(expectedResponse);
      expect(processEmailWorkflow).toHaveBeenCalledWith(emailPayload, expect.any(Object));
    });

    test('should handle OPTIONS preflight requests with CORS headers', async () => {
      const request = new Request('http://localhost/api/v1/process_email', {
        method: 'OPTIONS'
      });

      const response = await service.fetch(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('OPTIONS');
      expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Content-Type');
      expect(response.headers.get('Access-Control-Max-Age')).toBe('86400');

      const responseText = await response.text();
      expect(responseText).toBe('');
    });

    test('should return 405 for unsupported HTTP methods', async () => {
      const request = new Request('http://localhost/api/v1/process_email', {
        method: 'GET'
      });

      const response = await service.fetch(request);

      expect(response.status).toBe(405);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');

      const responseJson = await response.json() as any;
      expect(responseJson).toEqual({
        error: 'Method Not Allowed',
        message: 'Only POST and OPTIONS methods are supported'
      });
    });

    test('should return 404 for unsupported paths', async () => {
      const request = new Request('http://localhost/api/v1/unsupported', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const response = await service.fetch(request);

      expect(response.status).toBe(404);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');

      const responseJson = await response.json() as any;
      expect(responseJson).toEqual({
        error: 'Not Found',
        message: 'Endpoint not found'
      });
    });

    test('should return 400 for invalid JSON content type', async () => {
      const request = new Request('http://localhost/api/v1/process_email', {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain'
        },
        body: 'invalid content'
      });

      const response = await service.fetch(request);

      expect(response.status).toBe(400);
      expect(response.headers.get('Content-Type')).toBe('application/json');

      const responseJson = await response.json() as any;
      expect(responseJson).toEqual({
        error: 'Bad Request',
        message: 'Content-Type must be application/json'
      });
    });

    test('should return 400 for malformed JSON', async () => {
      const request = new Request('http://localhost/api/v1/process_email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: 'invalid json {'
      });

      const response = await service.fetch(request);

      expect(response.status).toBe(400);
      expect(response.headers.get('Content-Type')).toBe('application/json');

      const responseJson = await response.json() as any;
      expect(responseJson.error).toBe('Bad Request');
      expect(responseJson.message).toContain('Invalid JSON');
    });

    test('should return 400 for missing required fields', async () => {
      const invalidPayload = {
        sender_email: 'test@example.com',
        subject: 'Test Subject'
        // body is missing
      };

      const request = new Request('http://localhost/api/v1/process_email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(invalidPayload)
      });

      const response = await service.fetch(request);

      expect(response.status).toBe(400);
      expect(response.headers.get('Content-Type')).toBe('application/json');

      const responseJson = await response.json() as any;
      expect(responseJson.error).toBe('Bad Request');
      expect(responseJson.message).toContain('Validation failed');
    });

    test('should return 500 for internal processing errors', async () => {
      const emailPayload: EmailPayload = {
        sender_email: 'test@example.com',
        subject: 'Test Subject',
        body: 'Test email body'
      };

      (processEmailWorkflow as any).mockRejectedValue(new Error('Internal processing error'));

      const request = new Request('http://localhost/api/v1/process_email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(emailPayload)
      });

      const response = await service.fetch(request);

      expect(response.status).toBe(500);
      expect(response.headers.get('Content-Type')).toBe('application/json');

      const responseJson = await response.json() as any;
      expect(responseJson).toEqual({
        error: 'Internal Server Error',
        message: 'Internal processing error'
      });
    });

    test('should log all requests and responses', async () => {
      const emailPayload: EmailPayload = {
        sender_email: 'test@example.com',
        subject: 'Test Subject',
        body: 'Test email body'
      };

      const expectedResponse: ProcessEmailResponse = {
        status: 'processed',
        category: 'ADD_LEAD',
        sender_email: 'test@example.com',
        db_action: 'INSERT INTO leads',
        response_email: null,
        requires_review: false
      };

      (processEmailWorkflow as any).mockResolvedValue(expectedResponse);

      const request = new Request('http://localhost/api/v1/process_email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(emailPayload)
      });

      await service.fetch(request);

      expect(mockEnv.logger.info).toHaveBeenCalledWith(
        expect.stringMatching(/^Processing email request from test@example\.com/)
      );
      expect(mockEnv.logger.info).toHaveBeenCalledWith(
        expect.stringMatching(/^Email processing completed/)
      );
    });

    test('should handle empty request body gracefully', async () => {
      const request = new Request('http://localhost/api/v1/process_email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: ''
      });

      const response = await service.fetch(request);

      expect(response.status).toBe(400);
      const responseJson = await response.json() as any;
      expect(responseJson.error).toBe('Bad Request');
      expect(responseJson.message).toContain('Request body is required');
    });

    test('should handle very large request bodies', async () => {
      const largePayload: EmailPayload = {
        sender_email: 'test@example.com',
        subject: 'Test Subject',
        body: 'x'.repeat(100000) // Very large body
      };

      const request = new Request('http://localhost/api/v1/process_email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(largePayload)
      });

      const response = await service.fetch(request);

      // Should either process successfully or return appropriate error
      expect([200, 400, 413]).toContain(response.status);
    });
  });

  describe('handleProcessEmail method', () => {
    test('should process valid email payload', async () => {
      const emailPayload: EmailPayload = {
        sender_email: 'test@example.com',
        subject: 'Test Subject',
        body: 'Test email body'
      };

      const expectedResponse: ProcessEmailResponse = {
        status: 'processed',
        category: 'ADD_LEAD',
        sender_email: 'test@example.com',
        db_action: 'INSERT INTO leads',
        response_email: null,
        requires_review: false
      };

      (processEmailWorkflow as any).mockResolvedValue(expectedResponse);

      const request = new Request('http://localhost/api/v1/process_email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(emailPayload)
      });

      const response = await service.handleProcessEmail(request);

      expect(response.status).toBe(200);
      const responseJson = await response.json() as any;
      expect(responseJson).toEqual(expectedResponse);
    });

    test('should handle validation errors', async () => {
      const invalidPayload = {
        sender_email: 'invalid-email',
        subject: 'Test Subject',
        body: 'Test body'
      };

      const request = new Request('http://localhost/api/v1/process_email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(invalidPayload)
      });

      const response = await service.handleProcessEmail(request);

      expect(response.status).toBe(400);
      const responseJson = await response.json() as any;
      expect(responseJson.error).toBe('Bad Request');
    });
  });

  describe('handleCORS method', () => {
    test('should return proper CORS headers for preflight requests', () => {
      const request = new Request('http://localhost/api/v1/process_email', {
        method: 'OPTIONS'
      });

      const response = service.handleCORS(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
      expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Content-Type');
    });
  });

  describe('formatErrorResponse method', () => {
    test('should format error responses correctly', () => {
      const error = new Error('Test error message');

      const response = service.formatErrorResponse(error, 400);

      expect(response.status).toBe(400);
      expect(response.headers.get('Content-Type')).toBe('application/json');
    });

    test('should include CORS headers in error responses', () => {
      const error = new Error('Test error');

      const response = service.formatErrorResponse(error, 500);

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });
  });
});
