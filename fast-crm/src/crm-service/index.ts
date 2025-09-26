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

// Constants for better maintainability
const API_ENDPOINTS = {
  PROCESS_EMAIL: '/api/v1/process_email'
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
  ALLOWED_METHODS: 'POST, OPTIONS',
  ALLOWED_HEADERS: 'Content-Type, Authorization'
} as const;

export default class extends Service<Env> {
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
