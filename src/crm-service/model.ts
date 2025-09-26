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