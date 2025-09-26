/**
 * VIEW LAYER + EXPORTS for response-bot Service
 *
 * PRD REQUIREMENTS:
 * - Service interface for response generation, output formatting
 * - Service method definitions (for internal services)
 * - Input validation and sanitization
 * - Response formatting and export interfaces
 * - FORBIDDEN: Business logic, data persistence
 *
 * MUST IMPLEMENT:
 * 1. generate() method for external service calls
 * 2. Input validation for category and email data
 * 3. Response formatting and structure validation
 * 4. Error handling with appropriate fallbacks
 * 5. fetch() method (required but returns not implemented)
 * 6. Public interface for service-to-service communication
 * 7. Logging of all response generation requests
 *
 * INTERFACES TO EXPORT:
 * - fetch(request: Request): Promise<Response> (returns not implemented)
 * - generate(category: CategoryType, emailData: EmailPayload): Promise<EmailResponse>
 * - validateInput(category: any, emailData: any): ValidationResult
 * - formatResponse(response: EmailResponse): EmailResponse
 * - handleError(error: Error): EmailResponse
 * - sanitizeEmailData(emailData: any): EmailPayload
 *
 * IMPORTS NEEDED:
 * - From shared types: EmailPayload, EmailResponse, CategoryType, ValidationError, TemplateError
 * - From env: env.logger for request logging
 * - From other layers: controller.orchestrateResponseGeneration(), model validation functions
 *
 * BUSINESS RULES:
 * 1. generate() is the main public interface method
 * 2. Category must be valid CategoryType
 * 3. Email data must be properly structured
 * 4. All errors must be handled gracefully
 * 5. fetch() must return "not implemented" as this is internal service
 * 6. Log all generation attempts with category and email
 * 7. Return consistent EmailResponse format
 *
 * ERROR HANDLING:
 * - ValidationError for invalid input parameters
 * - TemplateError for response generation failures
 * - Return generic professional response for unhandled errors
 * - Structured error logging with context
 *
 * INTEGRATION POINTS:
 * - Called by env.RESPONSE_BOT.generate() from crm-service
 * - Calls controller.orchestrateResponseGeneration() for business logic
 * - Uses model validation functions for input/output checking
 * - Logs via env.logger for monitoring
 */

import { Service, ExecutionContext } from '@liquidmetal-ai/raindrop-framework';
import { Env } from './raindrop.gen';
import {
  EmailPayload,
  EmailResponse,
  CategoryType,
  ValidationError,
  TemplateError
} from '../types/shared';
import {
  orchestrateResponseGeneration,
  setControllerEnv
} from './controller';
import {
  validateEmailResponse,
  formatResponseContent
} from './model';

interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export default class ResponseBotService extends Service<Env> {
  constructor(ctx: ExecutionContext, env: Env) {
    super(ctx, env);

    // Set up the controller environment with real env bindings
    setControllerEnv({
      AI: env?.AI ? {
        run: async (context: string): Promise<string> => {
          const result = await env.AI.run('gpt-oss-120b', {
            model: 'gpt-oss-120b',
            messages: [{ role: 'user', content: context }],
            max_tokens: 1000
          });
          // Handle the AI response safely based on actual type
          if ('choices' in result && result.choices && result.choices.length > 0) {
            const content = result.choices[0]?.message?.content;
            if (content) {
              return content;
            }
          }
          throw new Error('Invalid AI response format');

        }
      } : { run: async () => 'mocked response' },
      AGENT_MEMORY: env?.AGENT_MEMORY ? {
        get: async (key: string): Promise<string | null> => {
          // SmartMemory doesn't have get method, need to use working memory session
          if (!env?.AGENT_MEMORY) return null;
          const session = await env.AGENT_MEMORY.startWorkingMemorySession();
          const memories = await session?.workingMemory?.getMemory({ key, nMostRecent: 1 });
          return memories && memories.length > 0 ? (memories[0]?.content || null) : null;
        },
        search: async (query: string): Promise<Array<{ content: string }>> => {
          // SmartMemory search through working memory
          if (!env?.AGENT_MEMORY) return [];
          const session = await env.AGENT_MEMORY.startWorkingMemorySession();
          const memories = await session.workingMemory.searchMemory({ terms: query, nMostRecent: 10 });
          return memories ? memories.map(m => ({ content: m.content })) : [];
        }
      } : { get: async () => null, search: async () => [] },
      logger: env?.logger || {
        info: console.log,
        error: console.error,
        warn: console.warn
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    return new Response('Request received');
  }

  async generate(category: CategoryType, emailData: EmailPayload): Promise<EmailResponse> {
    try {
      // Log generation start
      this.env?.logger?.info('Response generation started', {
        category,
        sender: emailData.sender_email
      });

      // Step 1: Sanitize email data first
      const sanitizedEmailData = this.sanitizeEmailData(emailData);

      // Step 2: Validate input after sanitization
      const validation = this.validateInput(category, sanitizedEmailData);
      if (!validation.isValid) {
        const error = new ValidationError(validation.errors.join(', '));
        this.env?.logger?.error('Input validation failed', { errors: validation.errors });
        throw error;
      }

      // Step 3: Orchestrate response generation
      const response = await orchestrateResponseGeneration(category, sanitizedEmailData);

      // Step 4: Format response
      const formattedResponse = this.formatResponse(response);

      // Log successful completion
      this.env?.logger?.info('Response generation completed', {
        category,
        sender: emailData.sender_email
      });

      return formattedResponse;

    } catch (error) {
      // If it's a ValidationError from input validation, re-throw it
      if (error instanceof ValidationError) {
        throw error;
      }

      this.env?.logger?.error('Response generation failed', {
        error: (error as Error).message,
        category,
        sender: emailData.sender_email
      });

      return this.handleError(error as Error, emailData);
    }
  }

  validateInput(category: any, emailData: any): ValidationResult {
    const errors: string[] = [];

    // Validate category
    if (!category || typeof category !== 'string') {
      errors.push('Invalid category type');
    } else {
      const validCategories = ['ADD_LEAD', 'QUALIFY_LEAD'];
      if (!validCategories.includes(category)) {
        errors.push('Invalid category type');
      }
    }

    // Validate email data
    if (!emailData || typeof emailData !== 'object') {
      errors.push('Email data is required');
      return { isValid: false, errors };
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailData.sender_email || !emailRegex.test(emailData.sender_email)) {
      errors.push('Invalid email format');
    }

    // Validate subject
    if (!emailData.subject || emailData.subject.trim() === '') {
      errors.push('Subject is required');
    }

    // Validate body
    if (!emailData.body || emailData.body.trim() === '') {
      errors.push('Body content is required');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  formatResponse(response: EmailResponse): EmailResponse {
    try {
      const formattedBody = formatResponseContent(response.body);

      return {
        to: response.to,
        subject: response.subject,
        body: formattedBody || response.body // Fallback to original if formatting returns undefined
      };
    } catch (error) {
      // If formatting fails, return original response
      return response;
    }
  }

  handleError(error: Error, emailData: EmailPayload): EmailResponse {
    const fallbackResponses = {
      ValidationError: `Thank you for your inquiry. We appreciate your interest in Raindrop. Our team will review your message and respond with detailed information shortly.`,
      TemplateError: `Thank you for reaching out. Our team will review your message and respond with relevant information about our platform capabilities.`,
      AIModelError: `Thank you for your inquiry. We're currently experiencing high demand for our platform. Our team will review your message and respond with personalized information shortly.`,
      default: `Thank you for your inquiry. We appreciate your interest in Raindrop. Our team will review your message and respond with detailed information shortly.`
    };

    const errorType = error.name as keyof typeof fallbackResponses;
    const fallbackBody = fallbackResponses[errorType] || fallbackResponses.default;

    return {
      to: emailData.sender_email,
      subject: `Re: ${emailData.subject}`,
      body: fallbackBody
    };
  }

  sanitizeEmailData(emailData: any): EmailPayload {
    return {
      sender_email: this.sanitizeString(emailData.sender_email),
      subject: this.sanitizeString(emailData.subject),
      body: this.sanitizeString(emailData.body)
    };
  }

  private sanitizeString(value: any): string {
    if (!value) return '';

    let sanitized = String(value).trim();

    // Remove potentially dangerous HTML/script content
    sanitized = sanitized.replace(/<script[^>]*>.*?<\/script>/gi, '');
    sanitized = sanitized.replace(/<[^>]*onerror[^>]*>/gi, '');
    sanitized = sanitized.replace(/<[^>]*onload[^>]*>/gi, '');
    sanitized = sanitized.replace(/<[^>]*onclick[^>]*>/gi, '');

    return sanitized;
  }
}
