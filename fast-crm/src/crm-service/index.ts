/**
 * VIEW LAYER + EXPORTS for crm-service Service
 *
 * PRD REQUIREMENTS:
 * - HTTP endpoint handling (POST /api/v1/process_email), CORS configuration
 * - API endpoint definitions (for crm_service)
 * - Input validation and sanitization
 * - Response formatting and export interfaces
 * - FORBIDDEN: Business logic, data persistence
 *
 * MUST IMPLEMENT:
 * 1. POST /api/v1/process_email endpoint with proper routing
 * 2. CORS headers for all responses (Access-Control-Allow-*)
 * 3. Request validation and sanitization
 * 4. JSON request/response handling
 * 5. Error response formatting
 * 6. OPTIONS method handling for preflight requests
 * 7. HTTP status code management
 *
 * INTERFACES TO EXPORT:
 * - fetch(request: Request): Promise<Response> (main HTTP handler)
 * - handleProcessEmail(request: Request): Promise<Response>
 * - handleCORS(request: Request): Response
 * - formatErrorResponse(error: Error): Response
 *
 * IMPORTS NEEDED:
 * - From shared types: EmailPayload, ProcessEmailResponse, ValidationError
 * - From env: env.logger for request logging
 * - From other layers: controller.processEmailWorkflow(), model validation functions
 *
 * BUSINESS RULES:
 * 1. Only accept POST requests to /api/v1/process_email
 * 2. Validate Content-Type: application/json
 * 3. Return 400 for invalid JSON or missing fields
 * 4. Return 500 for internal processing errors
 * 5. Log all requests and responses
 * 6. CORS must allow all origins for demo purposes
 *
 * ERROR HANDLING:
 * - 400 Bad Request for validation errors
 * - 405 Method Not Allowed for unsupported methods
 * - 500 Internal Server Error for processing failures
 * - Structured error responses with details
 *
 * INTEGRATION POINTS:
 * - Calls controller.processEmailWorkflow() for business logic
 * - Uses model validation functions for input checking
 * - Logs via env.logger for monitoring
 */

import { Service } from '@liquidmetal-ai/raindrop-framework';
import { Env } from './raindrop.gen';
import { processEmailWorkflow } from './controller';
import { validateEmailPayload } from './model';
import {
  EmailPayload,
  ProcessEmailResponse,
  ValidationError
} from '../../../src/types/shared';
import { crmDatabaseSchema } from '../sql/crm-database';

// Constants for better maintainability
const API_ENDPOINTS = {
  PROCESS_EMAIL: '/api/v1/process_email',
  GET_LEADS: '/api/v1/leads',
  GET_EMAIL_HISTORY: '/api/v1/email_history',
  UPLOAD_ADVISOR_DOCUMENT: '/api/v1/upload_advisor_document',
  GET_ADVISOR_DOCUMENTS: '/api/v1/advisor_documents',
  DELETE_ADVISOR_DOCUMENT: '/api/v1/advisor_documents',
  GET_ADVISOR_DOCUMENT_CONTENT: '/api/v1/advisor_documents'
} as const;

const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  PAYLOAD_TOO_LARGE: 413,
  INTERNAL_SERVER_ERROR: 500
} as const;

const CORS_CONFIG = {
  MAX_AGE: '86400',
  ALLOWED_METHODS: 'GET, POST, OPTIONS',
  ALLOWED_HEADERS: 'Content-Type, Authorization'
} as const;

export default class extends Service<Env> {
  constructor(ctx: any, env: Env) {
    super(ctx, env);
    // Initialize database schema on service start
    this.initializeDatabase().catch(error => {
      this.env.logger.error('Failed to initialize database schema', { error: error.message });
    });
  }

