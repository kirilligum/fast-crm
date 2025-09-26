import { expect, test, describe, vi, beforeEach } from 'vitest';
import {
  processEmailWorkflow,
  orchestrateTriageBot,
  manageDatabaseOperations,
  orchestrateResponseBot,
  logInteraction
} from './controller';
import {
  EmailPayload,
  ProcessEmailResponse,
  CategoryResult,
  EmailResponse,
  InteractionLog,
  CategoryType,
  AIModelError,
  DatabaseError,
  KnowledgeRetrievalError
} from '../../../src/types/shared';

// Mock environment dependencies
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
    log: vi.fn(),
    store: vi.fn()
  },
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }
};

describe('Controller Workflow Orchestration - TDD RED PHASE', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();
  });

  describe('processEmailWorkflow', () => {
    test('should orchestrate complete email processing workflow for ADD_LEAD', async () => {
      const emailPayload: EmailPayload = {
        sender_email: 'newlead@example.com',
        subject: 'Interested in your service',
        body: 'I would like to learn more about your offerings'
      };

      const categoryResult: CategoryResult = {
        category: 'ADD_LEAD',
        reason: 'New customer inquiry detected'
      };

      const emailResponse: EmailResponse = {
        to: 'newlead@example.com',
        subject: 'Re: Interested in your service',
        body: 'Thank you for your interest. We will contact you soon.'
      };

      // Mock the dependencies
      mockEnv.TRIAGE_BOT.categorize.mockResolvedValue(categoryResult);
      mockEnv.CRM_DATABASE.executeQuery.mockResolvedValue({
        message: 'Success',
        status: 200,
        queryExecuted: 'INSERT INTO leads...',
        results: JSON.stringify([{ id: 123 }])
      });
      mockEnv.RESPONSE_BOT.generate.mockResolvedValue(emailResponse);
      mockEnv.AGENT_MEMORY.log.mockResolvedValue(undefined);

      const result = await processEmailWorkflow(emailPayload, mockEnv);

      expect(result.status).toBe('processed');
      expect(result.category).toBe('ADD_LEAD');
      expect(result.sender_email).toBe('newlead@example.com');
      expect(result.db_action).toContain('INSERT');
      expect(result.response_email).toEqual(emailResponse);
      expect(result.requires_review).toBe(false);
      expect(result.error).toBeUndefined();

      // Verify workflow orchestration order
      expect(mockEnv.TRIAGE_BOT.categorize).toHaveBeenCalledWith(emailPayload);
      expect(mockEnv.CRM_DATABASE.executeQuery).toHaveBeenCalled();
      expect(mockEnv.RESPONSE_BOT.generate).toHaveBeenCalled();
      expect(mockEnv.AGENT_MEMORY.log).toHaveBeenCalled();
    });

    test('should handle IRRELEVANT category with no database action', async () => {
      const emailPayload: EmailPayload = {
        sender_email: 'spam@example.com',
        subject: 'Buy now!!!',
        body: 'This is spam'
      };

      const categoryResult: CategoryResult = {
        category: 'IRRELEVANT',
        reason: 'Spam or irrelevant content'
      };

      mockEnv.TRIAGE_BOT.categorize.mockResolvedValue(categoryResult);

      const result = await processEmailWorkflow(emailPayload, mockEnv);

      expect(result.status).toBe('processed');
      expect(result.category).toBe('IRRELEVANT');
      expect(result.db_action).toBe('No action taken');
      expect(result.response_email).toBeNull();
      expect(result.requires_review).toBe(false);

      // Verify no database operations for irrelevant emails
      expect(mockEnv.CRM_DATABASE.executeQuery).not.toHaveBeenCalled();
    });

    test('should handle AMBIGUOUS category with review flag', async () => {
      const emailPayload: EmailPayload = {
        sender_email: 'unclear@example.com',
        subject: 'Unclear request',
        body: 'This is unclear'
      };

      const categoryResult: CategoryResult = {
        category: 'AMBIGUOUS',
        reason: 'Content cannot be categorized clearly'
      };

      mockEnv.TRIAGE_BOT.categorize.mockResolvedValue(categoryResult);

      const result = await processEmailWorkflow(emailPayload, mockEnv);

      expect(result.status).toBe('processed');
      expect(result.category).toBe('AMBIGUOUS');
      expect(result.requires_review).toBe(true);
    });

    test('should handle AI model errors gracefully', async () => {
      const emailPayload: EmailPayload = {
        sender_email: 'test@example.com',
        subject: 'Test',
        body: 'Test body'
      };

      mockEnv.TRIAGE_BOT.categorize.mockRejectedValue(new AIModelError('Model unavailable', 'triage-model'));

      const result = await processEmailWorkflow(emailPayload, mockEnv);

      expect(result.status).toBe('error');
      expect(result.category).toBe('AMBIGUOUS');
      expect(result.requires_review).toBe(true);
      expect(result.error).toContain('Model unavailable');
    });

    test('should handle database errors gracefully', async () => {
      const emailPayload: EmailPayload = {
        sender_email: 'test@example.com',
        subject: 'Test',
        body: 'Test body'
      };

      const categoryResult: CategoryResult = {
        category: 'ADD_LEAD',
        reason: 'New lead detected'
      };

      mockEnv.TRIAGE_BOT.categorize.mockResolvedValue(categoryResult);
      mockEnv.CRM_DATABASE.executeQuery.mockRejectedValue(new DatabaseError('Connection failed', 'INSERT'));

      const result = await processEmailWorkflow(emailPayload, mockEnv);

      expect(result.status).toBe('error');
      expect(result.error).toContain('Connection failed');
      expect(result.requires_review).toBe(true);
    });
  });

  describe('orchestrateTriageBot', () => {
    test('should call triage bot and return category result', async () => {
      const emailPayload: EmailPayload = {
        sender_email: 'test@example.com',
        subject: 'Test Subject',
        body: 'Test body'
      };

      const expectedResult: CategoryResult = {
        category: 'ADD_LEAD',
        reason: 'New customer inquiry'
      };

      mockEnv.TRIAGE_BOT.categorize.mockResolvedValue(expectedResult);

      const result = await orchestrateTriageBot(emailPayload, mockEnv);

      expect(result).toEqual(expectedResult);
      expect(mockEnv.TRIAGE_BOT.categorize).toHaveBeenCalledWith(emailPayload);
    });

    test('should throw AIModelError on triage bot failure', async () => {
      const emailPayload: EmailPayload = {
        sender_email: 'test@example.com',
        subject: 'Test Subject',
        body: 'Test body'
      };

      mockEnv.TRIAGE_BOT.categorize.mockRejectedValue(new Error('Service unavailable'));

      await expect(orchestrateTriageBot(emailPayload, mockEnv)).rejects.toThrow(AIModelError);
      await expect(orchestrateTriageBot(emailPayload, mockEnv)).rejects.toThrow('Service unavailable');
    });
  });

  describe('manageDatabaseOperations', () => {
    test('should insert new lead for ADD_LEAD category', async () => {
      const email = 'newlead@example.com';
      const category: CategoryType = 'ADD_LEAD';

      mockEnv.CRM_DATABASE.executeQuery.mockResolvedValue({
        message: 'Success',
        status: 200,
        queryExecuted: 'INSERT INTO leads (email, status, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        results: JSON.stringify([{ id: 123 }])
      });

      const result = await manageDatabaseOperations(email, category, mockEnv);

      expect(result).toContain('INSERT INTO leads');
      expect(result).toContain('newlead@example.com');
      expect(mockEnv.CRM_DATABASE.executeQuery).toHaveBeenCalledWith({
        sqlQuery: expect.stringContaining('INSERT INTO leads'),
        format: 'json'
      });
    });

    test('should update existing lead for QUALIFY_LEAD category', async () => {
      const email = 'existing@example.com';
      const category: CategoryType = 'QUALIFY_LEAD';

      mockEnv.CRM_DATABASE.executeQuery.mockResolvedValue({
        message: 'Success',
        status: 200,
        queryExecuted: 'UPDATE leads SET status = ?, updated_at = ? WHERE email = ?',
        results: JSON.stringify([{ affectedRows: 1 }])
      });

      const result = await manageDatabaseOperations(email, category, mockEnv);

      expect(result).toContain('UPDATE leads');
      expect(result).toContain('Qualified');
      expect(mockEnv.CRM_DATABASE.executeQuery).toHaveBeenCalledWith({
        sqlQuery: expect.stringContaining('UPDATE leads'),
        format: 'json'
      });
    });

    test('should return no action for IRRELEVANT category', async () => {
      const email = 'spam@example.com';
      const category: CategoryType = 'IRRELEVANT';

      const result = await manageDatabaseOperations(email, category, mockEnv);

      expect(result).toBe('No action taken');
      expect(mockEnv.CRM_DATABASE.executeQuery).not.toHaveBeenCalled();
    });

    test('should throw DatabaseError on operation failure', async () => {
      const email = 'test@example.com';
      const category: CategoryType = 'ADD_LEAD';

      mockEnv.CRM_DATABASE.executeQuery.mockRejectedValue(new Error('Database connection failed'));

      await expect(manageDatabaseOperations(email, category, mockEnv)).rejects.toThrow(DatabaseError);
      await expect(manageDatabaseOperations(email, category, mockEnv)).rejects.toThrow('Database connection failed');
    });
  });

  describe('orchestrateResponseBot', () => {
    test('should generate appropriate response for ADD_LEAD', async () => {
      const category: CategoryType = 'ADD_LEAD';
      const emailPayload: EmailPayload = {
        sender_email: 'newlead@example.com',
        subject: 'Interest in service',
        body: 'I am interested'
      };

      const expectedResponse: EmailResponse = {
        to: 'newlead@example.com',
        subject: 'Re: Interest in service',
        body: 'Thank you for your interest...'
      };

      mockEnv.RESPONSE_BOT.generate.mockResolvedValue(expectedResponse);

      const result = await orchestrateResponseBot(category, emailPayload, mockEnv);

      expect(result).toEqual(expectedResponse);
      expect(mockEnv.RESPONSE_BOT.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          category,
          emailPayload
        })
      );
    });

    test('should return null for IRRELEVANT category', async () => {
      const category: CategoryType = 'IRRELEVANT';
      const emailPayload: EmailPayload = {
        sender_email: 'spam@example.com',
        subject: 'Spam',
        body: 'Spam content'
      };

      const result = await orchestrateResponseBot(category, emailPayload, mockEnv);

      expect(result).toBeNull();
      expect(mockEnv.RESPONSE_BOT.generate).not.toHaveBeenCalled();
    });

    test('should throw AIModelError on response generation failure', async () => {
      const category: CategoryType = 'ADD_LEAD';
      const emailPayload: EmailPayload = {
        sender_email: 'test@example.com',
        subject: 'Test',
        body: 'Test'
      };

      mockEnv.RESPONSE_BOT.generate.mockRejectedValue(new Error('Response bot unavailable'));

      await expect(orchestrateResponseBot(category, emailPayload, mockEnv)).rejects.toThrow(AIModelError);
      await expect(orchestrateResponseBot(category, emailPayload, mockEnv)).rejects.toThrow('Response bot unavailable');
    });
  });

  describe('logInteraction', () => {
    test('should log interaction to agent memory', async () => {
      const interaction: InteractionLog = {
        id: 'test-123',
        timestamp: new Date(),
        email_payload: {
          sender_email: 'test@example.com',
          subject: 'Test',
          body: 'Test body'
        },
        category_result: {
          category: 'ADD_LEAD',
          reason: 'New lead'
        },
        response_generated: {
          to: 'test@example.com',
          subject: 'Re: Test',
          body: 'Response'
        },
        db_action: 'INSERT INTO leads'
      };

      mockEnv.AGENT_MEMORY.log.mockResolvedValue(undefined);

      await logInteraction(interaction, mockEnv);

      expect(mockEnv.AGENT_MEMORY.log).toHaveBeenCalledWith(interaction);
    });

    test('should throw KnowledgeRetrievalError on memory failure', async () => {
      const interaction: InteractionLog = {
        id: 'test-123',
        timestamp: new Date(),
        email_payload: {
          sender_email: 'test@example.com',
          subject: 'Test',
          body: 'Test body'
        },
        category_result: {
          category: 'ADD_LEAD',
          reason: 'New lead'
        },
        response_generated: {
          to: 'test@example.com',
          subject: 'Re: Test',
          body: 'Response'
        },
        db_action: 'INSERT INTO leads'
      };

      mockEnv.AGENT_MEMORY.log.mockRejectedValue(new Error('Memory service unavailable'));

      await expect(logInteraction(interaction, mockEnv)).rejects.toThrow(KnowledgeRetrievalError);
      await expect(logInteraction(interaction, mockEnv)).rejects.toThrow('Memory service unavailable');
    });
  });
});