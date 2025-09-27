/**
 * COMPREHENSIVE TESTS for response-bot CONTROLLER
 *
 * TDD RED PHASE: Write failing tests FIRST
 * These tests define the expected behavior for orchestration,
 * AI model interaction, knowledge retrieval, and response generation.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  orchestrateResponseGeneration,
  retrieveResponsePrompt,
  retrieveKnowledgeBase,
  prepareResponseContext,
  executeAIGeneration,
  parseAIResponse,
  handleGenerationError,
  setControllerEnv
} from './controller';
import {
  EmailPayload,
  EmailResponse,
  CategoryType,
  AIModelError,
  KnowledgeRetrievalError,
  TemplateError
} from '../types/shared';

// Mock env dependencies
const mockEnv = {
  AI: {
    run: vi.fn()
  },
  AGENT_MEMORY: {
    get: vi.fn(),
    search: vi.fn()
  },
  EMAIL_HISTORY: {
    put: vi.fn(),
    search: vi.fn()
  },
  ADVISOR_KNOWLEDGE: {
    search: vi.fn()
  },
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }
};

describe('response-bot Controller - Orchestration', () => {
  const mockEmailData: EmailPayload = {
    sender_email: 'prospect@startup.com',
    subject: 'Interested in AI platform',
    body: 'We are building an AI application and need a scalable platform.'
  };

  beforeEach(() => {
    vi.clearAllMocks();
    setControllerEnv(mockEnv);
  });

  test('should orchestrate complete response generation for ADD_LEAD', async () => {
    // Mock knowledge retrieval
    mockEnv.AGENT_MEMORY.get.mockResolvedValueOnce('Response system prompt...');
    mockEnv.AGENT_MEMORY.search.mockResolvedValueOnce('Raindrop knowledge base...');

    // Mock AI generation
    mockEnv.AI.run.mockResolvedValueOnce('Thank you for your interest in Raindrop. Our AI-native platform helps technical founders build and scale intelligent applications...');

    const result = await orchestrateResponseGeneration('ADD_LEAD', mockEmailData);

    expect(result).toMatchObject({
      to: 'prospect@startup.com',
      subject: 'Re: Interested in AI platform',
      body: expect.stringContaining('Thank you for your interest')
    });
    expect(mockEnv.AGENT_MEMORY.get).toHaveBeenCalledWith('response_prompt_ADD_LEAD');
    expect(mockEnv.AGENT_MEMORY.search).toHaveBeenCalledWith('raindrop knowledge base platform documentation');
  });

  test('should orchestrate complete response generation for QUALIFY_LEAD', async () => {
    const qualifyEmailData: EmailPayload = {
      sender_email: 'dev@techcorp.com',
      subject: 'Technical requirements for AI integration',
      body: 'We need to integrate AI capabilities into our existing infrastructure.'
    };

    mockEnv.AGENT_MEMORY.get.mockResolvedValueOnce('Response system prompt for qualification...');
    mockEnv.AGENT_MEMORY.search.mockResolvedValueOnce('Raindrop technical documentation...');
    mockEnv.AI.run.mockResolvedValueOnce('Thank you for reaching out about your AI integration needs. Based on your requirements, our SmartMemory and SmartSQL components could be ideal...');

    const result = await orchestrateResponseGeneration('QUALIFY_LEAD', qualifyEmailData);

    expect(result).toMatchObject({
      to: 'dev@techcorp.com',
      subject: 'Re: Technical requirements for AI integration',
      body: expect.stringContaining('SmartMemory')
    });
  });

  test('should handle knowledge retrieval failure gracefully', async () => {
    mockEnv.AGENT_MEMORY.get.mockRejectedValueOnce(new Error('Memory service unavailable'));

    const result = await orchestrateResponseGeneration('ADD_LEAD', mockEmailData);

    expect(result).toMatchObject({
      to: 'prospect@startup.com',
      subject: 'Re: Interested in AI platform',
      body: expect.stringContaining('Thank you for your inquiry')
    });
    expect(mockEnv.logger.error).toHaveBeenCalled();
  });

  test('should handle AI generation failure gracefully', async () => {
    mockEnv.AGENT_MEMORY.get.mockResolvedValueOnce('System prompt');
    mockEnv.AGENT_MEMORY.search.mockResolvedValueOnce('Knowledge base');
    mockEnv.AI.run.mockRejectedValueOnce(new Error('AI service unavailable'));

    const result = await orchestrateResponseGeneration('ADD_LEAD', mockEmailData);

    expect(result.body).toContain('Thank you for your inquiry');
    expect(mockEnv.logger.error).toHaveBeenCalled();
  });
});

describe('response-bot Controller - Knowledge Retrieval', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setControllerEnv(mockEnv);
  });

  test('should retrieve ADD_LEAD response prompt', async () => {
    const mockPrompt = 'You are ResponseBot for ADD_LEAD category...';
    mockEnv.AGENT_MEMORY.get.mockResolvedValueOnce(mockPrompt);

    const prompt = await retrieveResponsePrompt('ADD_LEAD');

    expect(prompt).toBe(mockPrompt);
    expect(mockEnv.AGENT_MEMORY.get).toHaveBeenCalledWith('response_prompt_ADD_LEAD');
  });

  test('should retrieve QUALIFY_LEAD response prompt', async () => {
    const mockPrompt = 'You are ResponseBot for QUALIFY_LEAD category...';
    mockEnv.AGENT_MEMORY.get.mockResolvedValueOnce(mockPrompt);

    const prompt = await retrieveResponsePrompt('QUALIFY_LEAD');

    expect(prompt).toBe(mockPrompt);
    expect(mockEnv.AGENT_MEMORY.get).toHaveBeenCalledWith('response_prompt_QUALIFY_LEAD');
  });

  test('should throw KnowledgeRetrievalError when prompt not found', async () => {
    mockEnv.AGENT_MEMORY.get.mockResolvedValueOnce(null);

    await expect(retrieveResponsePrompt('ADD_LEAD')).rejects.toThrow(KnowledgeRetrievalError);
  });

  test('should retrieve complete knowledge base', async () => {
    const mockKnowledge = [
      { content: 'Raindrop Smart Blocks documentation...' },
      { content: 'Platform capabilities and tutorials...' }
    ];
    mockEnv.AGENT_MEMORY.search.mockResolvedValueOnce(mockKnowledge);

    const knowledge = await retrieveKnowledgeBase();

    expect(knowledge).toContain('Raindrop Smart Blocks');
    expect(knowledge).toContain('Platform capabilities');
    expect(mockEnv.AGENT_MEMORY.search).toHaveBeenCalledWith('raindrop knowledge base platform documentation');
  });

  test('should handle empty knowledge base gracefully', async () => {
    mockEnv.AGENT_MEMORY.search.mockResolvedValueOnce([]);

    const knowledge = await retrieveKnowledgeBase();

    expect(knowledge).toContain('Raindrop is an AI-native platform'); // Fallback knowledge
  });
});

describe('response-bot Controller - Context Preparation', () => {
  test('should prepare context for ADD_LEAD response', () => {
    const emailData: EmailPayload = {
      sender_email: 'startup@example.com',
      subject: 'Looking for AI platform',
      body: 'We need an AI solution for our startup.'
    };
    const knowledge = 'Raindrop offers SmartMemory, SmartSQL...';

    const context = prepareResponseContext('ADD_LEAD', emailData, knowledge);

    expect(context).toContain('Category: ADD_LEAD');
    expect(context).toContain('startup@example.com');
    expect(context).toContain('Looking for AI platform');
    expect(context).toContain('SmartMemory');
    expect(context).toContain('value proposition');
    expect(context).toContain('free trial');
  });

  test('should prepare context for QUALIFY_LEAD response', () => {
    const emailData: EmailPayload = {
      sender_email: 'tech@corp.com',
      subject: 'Technical integration requirements',
      body: 'We need specific technical details about your API.'
    };
    const knowledge = 'Raindrop provides REST APIs, SDKs...';

    const context = prepareResponseContext('QUALIFY_LEAD', emailData, knowledge);

    expect(context).toContain('Category: QUALIFY_LEAD');
    expect(context).toContain('tech@corp.com');
    expect(context).toContain('Technical integration');
    expect(context).toContain('REST APIs');
    expect(context).toContain('probing questions');
    expect(context).toContain('validate use case');
  });

  test('should handle missing knowledge gracefully', () => {
    const emailData: EmailPayload = {
      sender_email: 'test@example.com',
      subject: 'Test',
      body: 'Test body'
    };

    const context = prepareResponseContext('ADD_LEAD', emailData, '');

    expect(context).toContain('Category: ADD_LEAD');
    expect(context).toContain('test@example.com');
  });
});

describe('response-bot Controller - AI Generation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setControllerEnv(mockEnv);
  });

  test('should execute AI generation with proper context', async () => {
    const mockResponse = 'Thank you for your interest in Raindrop...';
    mockEnv.AI.run.mockResolvedValueOnce(mockResponse);

    const context = 'System prompt and context...';
    const result = await executeAIGeneration(context);

    expect(result).toBe(mockResponse);
    expect(mockEnv.AI.run).toHaveBeenCalledWith(context);
  });

  test('should throw AIModelError on generation failure', async () => {
    mockEnv.AI.run.mockRejectedValueOnce(new Error('Model timeout'));

    const context = 'System prompt and context...';

    await expect(executeAIGeneration(context)).rejects.toThrow(AIModelError);
  });

  test('should handle empty AI response', async () => {
    mockEnv.AI.run.mockResolvedValueOnce('');

    const context = 'System prompt and context...';

    await expect(executeAIGeneration(context)).rejects.toThrow(AIModelError);
  });
});

describe('response-bot Controller - Response Parsing', () => {
  test('should parse valid AI response into EmailResponse', () => {
    const aiResponse = `
Subject: Re: Your inquiry about Raindrop
Body: Thank you for your interest in Raindrop. Our AI-native platform helps technical founders build and scale intelligent applications.
    `;

    const parsed = parseAIResponse(aiResponse, 'prospect@startup.com');

    expect(parsed).toMatchObject({
      to: 'prospect@startup.com',
      subject: 'Re: Your inquiry about Raindrop',
      body: expect.stringContaining('Thank you for your interest')
    });
  });

  test('should handle AI response without explicit structure', () => {
    const aiResponse = 'Thank you for reaching out about Raindrop. We appreciate your interest...';

    const parsed = parseAIResponse(aiResponse, 'user@example.com');

    expect(parsed.to).toBe('user@example.com');
    expect(parsed.subject).toMatch(/^Re:/);
    expect(parsed.body).toContain('Thank you for reaching out');
  });

  test('should throw AIModelError for invalid AI response', () => {
    const invalidResponse = '';

    expect(() => parseAIResponse(invalidResponse, 'user@example.com')).toThrow(AIModelError);
  });
});

describe('response-bot Controller - Error Handling', () => {
  test('should create fallback response for AIModelError', () => {
    const error = new AIModelError('Model service unavailable');
    const emailData: EmailPayload = {
      sender_email: 'user@example.com',
      subject: 'Test inquiry',
      body: 'Test body'
    };

    const fallback = handleGenerationError(error, emailData);

    expect(fallback).toMatchObject({
      to: 'user@example.com',
      subject: 'Re: Test inquiry',
      body: expect.stringContaining('Thank you for your inquiry')
    });
  });

  test('should create fallback response for KnowledgeRetrievalError', () => {
    const error = new KnowledgeRetrievalError('Memory service down');
    const emailData: EmailPayload = {
      sender_email: 'user@example.com',
      subject: 'Technical question',
      body: 'Technical body'
    };

    const fallback = handleGenerationError(error, emailData);

    expect(fallback.body).toContain('Thank you for your inquiry');
    expect(fallback.body).toContain('team will review');
  });

  test('should create fallback response for unknown errors', () => {
    const error = new Error('Unknown service error');
    const emailData: EmailPayload = {
      sender_email: 'user@example.com',
      subject: 'General inquiry',
      body: 'General body'
    };

    const fallback = handleGenerationError(error, emailData);

    expect(fallback.body).toContain('Thank you for reaching out');
  });
});