  private async initializeDatabase(): Promise<void> {
    try {
      this.env.logger.info('Initializing CRM database schema...');

      // Execute the schema creation
      await this.env.CRM_DATABASE.executeQuery({
        sqlQuery: crmDatabaseSchema,
        format: 'json'
      });

      this.env.logger.info('CRM database schema initialized successfully');
    } catch (error) {
      this.env.logger.error('Database schema initialization failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      // Don't throw here to prevent service startup failure
    }
  }

  async fetch(request: Request): Promise<Response> {
    try {
      // Add CORS headers to all responses
      const corsHeaders = this.getCORSHeaders();

      // Handle OPTIONS preflight requests
      if (request.method === 'OPTIONS') {
        return this.handleCORS(request);
      }

      // Parse URL and route requests
      const url = new URL(request.url);
      const path = url.pathname;

      if (path === API_ENDPOINTS.PROCESS_EMAIL) {
        if (request.method === 'POST') {
          return await this.handleProcessEmail(request);
        } else {
          return this.formatErrorResponse(
            new Error('Only POST and OPTIONS methods are supported'),
            HTTP_STATUS.METHOD_NOT_ALLOWED,
            corsHeaders
          );
        }
      } else if (path === API_ENDPOINTS.GET_LEADS) {
        if (request.method === 'GET') {
          return await this.handleGetLeads(request);
        } else {
          return this.formatErrorResponse(
            new Error('Only GET and OPTIONS methods are supported'),
            HTTP_STATUS.METHOD_NOT_ALLOWED,
            corsHeaders
          );
        }
      } else if (path === API_ENDPOINTS.GET_EMAIL_HISTORY) {
        if (request.method === 'GET') {
          return await this.handleGetEmailHistory(request);
        } else {
          return this.formatErrorResponse(
            new Error('Only GET and OPTIONS methods are supported'),
            HTTP_STATUS.METHOD_NOT_ALLOWED,
            corsHeaders
          );
        }
      } else if (path === API_ENDPOINTS.UPLOAD_ADVISOR_DOCUMENT) {
        if (request.method === 'POST') {
          return await this.handleUploadAdvisorDocument(request);
        } else {
          return this.formatErrorResponse(
            new Error('Only POST and OPTIONS methods are supported'),
            HTTP_STATUS.METHOD_NOT_ALLOWED,
            corsHeaders
          );
        }
      } else if (path === API_ENDPOINTS.GET_ADVISOR_DOCUMENTS) {
        if (request.method === 'GET') {
          return await this.handleGetAdvisorDocuments(request);
        } else if (request.method === 'DELETE') {
          return await this.handleDeleteAdvisorDocument(request);
        } else {
          return this.formatErrorResponse(
            new Error('Only GET, DELETE and OPTIONS methods are supported'),
            HTTP_STATUS.METHOD_NOT_ALLOWED,
            corsHeaders
          );
        }
      } else if (path.startsWith('/api/v1/advisor_documents/') && path.includes('/content')) {
        // Handle /api/v1/advisor_documents/{id}/content
        const pathParts = path.split('/');
        const documentId = pathParts[4]; // Get the document ID
        if (!documentId) {
          return this.formatErrorResponse(
            new Error('Document ID is required'),
            HTTP_STATUS.BAD_REQUEST,
            corsHeaders
          );
        }
        if (request.method === 'GET') {
          return await this.handleGetAdvisorDocumentContent(request, documentId);
        } else {
          return this.formatErrorResponse(
            new Error('Only GET and OPTIONS methods are supported'),
            HTTP_STATUS.METHOD_NOT_ALLOWED,
            corsHeaders
          );
        }
      }

      // 404 for unsupported paths
      return this.formatErrorResponse(
        new Error('Endpoint not found'),
        HTTP_STATUS.NOT_FOUND,
        corsHeaders
      );

    } catch (error) {
      this.env.logger.error(`Unexpected error in fetch: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return this.formatErrorResponse(
        error instanceof Error ? error : new Error('Unknown error'),
        500
      );
    }
  }

  async handleProcessEmail(request: Request): Promise<Response> {
    const corsHeaders = this.getCORSHeaders();

    try {
      // Validate Content-Type
      const contentType = request.headers.get('Content-Type');
      if (!contentType || !contentType.includes('application/json')) {
        return this.formatErrorResponse(
          new Error('Content-Type must be application/json'),
          400,
          corsHeaders
        );
      }

      // Parse request body
      let body: string;
      try {
        body = await request.text();
      } catch (error) {
        return this.formatErrorResponse(
          new Error('Failed to read request body'),
          400,
          corsHeaders
        );
      }

      // Check for empty body
      if (!body || body.trim() === '') {
        return this.formatErrorResponse(
          new Error('Request body is required'),
          400,
          corsHeaders
        );
      }

      // Parse JSON
      let emailPayload: EmailPayload;
      try {
        emailPayload = JSON.parse(body);
      } catch (error) {
        return this.formatErrorResponse(
          new Error('Invalid JSON format'),
          400,
          corsHeaders
        );
      }

      // Validate email payload
      try {
        validateEmailPayload(emailPayload);
      } catch (error) {
        if (error instanceof ValidationError) {
          return this.formatErrorResponse(
            new Error(`Validation failed: ${error.message}`),
            400,
            corsHeaders
          );
        }
        throw error;
      }

      // Log request
      this.env.logger.info(`Processing email request from ${emailPayload.sender_email} - Subject: "${emailPayload.subject}"`);

      // Process email workflow
      const result: ProcessEmailResponse = await processEmailWorkflow(emailPayload, this.env);

      // Log completion
      this.env.logger.info(`Email processing completed for ${emailPayload.sender_email} - Status: ${result.status}, Category: ${result.category}`);

      // Return successful response
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });

    } catch (error) {
      this.env.logger.error(`Email processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return this.formatErrorResponse(
        error instanceof Error ? error : new Error('Internal processing error'),
        500,
        corsHeaders
      );
    }
  }

  async handleGetLeads(request: Request): Promise<Response> {
    const corsHeaders = this.getCORSHeaders();

    try {
      this.env.logger.info('Fetching leads from database');

      // Query the database for all leads
      const result = await this.env.CRM_DATABASE.executeQuery({
        sqlQuery: 'SELECT email, status, notes, created_at, updated_at FROM leads ORDER BY updated_at DESC',
        format: 'json'
      });

      this.env.logger.info(`Database query result: ${JSON.stringify(result)}`);

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });

    } catch (error) {
      this.env.logger.error(`Failed to fetch leads: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return this.formatErrorResponse(
        error instanceof Error ? error : new Error('Failed to fetch leads'),
        500,
        corsHeaders
      );
    }
  }

  async handleUploadAdvisorDocument(request: Request): Promise<Response> {
    const corsHeaders = this.getCORSHeaders();

    try {
      // Validate Content-Type
      const contentType = request.headers.get('Content-Type');
      if (!contentType || !contentType.includes('application/json')) {
        return this.formatErrorResponse(
          new Error('Content-Type must be application/json'),
          400,
          corsHeaders
        );
      }

      // Parse request body
      let body: string;
      try {
        body = await request.text();
      } catch (error) {
        return this.formatErrorResponse(
          new Error('Failed to read request body'),
          400,
          corsHeaders
        );
      }

      // Parse JSON
      let documentData: {
        title: string;
        content: string;
      };
      try {
        documentData = JSON.parse(body);
      } catch (error) {
        return this.formatErrorResponse(
          new Error('Invalid JSON format'),
          400,
          corsHeaders
        );
      }

      // Validate required fields
      if (!documentData.title || !documentData.content) {
        return this.formatErrorResponse(
          new Error('Title and content are required'),
          400,
          corsHeaders
        );
      }

      this.env.logger.info(`Processing advisor document upload: "${documentData.title}"`);

      // Process document using advisor utilities
      const { processAdvisorDocument, chunkAdvisorDocument, formatAdvisorChunksForStorage } = await import('../utils/advisor');

      const document = processAdvisorDocument(
        documentData.title,
        documentData.content,
        undefined, // author (will be extracted from title if present)
        'other', // document type (simplified)
        'general' // domain (simplified)
      );

      const chunks = chunkAdvisorDocument(document);
      const storageChunks = formatAdvisorChunksForStorage(chunks);

      // Store document metadata and chunks in SmartBucket
      // TODO: Implement once SmartBucket API is finalized
      // For now, return success with document info

      this.env.logger.info(`Advisor document processed: ${chunks.length} chunks created for "${document.title}"`);

      return new Response(JSON.stringify({
        success: true,
        document_id: document.id,
        title: document.title,
        chunks_created: chunks.length,
        upload_timestamp: document.upload_timestamp
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });

    } catch (error) {
      this.env.logger.error(`Advisor document upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return this.formatErrorResponse(
        error instanceof Error ? error : new Error('Failed to process advisor document'),
        500,
        corsHeaders
      );
    }
  }

  async handleGetAdvisorDocuments(request: Request): Promise<Response> {
    const corsHeaders = this.getCORSHeaders();

    try {
      this.env.logger.info('Fetching advisor documents list');

      // TODO: Implement once SmartBucket API is finalized
      // For now, return mock data
      const mockDocuments = [
        {
          id: 'doc_sample_book',
          title: 'Sales Mastery Guide by Expert Author',
          upload_timestamp: '2024-01-15T10:30:00Z',
          chunk_count: 25,
          metadata: {
            document_type: 'other',
            domain: 'general',
            language: 'en'
          }
        }
      ];

      return new Response(JSON.stringify({
        documents: mockDocuments,
        total_count: mockDocuments.length
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });

    } catch (error) {
      this.env.logger.error(`Failed to fetch advisor documents: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return this.formatErrorResponse(
        error instanceof Error ? error : new Error('Failed to fetch advisor documents'),
        500,
        corsHeaders
      );
    }
  }

  async handleGetEmailHistory(request: Request): Promise<Response> {
    const corsHeaders = this.getCORSHeaders();

    try {
      this.env.logger.info('Fetching email history from SmartBucket');

      // TODO: Implement actual SmartBucket retrieval once API is finalized
      // For now, create mock data based on recent email interactions
      // In the real implementation, this would query the EMAIL_HISTORY SmartBucket

      const mockEmailHistory = [
        {
          id: 'email_001',
          sender_email: 'jenny@newstartup.com',
          subject: 'Following up from the Hackathon',
          body: 'Hi there! It was great meeting you at the hackathon yesterday. I am Jenny from NewStartup and I am really interested in learning more about what LiquidMetal AI does. Could you send me some information about your platform?',
          response_subject: 'Re: Following up from the Hackathon',
          response_body: 'Hi Jenny,\n\nGreat meeting you at the hackathon! At LiquidMetal AI we\'ve built **Raindrop**, a Claude‑native infrastructure that lets you spin up AI‑powered services, agents, and data pipelines in minutes—without worrying about servers, scaling, or low‑level plumbing...',
          category: 'ADD_LEAD',
          timestamp: new Date().toISOString(),
          type: 'incoming'
        },
        {
          id: 'email_002',
          sender_email: 'jenny@newstartup.com',
          subject: 'Quick question about pricing',
          body: 'Hi! Thanks for the information about Raindrop. I looked at the tutorial and it looks really promising. Could you tell me more about the pricing structure? We are a small startup so budget is a key consideration for us.',
          response_subject: 'Re: Quick question about pricing',
          response_body: 'Hi Jenny,\n\nThanks for reaching out and for taking a look at the tutorial – I\'m glad you found it promising...',
          category: 'ADD_LEAD',
          timestamp: new Date(Date.now() - 300000).toISOString(), // 5 minutes ago
          type: 'incoming'
        },
        {
          id: 'email_003',
          sender_email: 'jenny@newstartup.com',
          subject: 'Ready to get started',
          body: 'Perfect! I signed up for the trial and went through the tutorial - it was really smooth. Our team is excited to start building with Raindrop. Could you provide me with some best practices for getting started with our specific use case?',
          response_subject: 'Re: Ready to get started',
          response_body: 'Hi Jenny,\n\nGreat to hear the trial and the "Raindrop + Claude Quick Start" tutorial went smoothly—welcome aboard!...',
          category: 'ADD_LEAD',
          timestamp: new Date(Date.now() - 600000).toISOString(), // 10 minutes ago
          type: 'incoming'
        },
        {
          id: 'email_004',
          sender_email: 'alex@techcorp.io',
          subject: 'Enterprise evaluation of Raindrop',
          body: 'Hello, I am Alex from TechCorp and we are evaluating Raindrop for our enterprise AI infrastructure needs. We need to deploy multi-agent systems at scale. Can you tell me about enterprise features and support?',
          response_subject: 'Re: Enterprise evaluation of Raindrop',
          response_body: 'Hi Alex,\n\nThanks for reaching out. Your focus on deploying large‑scale multi‑agent systems aligns perfectly with what Raindrop is built to handle...',
          category: 'QUALIFY_LEAD',
          timestamp: new Date(Date.now() - 900000).toISOString(), // 15 minutes ago
          type: 'incoming'
        },
        {
          id: 'email_005',
          sender_email: 'sam@devtools.com',
          subject: 'Integration with existing Claude workflows',
          body: 'Hi, I am Sam from DevTools. We already have Claude integrations in our development workflow and want to explore how Raindrop could enhance our current setup. Do you have any migration guides or compatibility information?',
          response_subject: 'Re: Integration with existing Claude workflows',
          response_body: 'Hi Sam,\n\nThanks for reaching out – it\'s great to hear that you\'re already leveraging Claude in your development workflow...',
          category: 'ADD_LEAD',
          timestamp: new Date(Date.now() - 1200000).toISOString(), // 20 minutes ago
          type: 'incoming'
        }
      ];

      this.env.logger.info(`Retrieved ${mockEmailHistory.length} email interactions from history`);

      return new Response(JSON.stringify({
        email_interactions: mockEmailHistory,
        total_count: mockEmailHistory.length
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });

    } catch (error) {
      this.env.logger.error(`Failed to fetch email history: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return this.formatErrorResponse(
        error instanceof Error ? error : new Error('Failed to fetch email history'),
        500,
        corsHeaders
      );
    }
  }

  async handleDeleteAdvisorDocument(request: Request): Promise<Response> {
    const corsHeaders = this.getCORSHeaders();

    try {
      // Get document ID from query parameter
      const url = new URL(request.url);
      const documentId = url.searchParams.get('id');

      if (!documentId) {
        return this.formatErrorResponse(
          new Error('Document ID is required'),
          400,
          corsHeaders
        );
      }

      this.env.logger.info(`Deleting advisor document: ${documentId}`);

      // TODO: Implement actual deletion from SmartBucket once API is finalized
      // For now, return success for mock documents
      if (documentId === 'doc_sample_book') {
        this.env.logger.info(`Advisor document deleted: ${documentId}`);

        return new Response(JSON.stringify({
          success: true,
          message: `Document ${documentId} deleted successfully`
        }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      } else {
        return this.formatErrorResponse(
          new Error('Document not found'),
          404,
          corsHeaders
        );
      }

    } catch (error) {
      this.env.logger.error(`Failed to delete advisor document: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return this.formatErrorResponse(
        error instanceof Error ? error : new Error('Failed to delete advisor document'),
        500,
        corsHeaders
      );
    }
  }

  async handleGetAdvisorDocumentContent(request: Request, documentId: string): Promise<Response> {
    const corsHeaders = this.getCORSHeaders();

    try {
      this.env.logger.info(`Fetching content for advisor document: ${documentId}`);

      // TODO: Implement actual content retrieval from SmartBucket once API is finalized
      // For now, return mock content with sample chunks
      if (documentId === 'doc_sample_book') {
        const mockContent = {
          document_id: documentId,
          title: 'Sales Mastery Guide by Expert Author',
          preview_text: 'Building successful relationships with customers requires a deep understanding of their needs and pain points. This comprehensive guide covers proven strategies for customer engagement, from initial contact through closing and beyond...',
          total_chunks: 25,
          sample_chunks: [
            {
              id: 'chunk_1',
              content: 'Focus on building relationships with customers. Listen actively to their needs and pain points. Understanding the customer\'s business challenges is crucial for providing value-driven solutions.',
              chunk_index: 1,
              relevance_score: 0.95
            },
            {
              id: 'chunk_5',
              content: 'Always follow up promptly and maintain professional communication. Key strategies include understanding customer workflow, identifying decision makers, and presenting clear ROI benefits.',
              chunk_index: 5,
              relevance_score: 0.92
            },
            {
              id: 'chunk_12',
              content: 'Successful sales require preparation and research. Before any customer interaction, understand their industry, company size, and potential challenges they might face.',
              chunk_index: 12,
              relevance_score: 0.88
            }
          ],
          metadata: {
            document_type: 'other',
            domain: 'general',
            language: 'en',
            upload_timestamp: '2024-01-15T10:30:00Z'
          }
        };

        return new Response(JSON.stringify(mockContent), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      } else {
        return this.formatErrorResponse(
          new Error('Document not found'),
          404,
          corsHeaders
        );
      }

    } catch (error) {
      this.env.logger.error(`Failed to fetch advisor document content: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return this.formatErrorResponse(
        error instanceof Error ? error : new Error('Failed to fetch advisor document content'),
        500,
        corsHeaders
      );
    }
  }

  handleCORS(request: Request): Response {
    const corsHeaders = this.getCORSHeaders();

    return new Response('', {
      status: HTTP_STATUS.OK,
      headers: {
        ...corsHeaders,
        'Access-Control-Max-Age': CORS_CONFIG.MAX_AGE
      }
    });
  }

  formatErrorResponse(error: Error, status: number = 500, additionalHeaders: Record<string, string> = {}): Response {
    const corsHeaders = this.getCORSHeaders();

    const errorBody = {
      error: this.getErrorName(status),
      message: error.message
    };

    return new Response(JSON.stringify(errorBody), {
      status,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
        ...additionalHeaders
      }
    });
  }

  private getCORSHeaders(): Record<string, string> {
    return {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': CORS_CONFIG.ALLOWED_METHODS,
      'Access-Control-Allow-Headers': CORS_CONFIG.ALLOWED_HEADERS,
    };
  }

  private getErrorName(status: number): string {
    switch (status) {
      case 400:
        return 'Bad Request';
      case 404:
        return 'Not Found';
      case 405:
        return 'Method Not Allowed';
      case 413:
        return 'Payload Too Large';
      case 500:
        return 'Internal Server Error';
      default:
        return 'Error';
    }
  }
}
