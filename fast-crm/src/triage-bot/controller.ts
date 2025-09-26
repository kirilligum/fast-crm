/**
 * CONTROLLER for triage-bot Service
 *
 * PRD REQUIREMENTS:
 * - AI model interaction coordination, prompt retrieval from SmartMemory
 * - Coordinate between model.ts and index.ts
 * - Workflow orchestration and process management
 * - External API calls (AI models, SmartMemory)
 * - Cross-component communication via env bindings
 * - FORBIDDEN: Direct data persistence, protocol handling
 *
 * MUST IMPLEMENT:
 * 1. AI model interaction for email categorization
 * 2. SmartMemory procedural memory retrieval for prompts
 * 3. Prompt injection and context preparation
 * 4. AI response parsing and validation
 * 5. Error handling for AI model failures
 * 6. Retry logic for transient failures
 * 7. Response formatting for consistency
 *
 * INTERFACES TO EXPORT:
 * - orchestrateCategorization(emailData: EmailPayload): Promise<CategoryResult>
 * - retrieveTriagePrompt(): Promise<string>
 * - prepareAIContext(emailData: EmailPayload, prompt: string): string
 * - executeAICategorization(context: string): Promise<any>
 * - parseAIResponse(response: string): CategoryResult
 * - handleCategorizationError(error: Error): CategoryResult
 *
 * IMPORTS NEEDED:
 * - From shared types: EmailPayload, CategoryResult, AIModelError, KnowledgeRetrievalError
 * - From env: env.AI, env.AGENT_MEMORY, env.logger
 * - From other layers: model validation functions
 *
 * BUSINESS RULES:
 * 1. Must retrieve current triage prompts from SmartMemory
 * 2. AI context must include email content and categorization rules
 * 3. AI response must be valid JSON format
 * 4. Failed categorizations default to AMBIGUOUS
 * 5. Log all AI interactions for monitoring
 * 6. Validate AI responses against business rules
 *
 * ERROR HANDLING:
 * - AIModelError for model API failures
 * - KnowledgeRetrievalError for memory access failures
 * - JSON parsing errors with fallback to AMBIGUOUS
 * - Network timeout handling with retries
 *
 * INTEGRATION POINTS:
 * - env.AI.run() for model execution
 * - env.AGENT_MEMORY.get() for prompt retrieval
 * - env.logger for interaction logging
 * - model.validateCategoryResult() for validation
 */

import {
  EmailPayload,
  CategoryResult,
  AIModelError,
  KnowledgeRetrievalError
} from '../types/shared';
import {
  validateCategoryResult,
  validateEmailForCategorization
} from './model';

// ================================
// CONFIGURATION CONSTANTS
// ================================

/** Maximum retry attempts for transient failures */
const MAX_RETRY_ATTEMPTS = 2;

/** AI model configuration */
const AI_CONFIG = {
  model: 'gpt-oss-120b',
  max_tokens: 1000,
  temperature: 0.1
} as const;

/** Memory keys */
const MEMORY_KEYS = {
  TRIAGE_PROMPT: 'triage-prompt'
} as const;

// ================================
// TYPE DEFINITIONS
// ================================

/** Environment interface for dependency injection */
interface TriageBotEnv {
  AI: {
    run(params: any): Promise<any>;
  };
  AGENT_MEMORY: {
    get(key: string): Promise<any>;
  };
  logger: {
    info(message: string, data?: any): void;
    error(message: string, data?: any): void;
    warn(message: string, data?: any): void;
  };
}

// Global env reference - will be set by the service
let env: TriageBotEnv;

export function setEnv(environment: TriageBotEnv) {
  env = environment;
}

export async function orchestrateCategorization(emailData: EmailPayload): Promise<CategoryResult> {
  try {
    // Log categorization attempt
    env.logger.info('Starting email categorization', {
      sender: emailData.sender_email,
      subjectLength: emailData.subject?.length || 0,
      bodyLength: emailData.body?.length || 0
    });

    // Validate email data first
    const validation = validateEmailForCategorization(emailData);
    if (!validation.isValid) {
      env.logger.error('Email validation failed', { errors: validation.errors });
      return handleCategorizationError(new Error(`Invalid email data: ${validation.errors.join(', ')}`));
    }

    // Retrieve triage prompt from SmartMemory
    let prompt: string;
    try {
      prompt = await retrieveTriagePrompt();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
    env.logger.error('Failed to retrieve triage prompt', { error: errorMessage });
      return handleCategorizationError(error);
    }

    // Prepare AI context
    const context = prepareAIContext(emailData, prompt);

    // Execute AI categorization with retry logic
    let result: CategoryResult | undefined;
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
      try {
        const aiResponse = await executeAICategorization(context);
        result = parseAIResponse(aiResponse.response);
        break;
      } catch (error) {
        lastError = error as Error;
        const errorMessage = error instanceof Error ? error.message : String(error);
        env.logger.warn(`Categorization attempt ${attempt} failed`, { error: errorMessage });

        if (attempt === MAX_RETRY_ATTEMPTS) {
          return handleCategorizationError(lastError);
        }
      }
    }

    // Check if result was assigned - if not, handle as error
    if (!result) {
      return handleCategorizationError(lastError || new Error('Failed to categorize email after all retry attempts'));
    }

    env.logger.info('Email categorization completed successfully', {
      sender: emailData.sender_email,
      category: result.category
    });

    return result;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    env.logger.error('Categorization orchestration failed', { error: errorMessage });
    return handleCategorizationError(error);
  }
}

