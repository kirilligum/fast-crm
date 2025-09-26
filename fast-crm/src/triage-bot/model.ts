/**
 * MODEL for triage-bot Service
 *
 * PRD REQUIREMENTS:
 * - Categorization business logic, JSON output validation, rule enforcement
 * - Data validation and persistence logic
 * - Business rule enforcement
 * - Domain calculations and transformations
 * - FORBIDDEN: HTTP handling, external API calls
 *
 * MUST IMPLEMENT:
 * 1. Email categorization business rules validation
 * 2. JSON output format validation for AI responses
 * 3. Category type enforcement (ADD_LEAD, QUALIFY_LEAD, IRRELEVANT, AMBIGUOUS)
 * 4. Email content analysis logic
 * 5. Categorization confidence scoring
 * 6. Rule-based validation for edge cases
 *
 * INTERFACES TO EXPORT:
 * - validateCategoryResult(result: any): CategoryResult
 * - validateEmailForCategorization(email: EmailPayload): ValidationResult
 * - isCategoryValid(category: string): boolean
 * - extractKeywords(content: string): string[]
 * - calculateCategoryConfidence(keywords: string[], category: CategoryType): number
 *
 * IMPORTS NEEDED:
 * - From shared types: EmailPayload, CategoryResult, CategoryType, ValidationError
 * - From env: none (model layer)
 * - From other layers: none (model is independent)
 *
 * BUSINESS RULES:
 * 1. Category must be one of: ADD_LEAD, QUALIFY_LEAD, IRRELEVANT, AMBIGUOUS
 * 2. Reason must be non-empty string explaining categorization
 * 3. Email content must contain meaningful text for analysis
 * 4. QUALIFY_LEAD requires specific technical keywords
 * 5. ADD_LEAD for general inquiries without specific intent
 * 6. IRRELEVANT for non-business related content
 * 7. AMBIGUOUS for unclear or insufficient information
 *
 * ERROR HANDLING:
 * - ValidationError for invalid category types
 * - ValidationError for missing or empty reason
 * - ValidationError for malformed JSON responses
 *
 * INTEGRATION POINTS:
 * - Used by controller.ts for categorization validation
 * - No direct integration with other components
 */

import {
  EmailPayload,
  CategoryResult,
  CategoryType,
  ValidationError
} from '../types/shared';

interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

// ================================
// CONFIGURATION CONSTANTS
// ================================

/** Valid category types for validation */
const VALID_CATEGORIES: CategoryType[] = ['ADD_LEAD', 'QUALIFY_LEAD', 'IRRELEVANT', 'AMBIGUOUS'];

/** Minimum content length for meaningful analysis */
const MIN_CONTENT_LENGTH = 10;

/** Minimum word length to keep during keyword extraction */
const MIN_WORD_LENGTH = 2;

// ================================
// KEYWORD CLASSIFICATION SETS
// ================================

/** Stop words to filter out during keyword extraction */
const STOP_WORDS = new Set([
  // Pronouns
  'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves', 'you', 'your', 'yours',
  'yourself', 'yourselves', 'he', 'him', 'his', 'himself', 'she', 'her', 'hers',
  'herself', 'it', 'its', 'itself', 'they', 'them', 'their', 'theirs', 'themselves',
  // Question words
  'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those',
  // Verbs
  'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'having',
  'do', 'does', 'did', 'doing',
  // Articles and conjunctions
  'a', 'an', 'the', 'and', 'but', 'if', 'or', 'because', 'as', 'until', 'while',
  // Prepositions
  'of', 'at', 'by', 'for', 'with', 'about', 'against', 'between', 'into', 'through',
  'during', 'before', 'after', 'above', 'below', 'up', 'down', 'in', 'out', 'on', 'off',
  'over', 'under', 'again', 'further', 'then', 'once', 'to'
]);

/** Technical keywords indicating QUALIFY_LEAD */
const QUALIFY_KEYWORDS = new Set([
  // Core Raindrop features
  'raindrop', 'smartmemory', 'smartsql', 'smartbuckets',
  // AI/ML terms
  'ai', 'agents', 'claude', 'native', 'multi-agent', 'rag',
  // Technical terms
  'build', 'scale', 'infrastructure', 'platform', 'api', 'development',
  'technical', 'integration', 'applications', 'services', 'actors'
]);

/** Business keywords indicating ADD_LEAD */
const BUSINESS_KEYWORDS = new Set([
  'business', 'startup', 'company', 'interested', 'inquiry', 'solutions',
  'services', 'pricing', 'demo', 'trial', 'contact', 'sales',
  'partnership', 'collaboration'
]);

/** Spam/irrelevant keywords indicating IRRELEVANT */
const IRRELEVANT_KEYWORDS = new Set([
  'spam', 'viagra', 'lottery', 'winner', 'free', 'money', 'prize',
  'casino', 'gambling', 'loan', 'credit', 'debt', 'investment', 'forex', 'bitcoin'
]);

