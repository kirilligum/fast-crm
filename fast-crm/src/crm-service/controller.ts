/**
 * CONTROLLER for crm-service Service
 *
 * PRD REQUIREMENTS:
 * - Workflow orchestration between TriageBot, ResponseBot, and database
 * - Coordinate between model.ts and index.ts
 * - Workflow orchestration and process management
 * - External API calls (AI models, SmartMemory)
 * - Cross-component communication via env bindings
 * - FORBIDDEN: Direct data persistence, protocol handling
 *
 * MUST IMPLEMENT:
 * 1. Email processing workflow coordination
 * 2. TriageBot categorization orchestration
 * 3. Database operation management (insert/update leads)
 * 4. ResponseBot response generation coordination
 * 5. SmartMemory interaction logging
 * 6. Error handling and recovery logic
 * 7. End-to-end workflow management
 *
 * INTERFACES TO EXPORT:
 * - processEmailWorkflow(emailData: EmailPayload): Promise<ProcessEmailResponse>
 * - orchestrateTriageBot(emailData: EmailPayload): Promise<CategoryResult>
 * - manageDatabaseOperations(email: string, category: CategoryType): Promise<string>
 * - orchestrateResponseBot(category: CategoryType, emailData: EmailPayload): Promise<EmailResponse>
 * - logInteraction(interaction: InteractionLog): Promise<void>
 *
 * IMPORTS NEEDED:
 * - From shared types: EmailPayload, ProcessEmailResponse, CategoryResult, EmailResponse, InteractionLog
 * - From env: env.TRIAGE_BOT, env.RESPONSE_BOT, env.CRM_DATABASE, env.AGENT_MEMORY
 * - From other layers: model validation functions
 *
 * BUSINESS RULES:
 * 1. Must categorize email before database operations
 * 2. Only ADD_LEAD and QUALIFY_LEAD trigger database updates
 * 3. IRRELEVANT emails require no database action
 * 4. AMBIGUOUS emails require review flag
 * 5. Response generation follows categorization rules
 * 6. All interactions must be logged to SmartMemory
 *
 * ERROR HANDLING:
 * - AIModelError for categorization failures
 * - DatabaseError for database operation failures
 * - KnowledgeRetrievalError for memory access failures
 * - Graceful degradation for non-critical failures
 *
 * INTEGRATION POINTS:
 * - env.TRIAGE_BOT.categorize() for email categorization
 * - env.RESPONSE_BOT.generate() for response generation
 * - env.CRM_DATABASE for lead management
 * - env.AGENT_MEMORY for interaction logging
 */

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
import { validateEmailPayload, formatProcessEmailResponse } from './model';

// Constants for better maintainability
const DEFAULT_ERROR_MESSAGES = {
  TRIAGE_FAILED: 'Triage categorization failed',
  DB_OPERATION_FAILED: 'Database operation failed',
  RESPONSE_GENERATION_FAILED: 'Response generation failed',
  INTERACTION_LOGGING_FAILED: 'Interaction logging failed',
  WORKFLOW_FAILED: 'Workflow processing failed'
} as const;

const INTERACTION_ID_PREFIX = 'crm_interaction_';

// Environment interface for dependency injection
interface ControllerEnv {
  TRIAGE_BOT: {
    categorize(emailData: EmailPayload): Promise<CategoryResult>;
  };
  RESPONSE_BOT: {
    generate(category: CategoryType, emailData: EmailPayload): Promise<EmailResponse>;
  };
  CRM_DATABASE: {
    executeQuery(params: {
      sqlQuery?: string;
      textQuery?: string;
      format?: 'json' | 'csv';
    }): Promise<{
      message: string;
      results?: string;
      status: number;
      queryExecuted: string;
      aiReasoning?: string;
    }>;
    getMetadata(tableName?: string): Promise<any>;
    updateMetadata(tables: any[], mode?: 'replace' | 'merge' | 'append'): Promise<any>;
    getPiiData(tableName: string, recordId?: string): Promise<any>;
  };
  AGENT_MEMORY: {
    startWorkingMemorySession(): Promise<any>;
    log?(interaction: InteractionLog): Promise<void>;
    store?(data: any): Promise<void>;
  };
  logger: {
    info(message: string): void;
    error(message: string): void;
    warn(message: string): void;
  };
}

