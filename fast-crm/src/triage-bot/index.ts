/**
 * VIEW LAYER + EXPORTS for triage-bot Service
 *
 * PRD REQUIREMENTS:
 * - Service interface for categorization requests, input sanitization
 * - Service method definitions (for internal services)
 * - Input validation and sanitization
 * - Response formatting and export interfaces
 * - FORBIDDEN: Business logic, data persistence
 *
 * MUST IMPLEMENT:
 * 1. categorize() method for external service calls
 * 2. Input sanitization and validation
 * 3. Response formatting for consistency
 * 4. Error handling with proper error types
 * 5. fetch() method (required but returns not implemented)
 * 6. Public interface for service-to-service communication
 * 7. Logging of all categorization requests
 *
 * INTERFACES TO EXPORT:
 * - fetch(request: Request): Promise<Response> (returns not implemented)
 * - categorize(emailData: EmailPayload): Promise<CategoryResult>
 * - sanitizeInput(emailData: any): EmailPayload
 * - formatResponse(result: CategoryResult): CategoryResult
 * - handleError(error: Error): CategoryResult
 *
 * IMPORTS NEEDED:
 * - From shared types: EmailPayload, CategoryResult, ValidationError, AIModelError
 * - From env: env.logger for request logging
 * - From other layers: controller.orchestrateCategorization(), model validation functions
 *
 * BUSINESS RULES:
 * 1. categorize() is the main public interface method
 * 2. Input must be validated before processing
 * 3. All errors must be handled gracefully
 * 4. fetch() must return "not implemented" as this is internal service
 * 5. Log all categorization attempts
 * 6. Return consistent CategoryResult format
 *
 * ERROR HANDLING:
 * - ValidationError for invalid input
 * - AIModelError for categorization failures
 * - Return AMBIGUOUS category for unhandled errors
 * - Structured error logging
 *
 * INTEGRATION POINTS:
 * - Called by env.TRIAGE_BOT.categorize() from crm-service
 * - Calls controller.orchestrateCategorization() for business logic
 * - Uses model validation functions for input checking
 * - Logs via env.logger for monitoring
 */

import { Service, ExecutionContext } from '@liquidmetal-ai/raindrop-framework';
import { Env } from './raindrop.gen';
import {
  EmailPayload,
  CategoryResult,
  ValidationError,
  AIModelError
} from '../types/shared';
import { setEnv, orchestrateCategorization } from './controller';

export default class TriageBotService extends Service<Env> {
  constructor(ctx: ExecutionContext, env: Env) {
    super(ctx, env);
    // Set the environment for the controller
    setEnv({
      AI: env.AI ? {
        run: async (params: any): Promise<any> => {
          const result = await env.AI.run('gpt-oss-120b', {
            model: 'gpt-oss-120b',
            messages: params.messages,
            max_tokens: params.max_tokens || 1000,
            temperature: params.temperature || 0.1
          });
          // Handle the AI response safely based on actual type
          if ('choices' in result && result.choices && result.choices.length > 0) {
            const content = result.choices[0]?.message?.content;
            if (content) {
              return {
                response: content
              };
            }
          }
          throw new Error('Invalid AI response format');
        }
      } : {
        run: async (): Promise<any> => ({ response: 'mocked response' })
      },
      AGENT_MEMORY: env.AGENT_MEMORY ? {
        get: async (key: string): Promise<any> => {
          // SmartMemory doesn't have get method, need to use working memory session
          if (!env.AGENT_MEMORY) return null;
          const session = await env.AGENT_MEMORY.startWorkingMemorySession();
          const memories = await session?.workingMemory?.getMemory({ key, nMostRecent: 1 });
          return memories && memories.length > 0 ? memories[0]?.content : null;
        }
      } : {
        get: async (): Promise<any> => null
      },
      logger: env.logger || {
        info: console.log,
        error: console.error,
        warn: console.warn
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    this.env.logger?.warn('HTTP request to internal service', {
      url: request.url,
      method: request.method
    });

    return new Response('This service is not implemented for HTTP requests. This is an internal service.', {
      status: 501,
      headers: { 'Content-Type': 'text/plain' }
    });
  }

  async categorize(emailData: EmailPayload): Promise<CategoryResult> {
    try {
      // Log categorization request
      this.env.logger?.info('Email categorization request', {
        sender: emailData.sender_email,
        subjectLength: emailData.subject?.length || 0,
        bodyLength: emailData.body?.length || 0
      });

      // Sanitize input
      const sanitizedEmail = this.sanitizeInput(emailData);

      // Orchestrate categorization through controller
      const result = await orchestrateCategorization(sanitizedEmail);

      // Format response
      const formattedResult = this.formatResponse(result);

      // Log completion
      this.env.logger?.info('Email categorization completed', {
        sender: emailData.sender_email,
        category: formattedResult.category
      });

      return formattedResult;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorType = error instanceof Error ? error.name : 'Error';
      this.env.logger?.error('TriageBot service error', {
        error: errorMessage,
        errorType: errorType,
        sender: emailData?.sender_email
      });

      return this.handleError(error);
    }
  }

  sanitizeInput(emailData: any): EmailPayload {
    if (!emailData) {
      throw new ValidationError('Email data is required');
    }

    if (!emailData.sender_email) {
      throw new ValidationError('Sender email is required');
    }

    if (!emailData.subject) {
      throw new ValidationError('Subject is required');
    }

    if (!emailData.body) {
      throw new ValidationError('Body is required');
    }

    // Sanitize HTML content
    const sanitizeHtml = (text: string): string => {
      return text?.replace(/<[^>]*>/g, '')?.trim() || '';
    };

    return {
      sender_email: emailData.sender_email.trim(),
      subject: sanitizeHtml(emailData.subject),
      body: sanitizeHtml(emailData.body)
    };
  }

  formatResponse(result: CategoryResult): CategoryResult {
    if (!result || typeof result !== 'object') {
      throw new ValidationError('Invalid category result');
    }

    if (!['ADD_LEAD', 'QUALIFY_LEAD', 'IRRELEVANT', 'AMBIGUOUS'].includes(result.category)) {
      throw new ValidationError('Invalid category type');
    }

    return {
      category: result.category,
      reason: result.reason?.trim() || ''
    };
  }

  handleError(error: unknown): CategoryResult {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorType = error instanceof Error ? error.name : 'Error';

    this.env.logger?.error('TriageBot service error', {
      error: errorMessage,
      errorType: errorType
    });

    let reason: string;

    if (error instanceof ValidationError) {
      reason = `validation error: ${errorMessage}`;
    } else if (error instanceof AIModelError) {
      reason = `AI model error: ${errorMessage}`;
    } else {
      reason = `categorization error: ${errorMessage}`;
    }

    return {
      category: 'AMBIGUOUS',
      reason: reason
    };
  }
}
