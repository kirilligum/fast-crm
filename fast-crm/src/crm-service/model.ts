/**
 * MODEL for crm-service Service
 *
 * PRD REQUIREMENTS:
 * - Email payload validation, response data structures, business rules
 * - Data validation and persistence logic
 * - Business rule enforcement
 * - Domain calculations and transformations
 * - FORBIDDEN: HTTP handling, external API calls
 *
 * MUST IMPLEMENT:
 * 1. Email payload validation with comprehensive checks
 * 2. Response data structure formatting
 * 3. Business rule validation for email processing
 * 4. Input sanitization and data transformation
 * 5. Lead status validation and constraints
 *
 * INTERFACES TO EXPORT:
 * - validateEmailPayload(payload: EmailPayload): ValidationResult
 * - formatProcessEmailResponse(data: ProcessResponseData): ProcessEmailResponse
 * - validateLeadStatus(status: string): boolean
 * - sanitizeEmailContent(content: string): string
 *
 * IMPORTS NEEDED:
 * - From shared types: EmailPayload, ProcessEmailResponse, CategoryResult, ValidationError
 * - From env: none (model layer)
 * - From other layers: none (model is independent)
 *
 * BUSINESS RULES:
 * 1. Email addresses must be valid format
 * 2. Subject and body cannot be empty
 * 3. Lead status must be 'Lead' or 'Qualified'
 * 4. Email content must be sanitized for security
 * 5. Response must include all required fields
 *
 * ERROR HANDLING:
 * - ValidationError for invalid email format
 * - ValidationError for missing required fields
 * - ValidationError for invalid lead status
 *
 * INTEGRATION POINTS:
 * - Used by controller.ts for data validation
 * - No direct integration with other components
 */

import {
  EmailPayload,
  ProcessEmailResponse,
  CategoryResult,
  EmailResponse,
  ValidationError
} from '../../../src/types/shared';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export interface ProcessResponseData {
  categoryResult: CategoryResult;
  senderEmail: string;
  dbAction: string;
  responseEmail: EmailResponse | null;
  requiresReview: boolean;
  error?: string;
}

// Comprehensive email payload validation with detailed error handling
export function validateEmailPayload(payload: EmailPayload): ValidationResult {
  // Validate required fields exist
  if (!payload.body && payload.body !== '') {
    throw new ValidationError('Body is required', 'body');
  }

  if (!payload.subject || payload.subject.trim() === '') {
    throw new ValidationError('Subject cannot be empty', 'subject');
  }

  if (payload.body === '' || payload.body.trim() === '') {
    throw new ValidationError('Body cannot be empty', 'body');
  }

  // Enhanced email validation
  if (!payload.sender_email) {
    throw new ValidationError('Sender email is required', 'sender_email');
  }

  if (!isValidEmailFormat(payload.sender_email)) {
    throw new ValidationError('Invalid email format', 'sender_email');
  }

  // Additional validation rules
  if (payload.subject.length > 500) {
    throw new ValidationError('Subject too long (max 500 characters)', 'subject');
  }

  if (payload.body.length > 50000) {
    throw new ValidationError('Email body too long (max 50,000 characters)', 'body');
  }

  return {
    isValid: true,
    errors: []
  };
}

// Helper function for email validation
function isValidEmailFormat(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.toLowerCase());
}

export function formatProcessEmailResponse(data: ProcessResponseData): ProcessEmailResponse {
  return {
    status: data.error ? 'error' : 'processed',
    category: data.categoryResult.category,
    sender_email: data.senderEmail,
    db_action: data.dbAction,
    response_email: data.responseEmail,
    requires_review: data.requiresReview,
    error: data.error
  };
}

export function validateLeadStatus(status: string): boolean {
  return status === 'Lead' || status === 'Qualified';
}

export function sanitizeEmailContent(content: string): string {
  if (typeof content !== 'string') {
    return '';
  }

  // Remove dangerous HTML elements and their content
  let sanitized = content
    .replace(/<script[^>]*>.*?<\/script>/gi, '')
    .replace(/<style[^>]*>.*?<\/style>/gi, '')
    .replace(/<iframe[^>]*>.*?<\/iframe>/gi, '')
    .replace(/<object[^>]*>.*?<\/object>/gi, '')
    .replace(/<embed[^>]*>.*?<\/embed>/gi, '');

  // Remove all HTML tags
  sanitized = sanitized.replace(/<[^>]*>/g, '');

  // Remove SQL injection patterns
  const sqlPatterns = [
    /;[\s]*DROP[\s]+TABLE/gi,
    /;[\s]*DELETE[\s]+FROM/gi,
    /;[\s]*INSERT[\s]+INTO/gi,
    /;[\s]*UPDATE[\s]+/gi,
    /;[\s]*ALTER[\s]+TABLE/gi,
    /;[\s]*CREATE[\s]+TABLE/gi,
    /UNION[\s]+SELECT/gi
  ];

  sqlPatterns.forEach(pattern => {
    sanitized = sanitized.replace(pattern, '');
  });

  // Remove dangerous characters for SQL injection
  sanitized = sanitized.replace(/'/g, '');  // Remove single quotes
  sanitized = sanitized.replace(/;/g, '');  // Remove semicolons
  sanitized = sanitized.replace(/--/g, ''); // Remove SQL comments
  sanitized = sanitized.replace(/\/\*/g, ''); // Remove /* comments
  sanitized = sanitized.replace(/\*\//g, ''); // Remove */ comments

  // Trim whitespace
  return sanitized.trim();
}