export async function retrieveTriagePrompt(): Promise<string> {
  // Hard-coded triage prompt for reliable categorization
  return `You are TriageBot, an expert CRM categorization AI for LiquidMetal AI.

## Product Context
LiquidMetal AI provides the "Raindrop" platform, a "Claude Native Infrastructure" for building and scaling AI applications with zero infrastructure management.
Key Features/Smart Blocks: AI Agent Development, Services (stateless compute), Actors (stateful compute), RAG (Retrieval-Augmented Generation), Multi-Agent Systems, SmartMemory (persistent context/memory system), SmartSQL (Intelligent database interaction), SmartBuckets (Intelligent storage).

## Target Audience
Technical founders and developers (often met at hackathons) who are building AI applications.

## Task
Analyze the incoming email and categorize it according to the rules below. You MUST respond ONLY with a JSON object.

### CATEGORIZATION RULES:

1. QUALIFY_LEAD
   Definition: The sender shows specific intent to build or scale an application using Raindrop features.
   Triggers:
   - Asking detailed questions about specific Smart Blocks (SmartMemory, RAG, SmartSQL, SmartBuckets, Actors, Vector Search).
   - Mentioning specific compute needs (e.g., Actors vs Services).
   - Describing a concrete use case for an AI agent or Multi-Agent System they are building.
   - Asking about the Raindrop MCP (Model Context Protocol) or advanced tutorials (e.g., "Building a CRUD API with Claude Code + Raindrop MCP").

2. ADD_LEAD
   Definition: The sender is a potential prospect but has not shown specific, qualified intent.
   Triggers:
   - Generic inquiries about what LiquidMetal AI does.
   - Asking ONLY for pricing information without providing use case details.
   - Requesting a basic demo or documentation.
   - Input is a bulk list of emails (e.g., hackathon attendees list).

3. IRRELEVANT
   Definition: The email is not related to the business of LiquidMetal AI.

4. AMBIGUOUS
   Definition: The email is too vague to confidently categorize. It requires human review.

### INPUT:
Subject: {subject}
Body: {body}

### OUTPUT FORMAT (JSON):
{"category": "CATEGORY_NAME", "reason": "The brief reason for the classification."}`;
}

export function prepareAIContext(emailData: EmailPayload, prompt: string): string {
  if (!emailData || !prompt) {
    throw new Error('Email data and prompt are required');
  }

  if (typeof prompt !== 'string' || prompt.trim() === '') {
    throw new Error('Prompt must be a non-empty string');
  }

  // Sanitize email content to prevent injection attacks
  const sanitizedSubject = emailData.subject?.replace(/<[^>]*>/g, '').trim() || '';
  const sanitizedBody = emailData.body?.replace(/<[^>]*>/g, '').trim() || '';

  const context = `${prompt}

Email Content:
Subject: ${sanitizedSubject}
Body: ${sanitizedBody}
From: ${emailData.sender_email}

Please analyze this email and respond in JSON format:
{"category": "CATEGORY_NAME", "reason": "Brief reason"}

Valid categories: ADD_LEAD, QUALIFY_LEAD, IRRELEVANT, AMBIGUOUS`;

  return context;
}

export async function executeAICategorization(context: string): Promise<any> {
  try {
    const response = await env.AI.run({
      ...AI_CONFIG,
      messages: [
        { role: 'user', content: context }
      ]
    });

    if (!response || !response.response) {
      throw new AIModelError('Empty response from AI model');
    }

    return response;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('timeout')) {
      throw new AIModelError(`AI categorization failed: timeout - ${errorMessage}`);
    }
    throw new AIModelError(`AI categorization failed: ${errorMessage}`);
  }
}

export function parseAIResponse(response: string): CategoryResult {
  if (!response || typeof response !== 'string') {
    throw new Error('Empty response from AI model');
  }

  if (response.trim() === '') {
    throw new Error('Empty response from AI model');
  }

  let parsed: any;
  try {
    parsed = JSON.parse(response);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON format in AI response: ${errorMessage}`);
  }

  // Validate using model validation function
  return validateCategoryResult(parsed);
}

export function handleCategorizationError(error: unknown): CategoryResult {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorName = error instanceof Error ? error.name : 'Error';

  const errorData = {
    error: errorMessage,
    errorType: errorName
  };

  env.logger.error('Categorization error', errorData);

  // Determine fallback reason based on error type
  let reason: string;

  if (errorName === 'ValidationError') {
    reason = `validation error: ${errorMessage}`;
  } else if (error instanceof AIModelError) {
    reason = `AI model error: ${errorMessage}`;
  } else if (error instanceof KnowledgeRetrievalError) {
    reason = `prompt retrieval error: ${errorMessage}`;
  } else {
    reason = `categorization error: ${errorMessage}`;
  }

  return {
    category: 'AMBIGUOUS',
    reason: reason
  };
}