/**
 * MODEL for response-bot Service
 *
 * PRD REQUIREMENTS:
 * - Response templates, tone validation, content formatting rules
 * - Data validation and persistence logic
 * - Business rule enforcement
 * - Domain calculations and transformations
 * - FORBIDDEN: HTTP handling, external API calls
 *
 * MUST IMPLEMENT:
 * 1. Response template validation and formatting
 * 2. Tone validation for "Peer-to-Peer Technical Advisor"
 * 3. Content formatting rules enforcement
 * 4. Email response structure validation
 * 5. Template selection logic based on category
 * 6. Response length and quality validation
 *
 * INTERFACES TO EXPORT:
 * - validateEmailResponse(response: EmailResponse): ValidationResult
 * - selectResponseTemplate(category: CategoryType): string
 * - validateTone(content: string): boolean
 * - formatResponseContent(content: string): string
 * - validateResponseStructure(response: any): EmailResponse
 * - calculateResponseQuality(response: EmailResponse): number
 *
 * IMPORTS NEEDED:
 * - From shared types: EmailResponse, CategoryType, ValidationError, TemplateError
 * - From env: none (model layer)
 * - From other layers: none (model is independent)
 *
 * BUSINESS RULES:
 * 1. ADD_LEAD responses must include value proposition and CTA
 * 2. QUALIFY_LEAD responses must ask 2-3 probing questions
 * 3. Response tone must be professional and knowledgeable
 * 4. Subject line must be properly formatted (Re: format)
 * 5. Body content must be non-empty and meaningful
 * 6. No placeholder text or TODO items allowed
 * 7. Response must match Peer-to-Peer Technical Advisor tone
 *
 * ERROR HANDLING:
 * - ValidationError for invalid response structure
 * - TemplateError for missing or invalid templates
 * - ValidationError for inappropriate tone or content
 *
 * INTEGRATION POINTS:
 * - Used by controller.ts for response validation
 * - No direct integration with other components
 */

import {
  EmailResponse,
  CategoryType,
  ValidationError,
  TemplateError
} from '../types/shared';

interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

// ================================
// CONFIGURATION CONSTANTS
// ================================

/** Minimum body content length for meaningful responses */
const MIN_BODY_LENGTH = 50;

/** Email regex for validation */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Subject line format regex for "Re:" prefix */
const RE_SUBJECT_REGEX = /^Re:\s+.+/;

/** Placeholder text patterns to detect */
const PLACEHOLDER_PATTERNS = [
  /TODO:/i,
  /\[PLACEHOLDER\]/i,
  /XXX/i,
  /FIXME:/i,
  /\{\{.*\}\}/,
  /\$\{.*\}/
];

/** Casual tone indicators */
const CASUAL_INDICATORS = [
  'hey', 'hi there', 'awesome', 'cool', 'totally', 'super',
  'amazing', 'incredible', 'wow', 'omg', 'lol', 'haha'
];

/** Overly sales-y indicators */
const SALESY_INDICATORS = [
  'buy now', 'limited time', 'incredible deal', 'amazing offer',
  'don\'t miss out', '50% off', 'act fast', 'hurry up'
];

/** Inappropriate language indicators */
const INAPPROPRIATE_INDICATORS = [
  'damn', 'hell', 'crap', 'suck', 'blow your mind'
];

// ================================
// RESPONSE TEMPLATES
// ================================

const RESPONSE_TEMPLATES = {
  ADD_LEAD: `
    Thank you for your interest in Raindrop. Our AI-native platform helps technical founders build and scale intelligent applications with unprecedented ease.

    Our value proposition includes:
    - SmartMemory for AI-powered data management
    - SmartSQL for intelligent database interactions
    - Native Claude integration for advanced AI capabilities
    - Scalable infrastructure that grows with your needs

    I recommend starting with our free trial to experience the platform firsthand. You'll find our "Raindrop + Claude Quick Start" tutorial particularly helpful for getting up and running quickly.

    Feel free to reach out if you have any questions about getting started.
  `,
  QUALIFY_LEAD: `
    Thank you for reaching out about your technical requirements. To validate use case fit, I believe our Raindrop components could be well-suited for your needs.

    Our platform offers SmartMemory for AI-powered data management, SmartSQL for intelligent database interactions, and native integration with Claude for advanced AI capabilities.

    To better understand how we can help, I'd like to ask a few probing questions:
    1) Your current technical infrastructure and data architecture
    2) The specific AI capabilities you're looking to implement
    3) Your expected scale and performance requirements

    This will help me recommend the most appropriate Raindrop components for your needs.
  `
};