// ================================
// CONFIDENCE SCORING WEIGHTS
// ================================

const CONFIDENCE_WEIGHTS = {
  QUALIFY_LEAD: { base: 0.5, increment: 0.15, max: 1.0 },
  ADD_LEAD: { base: 0.4, increment: 0.08, max: 0.78 },
  IRRELEVANT: { base: 0.3, increment: 0.2, max: 1.0 },
  AMBIGUOUS: { base: 0.3, increment: 0.05, max: 0.7 },
  DEFAULT: 0.5
} as const;

// ================================
// HELPER FUNCTIONS
// ================================

/**
 * Calculate confidence score based on weights and match count
 */
function calculateConfidenceScore(weights: { base: number; increment: number; max: number }, matchCount: number): number {
  return Math.min(weights.base + (matchCount * weights.increment), weights.max);
}

// ================================
// EXPORTED FUNCTIONS
// ================================

export function validateCategoryResult(result: any): CategoryResult {
  if (!result || typeof result !== 'object') {
    throw new ValidationError('Category result must be an object');
  }

  if (!result.category) {
    throw new ValidationError('Category is required');
  }

  if (!isCategoryValid(result.category)) {
    throw new ValidationError('Invalid category type');
  }

  if (typeof result.reason !== 'string') {
    if (!result.reason) {
      throw new ValidationError('Reason is required');
    }
    throw new ValidationError('Reason must be a string');
  }

  if (result.reason.trim() === '') {
    throw new ValidationError('Reason cannot be empty');
  }

  return {
    category: result.category as CategoryType,
    reason: result.reason.trim()
  };
}

export function validateEmailForCategorization(email: EmailPayload): ValidationResult {
  const errors: string[] = [];

  if (!email) {
    errors.push('Email data is required');
    return { isValid: false, errors };
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email.sender_email || !emailRegex.test(email.sender_email)) {
    errors.push('Invalid email format');
  }

  // Validate subject
  if (!email.subject || email.subject.trim() === '') {
    errors.push('Subject contains no meaningful content');
  }

  // Validate body
  if (!email.body || email.body.trim() === '') {
    errors.push('Body contains no meaningful content');
  }

  // Check minimum content length for meaningful analysis
  const totalContent = (email.subject || '') + ' ' + (email.body || '');
  if (totalContent.trim().length < MIN_CONTENT_LENGTH) {
    errors.push('Content too short for meaningful analysis');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

export function isCategoryValid(category: string): boolean {
  if (!category || typeof category !== 'string') {
    return false;
  }
  return VALID_CATEGORIES.includes(category as CategoryType);
}

export function extractKeywords(content: string): string[] {
  if (!content || typeof content !== 'string') {
    return [];
  }

  // Convert to lowercase and split into words
  const words = content
    .toLowerCase()
    .replace(/[^\w\s\/\-]/g, ' ') // Keep word chars, spaces, slashes, hyphens
    .split(/\s+/)
    .filter(word => word.length >= MIN_WORD_LENGTH) // Filter very short words (keep 'ai')
    .filter(word => !STOP_WORDS.has(word)) // Filter stop words
    .filter(word => isNaN(Number(word))); // Filter numbers

  // Remove duplicates and return
  return Array.from(new Set(words));
}

export function calculateCategoryConfidence(keywords: string[], category: CategoryType): number {
  if (!keywords || keywords.length === 0) {
    return CONFIDENCE_WEIGHTS.DEFAULT;
  }

  if (!isCategoryValid(category)) {
    return 0.0; // No confidence for invalid category
  }

  const keywordSet = new Set(keywords);
  let matchCount = 0;

  switch (category) {
    case 'QUALIFY_LEAD':
      QUALIFY_KEYWORDS.forEach(keyword => {
        if (keywordSet.has(keyword)) matchCount++;
      });
      return calculateConfidenceScore(CONFIDENCE_WEIGHTS.QUALIFY_LEAD, matchCount);

    case 'ADD_LEAD':
      BUSINESS_KEYWORDS.forEach(keyword => {
        if (keywordSet.has(keyword)) matchCount++;
      });
      return calculateConfidenceScore(CONFIDENCE_WEIGHTS.ADD_LEAD, matchCount);

    case 'IRRELEVANT':
      IRRELEVANT_KEYWORDS.forEach(keyword => {
        if (keywordSet.has(keyword)) matchCount++;
      });
      return calculateConfidenceScore(CONFIDENCE_WEIGHTS.IRRELEVANT, matchCount);

    case 'AMBIGUOUS':
      // Use keyword count for ambiguous content
      return calculateConfidenceScore(CONFIDENCE_WEIGHTS.AMBIGUOUS, keywords.length);

    default:
      return 0.0;
  }
}