// Main workflow orchestration function
export async function processEmailWorkflow(emailData: EmailPayload, env: ControllerEnv): Promise<ProcessEmailResponse> {
  let categoryResult: CategoryResult;
  let dbAction = 'No action taken';
  let responseEmail: EmailResponse | null = null;
  let requiresReview = false;
  let error: string | undefined;

  try {
    // Step 1: Categorize email using triage bot
    try {
      categoryResult = await orchestrateTriageBot(emailData, env);
    } catch (triageError) {
      // If triage fails, set to AMBIGUOUS and require review
      categoryResult = {
        category: 'AMBIGUOUS',
        reason: 'Triage categorization failed'
      };
      requiresReview = true;
      error = triageError instanceof Error ? triageError.message : 'Triage failed';
    }

    // Step 2: Handle database operations based on category
    try {
      dbAction = await manageDatabaseOperations(emailData.sender_email, categoryResult.category, env);
    } catch (dbError) {
      env.logger.error(`Database operation failed: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`);
      requiresReview = true;
      error = dbError instanceof Error ? dbError.message : 'Database operation failed';
    }

    // Step 3: Generate response if needed
    try {
      if (categoryResult.category !== 'IRRELEVANT') {
        responseEmail = await orchestrateResponseBot(categoryResult.category, emailData, env);
      }
    } catch (responseError) {
      env.logger.warn(`Response generation failed: ${responseError instanceof Error ? responseError.message : 'Unknown error'}`);
      // Response generation failure is non-critical, continue processing
    }

    // Step 4: Set review flag for ambiguous emails
    if (categoryResult.category === 'AMBIGUOUS') {
      requiresReview = true;
    }

    // Step 5: Log interaction
    try {
      const interaction: InteractionLog = {
        id: generateInteractionId(),
        timestamp: new Date(),
        email_payload: emailData,
        category_result: categoryResult,
        response_generated: responseEmail || createNoResponseEmailStub(emailData.sender_email),
        db_action: dbAction
      };
      await logInteraction(interaction, env);
    } catch (logError) {
      env.logger.warn(`${DEFAULT_ERROR_MESSAGES.INTERACTION_LOGGING_FAILED}: ${logError instanceof Error ? logError.message : 'Unknown error'}`);
      // Logging failure is non-critical
    }

    // Step 6: Format and return response
    const responseData = {
      categoryResult,
      senderEmail: emailData.sender_email,
      dbAction,
      responseEmail,
      requiresReview,
      error
    };

    return formatProcessEmailResponse(responseData);

  } catch (unexpectedError) {
    // Handle any unexpected errors
    env.logger.error(`Unexpected workflow error: ${unexpectedError instanceof Error ? unexpectedError.message : 'Unknown error'}`);

    const errorResponseData = {
      categoryResult: {
        category: 'AMBIGUOUS' as CategoryType,
        reason: 'Workflow processing failed'
      },
      senderEmail: emailData.sender_email,
      dbAction: 'No action taken',
      responseEmail: null,
      requiresReview: true,
      error: unexpectedError instanceof Error ? unexpectedError.message : 'Unexpected workflow error'
    };

    return formatProcessEmailResponse(errorResponseData);
  }
}

export async function orchestrateTriageBot(emailData: EmailPayload, env: ControllerEnv): Promise<CategoryResult> {
  try {
    // Validate email payload first
    validateEmailPayload(emailData);

    // Call triage bot service
    const result = await env.TRIAGE_BOT.categorize(emailData);
    return result;
  } catch (error) {
    env.logger.error(`Triage bot orchestration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    throw new AIModelError(`Triage bot failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'triage-bot');
  }
}

export async function manageDatabaseOperations(email: string, category: CategoryType, env: ControllerEnv): Promise<string> {
  try {
    const currentTime = new Date().toISOString();

    switch (category) {
      case 'ADD_LEAD':
        const insertResult = await env.CRM_DATABASE.executeQuery({
          sqlQuery: `INSERT INTO leads (email, status, notes, created_at, updated_at) VALUES ('${email}', 'Lead', 'New lead from email processing', '${currentTime}', '${currentTime}') ON CONFLICT(email) DO UPDATE SET status = excluded.status, notes = excluded.notes, updated_at = excluded.updated_at`,
          format: 'json'
        });
        return `INSERT INTO leads - email: ${email}, query: ${insertResult.queryExecuted}`;

      case 'QUALIFY_LEAD':
        const updateResult = await env.CRM_DATABASE.executeQuery({
          sqlQuery: `UPDATE leads SET status = 'Qualified', updated_at = '${currentTime}' WHERE email = '${email}'`,
          format: 'json'
        });
        return `UPDATE leads SET status = 'Qualified' WHERE email = '${email}' - query: ${updateResult.queryExecuted}`;

      case 'IRRELEVANT':
      case 'AMBIGUOUS':
      default:
        return 'No action taken';
    }
  } catch (error) {
    env.logger.error(`Database operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    throw new DatabaseError(`Database operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`, category);
  }
}

export async function orchestrateResponseBot(category: CategoryType, emailData: EmailPayload, env: ControllerEnv): Promise<EmailResponse | null> {
  try {
    // No response for irrelevant emails
    if (category === 'IRRELEVANT') {
      return null;
    }

    // Generate response for all other categories
    const response = await env.RESPONSE_BOT.generate(category, emailData);
    return response;
  } catch (error) {
    env.logger.error(`Response bot orchestration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    throw new AIModelError(`Response bot failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'response-bot');
  }
}

export async function logInteraction(interaction: InteractionLog, env: ControllerEnv): Promise<void> {
  try {
    await env.AGENT_MEMORY.log?.(interaction);
    env.logger.info(`Interaction logged: ${interaction.id}`);
  } catch (error) {
    env.logger.error(`Memory logging failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    throw new KnowledgeRetrievalError(`Memory logging failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'interaction-log');
  }
}

// Helper functions for better code organization
function generateInteractionId(): string {
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substr(2, 9);
  return `${INTERACTION_ID_PREFIX}${timestamp}_${randomId}`;
}

function createNoResponseEmailStub(recipientEmail: string): EmailResponse {
  return {
    to: recipientEmail,
    subject: 'No response generated',
    body: 'No response generated'
  };
}