// ================================
// QUALITY SCORING WEIGHTS
// ================================

const QUALITY_WEIGHTS = {
  MIN_LENGTH: { threshold: 100, score: 0.25 },
  PROFESSIONAL_TONE: { score: 0.25 },
  CATEGORY_KEYWORDS: { score: 0.25 },
  STRUCTURE: { score: 0.15 },
  PERSONALIZATION: { score: 0.15 }
};

// ================================
// EXPORTED FUNCTIONS
// ================================

export function validateEmailResponse(response: EmailResponse): ValidationResult {
  const errors: string[] = [];

  if (!response || typeof response !== 'object') {
    errors.push('Email response must be an object');
    return { isValid: false, errors };
  }

  // Validate 'to' field
  if (!response.to || response.to.trim() === '') {
    errors.push('Email recipient (to) is required');
  } else if (!EMAIL_REGEX.test(response.to.trim())) {
    errors.push('Invalid email format for recipient');
  }

  // Validate subject
  if (!response.subject || response.subject.trim() === '') {
    errors.push('Subject is required');
  } else if (!RE_SUBJECT_REGEX.test(response.subject.trim())) {
    errors.push('Subject must follow "Re: [original subject]" format');
  }

  // Validate body
  if (!response.body || response.body.trim() === '') {
    errors.push('Body content is required');
  } else {
    const bodyText = response.body.trim();

    if (bodyText.length < MIN_BODY_LENGTH) {
      errors.push('Body content too short for meaningful response');
    }

    // Check for placeholder text
    const hasPlaceholder = PLACEHOLDER_PATTERNS.some(pattern =>
      pattern.test(bodyText)
    );
    if (hasPlaceholder) {
      errors.push('Body contains placeholder text or TODO items');
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

export function selectResponseTemplate(category: CategoryType): string {
  if (!category || typeof category !== 'string') {
    throw new TemplateError('Category is required for template selection');
  }

  const template = RESPONSE_TEMPLATES[category as keyof typeof RESPONSE_TEMPLATES];

  if (!template) {
    throw new TemplateError(`No template available for category: ${category}`);
  }

  return template.trim();
}

export function validateTone(content: string): boolean {
  if (!content || typeof content !== 'string') {
    return false;
  }

  const lowerContent = content.toLowerCase();

  // Check minimum length
  if (content.trim().length < 20) {
    return false;
  }

  // Check for casual tone
  const hasCasualTone = CASUAL_INDICATORS.some(indicator =>
    lowerContent.includes(indicator)
  );
  if (hasCasualTone) {
    return false;
  }

  // Check for overly sales-y tone
  const hasSalesyTone = SALESY_INDICATORS.some(indicator =>
    lowerContent.includes(indicator)
  );
  if (hasSalesyTone) {
    return false;
  }

  // Check for inappropriate language
  const hasInappropriate = INAPPROPRIATE_INDICATORS.some(indicator =>
    lowerContent.includes(indicator)
  );
  if (hasInappropriate) {
    return false;
  }

  return true;
}

export function formatResponseContent(content: string): string {
  if (!content || typeof content !== 'string') {
    throw new ValidationError('Content is required for formatting');
  }

  const trimmed = content.trim();
  if (trimmed === '') {
    throw new ValidationError('Content cannot be empty');
  }

  // If already well-formatted, return as-is
  if (trimmed.includes('\n\n') && trimmed[0] && trimmed[0] === trimmed[0].toUpperCase()) {
    return trimmed;
  }

  // Basic formatting improvements
  let formatted = trimmed;

  // Ensure proper capitalization
  formatted = formatted.charAt(0).toUpperCase() + formatted.slice(1);

  // Fix spacing around periods and capitalize after periods
  formatted = formatted.replace(/\.\s*([a-z])/g, (match, letter) => '. ' + letter.toUpperCase());
  formatted = formatted.replace(/([a-z])\s*\.\s*/g, '$1. ');

  // Remove multiple periods
  formatted = formatted.replace(/\.{2,}/g, '.');

  // Add paragraph breaks for readability (simple heuristic)
  formatted = formatted.replace(/\.\s*([A-Z][^.]*(?:Raindrop|platform|AI|technical))/g, '.\n\n$1');

  // For simple sentences without keywords, add breaks after periods followed by capital letters
  if (!formatted.includes('\n\n')) {
    formatted = formatted.replace(/\.\s+([A-Z])/g, '.\n\n$1');
  }

  return formatted;
}

export function validateResponseStructure(response: any): EmailResponse {
  if (!response || typeof response !== 'object') {
    throw new ValidationError('Response must be an object');
  }

  if (!response.to || typeof response.to !== 'string') {
    throw new ValidationError('Response must have a valid "to" field');
  }

  if (!response.subject || typeof response.subject !== 'string') {
    throw new ValidationError('Response must have a valid "subject" field');
  }

  if (!response.body || typeof response.body !== 'string') {
    throw new ValidationError('Response must have a valid "body" field');
  }

  return {
    to: response.to,
    subject: response.subject,
    body: response.body
  };
}

export function calculateResponseQuality(response: EmailResponse): number {
  if (!response || typeof response !== 'object') {
    return 0;
  }

  if (!response.to || !response.subject || !response.body) {
    return 0;
  }

  let score = 0;

  // Length quality (30%)
  const bodyLength = response.body.length;
  if (bodyLength >= QUALITY_WEIGHTS.MIN_LENGTH.threshold) {
    score += QUALITY_WEIGHTS.MIN_LENGTH.score;
  }

  // Professional tone (20%)
  if (validateTone(response.body)) {
    score += QUALITY_WEIGHTS.PROFESSIONAL_TONE.score;
  }

  // Category-specific keywords (20%)
  const bodyLower = response.body.toLowerCase();
  const hasRaindropKeywords = ['raindrop', 'smartmemory', 'smartsql'].some(keyword =>
    bodyLower.includes(keyword)
  );
  const hasValueProp = bodyLower.includes('value proposition') ||
                      bodyLower.includes('free trial') ||
                      bodyLower.includes('quick start');
  const hasQualifyingQuestions = (response.body.match(/\?/g) || []).length >= 2;
  const hasValidateUseCase = bodyLower.includes('validate use case') ||
                           bodyLower.includes('validate') ||
                           bodyLower.includes('probing questions');

  if (hasRaindropKeywords && (hasValueProp || hasQualifyingQuestions || hasValidateUseCase)) {
    score += QUALITY_WEIGHTS.CATEGORY_KEYWORDS.score;
  }

  // Structure quality (15%)
  const hasProperSubject = RE_SUBJECT_REGEX.test(response.subject);
  const hasGoodLength = bodyLength >= MIN_BODY_LENGTH;
  if (hasProperSubject && hasGoodLength) {
    score += QUALITY_WEIGHTS.STRUCTURE.score;
  }

  // Personalization (15%)
  const hasPersonalization = bodyLower.includes('your') ||
                            bodyLower.includes('you') ||
                            bodyLower.includes('based on');
  if (hasPersonalization) {
    score += QUALITY_WEIGHTS.PERSONALIZATION.score;
  }

  // Bonus for comprehensive responses with multiple quality indicators
  const qualityIndicators = [
    bodyLength >= QUALITY_WEIGHTS.MIN_LENGTH.threshold,
    validateTone(response.body),
    hasRaindropKeywords,
    hasQualifyingQuestions || hasValueProp || hasValidateUseCase,
    hasPersonalization
  ].filter(Boolean).length;

  if (qualityIndicators >= 4) {
    score += 0.05; // Small bonus for comprehensive responses
  }

  return Math.min(score, 1.0); // Cap at 1.0
}