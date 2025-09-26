import { expect, test, describe } from 'vitest';
import {
  validateCategoryResult,
  validateEmailForCategorization,
  isCategoryValid,
  extractKeywords,
  calculateCategoryConfidence
} from './model';
import {
  EmailPayload,
  CategoryResult,
  CategoryType,
  ValidationError
} from '../types/shared';

describe('TriageBot Model Validation Functions - TDD RED PHASE', () => {
  describe('validateCategoryResult', () => {
    test('should reject invalid JSON with missing category', () => {
      const invalidResult = {
        reason: 'Test reason'
        // category is missing
      };

      expect(() => validateCategoryResult(invalidResult)).toThrow(ValidationError);
      expect(() => validateCategoryResult(invalidResult)).toThrow('Category is required');
    });

    test('should reject invalid category type', () => {
      const invalidResult = {
        category: 'INVALID_CATEGORY',
        reason: 'Test reason'
      };

      expect(() => validateCategoryResult(invalidResult)).toThrow(ValidationError);
      expect(() => validateCategoryResult(invalidResult)).toThrow('Invalid category type');
    });

    test('should reject empty reason', () => {
      const invalidResult = {
        category: 'ADD_LEAD',
        reason: ''
      };

      expect(() => validateCategoryResult(invalidResult)).toThrow(ValidationError);
      expect(() => validateCategoryResult(invalidResult)).toThrow('Reason cannot be empty');
    });

    test('should reject missing reason', () => {
      const invalidResult = {
        category: 'ADD_LEAD'
        // reason is missing
      };

      expect(() => validateCategoryResult(invalidResult)).toThrow(ValidationError);
      expect(() => validateCategoryResult(invalidResult)).toThrow('Reason is required');
    });

    test('should reject non-string reason', () => {
      const invalidResult = {
        category: 'ADD_LEAD',
        reason: 123
      };

      expect(() => validateCategoryResult(invalidResult)).toThrow(ValidationError);
      expect(() => validateCategoryResult(invalidResult)).toThrow('Reason must be a string');
    });

    test('should accept valid category result', () => {
      const validResult = {
        category: 'ADD_LEAD',
        reason: 'Valid business inquiry from potential customer'
      };

      expect(() => validateCategoryResult(validResult)).not.toThrow();
      const result = validateCategoryResult(validResult);
      expect(result.category).toBe('ADD_LEAD');
      expect(result.reason).toBe('Valid business inquiry from potential customer');
    });

    test('should accept all valid categories', () => {
      const categories: CategoryType[] = ['ADD_LEAD', 'QUALIFY_LEAD', 'IRRELEVANT', 'AMBIGUOUS'];

      categories.forEach(category => {
        const validResult = {
          category,
          reason: `Test reason for ${category}`
        };

        expect(() => validateCategoryResult(validResult)).not.toThrow();
        const result = validateCategoryResult(validResult);
        expect(result.category).toBe(category);
      });
    });
  });

  describe('validateEmailForCategorization', () => {
    test('should reject email with only whitespace in subject', () => {
      const invalidEmail: EmailPayload = {
        sender_email: 'test@example.com',
        subject: '   \t  \n  ',
        body: 'Valid body content'
      };

      const result = validateEmailForCategorization(invalidEmail);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Subject contains no meaningful content');
    });

    test('should reject email with only whitespace in body', () => {
      const invalidEmail: EmailPayload = {
        sender_email: 'test@example.com',
        subject: 'Valid subject',
        body: '   \t  \n  '
      };

      const result = validateEmailForCategorization(invalidEmail);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Body contains no meaningful content');
    });

    test('should reject email with invalid email format', () => {
      const invalidEmail: EmailPayload = {
        sender_email: 'not-an-email',
        subject: 'Valid subject',
        body: 'Valid body content'
      };

      const result = validateEmailForCategorization(invalidEmail);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid email format');
    });

    test('should reject email with too short content', () => {
      const invalidEmail: EmailPayload = {
        sender_email: 'test@example.com',
        subject: 'Hi',
        body: 'Ok'
      };

      const result = validateEmailForCategorization(invalidEmail);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Content too short for meaningful analysis');
    });

    test('should accept valid email for categorization', () => {
      const validEmail: EmailPayload = {
        sender_email: 'test@example.com',
        subject: 'Inquiry about Raindrop platform',
        body: 'I am interested in building AI applications with your Raindrop platform. Could you provide more information?'
      };

      const result = validateEmailForCategorization(validEmail);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    test('should accumulate multiple validation errors', () => {
      const invalidEmail: EmailPayload = {
        sender_email: 'invalid-email',
        subject: '',
        body: ''
      };

      const result = validateEmailForCategorization(invalidEmail);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });

  describe('isCategoryValid', () => {
    test('should reject invalid category strings', () => {
      expect(isCategoryValid('INVALID')).toBe(false);
      expect(isCategoryValid('add_lead')).toBe(false); // case sensitive
      expect(isCategoryValid('LEAD')).toBe(false);
      expect(isCategoryValid('')).toBe(false);
      expect(isCategoryValid('SPAM')).toBe(false);
    });

    test('should accept all valid categories', () => {
      expect(isCategoryValid('ADD_LEAD')).toBe(true);
      expect(isCategoryValid('QUALIFY_LEAD')).toBe(true);
      expect(isCategoryValid('IRRELEVANT')).toBe(true);
      expect(isCategoryValid('AMBIGUOUS')).toBe(true);
    });

    test('should handle null and undefined', () => {
      expect(isCategoryValid(null as any)).toBe(false);
      expect(isCategoryValid(undefined as any)).toBe(false);
    });
  });

  describe('extractKeywords', () => {
    test('should extract Raindrop-related keywords', () => {
      const content = 'I want to build AI applications using Raindrop platform with SmartMemory and agents';
      const keywords = extractKeywords(content);

      expect(keywords).toContain('raindrop');
      expect(keywords).toContain('ai');
      expect(keywords).toContain('applications');
      expect(keywords).toContain('smartmemory');
      expect(keywords).toContain('agents');
    });

    test('should extract business-related keywords', () => {
      const content = 'We are a startup looking for scalable infrastructure solutions';
      const keywords = extractKeywords(content);

      expect(keywords).toContain('startup');
      expect(keywords).toContain('scalable');
      expect(keywords).toContain('infrastructure');
      expect(keywords).toContain('solutions');
    });

    test('should normalize keywords to lowercase', () => {
      const content = 'RAINDROP Platform AI AGENTS';
      const keywords = extractKeywords(content);

      expect(keywords).toContain('raindrop');
      expect(keywords).toContain('platform');
      expect(keywords).toContain('ai');
      expect(keywords).toContain('agents');
      expect(keywords).not.toContain('RAINDROP');
    });

    test('should filter out common stop words', () => {
      const content = 'I am interested in the platform and would like to know more about it';
      const keywords = extractKeywords(content);

      expect(keywords).not.toContain('i');
      expect(keywords).not.toContain('am');
      expect(keywords).not.toContain('the');
      expect(keywords).not.toContain('and');
      expect(keywords).not.toContain('to');
      expect(keywords).not.toContain('it');
      expect(keywords).toContain('interested');
      expect(keywords).toContain('platform');
    });

    test('should handle empty or invalid content', () => {
      expect(extractKeywords('')).toEqual([]);
      expect(extractKeywords('   ')).toEqual([]);
      expect(extractKeywords(null as any)).toEqual([]);
      expect(extractKeywords(undefined as any)).toEqual([]);
    });

    test('should handle special characters and numbers', () => {
      const content = 'AI/ML platform $100/month @ scale 2024';
      const keywords = extractKeywords(content);

      expect(keywords).toContain('ai/ml');
      expect(keywords).toContain('platform');
      expect(keywords).toContain('scale');
      expect(keywords).not.toContain('$100/month');
      expect(keywords).not.toContain('2024');
    });
  });

  describe('calculateCategoryConfidence', () => {
    test('should return high confidence for QUALIFY_LEAD with technical keywords', () => {
      const keywords = ['raindrop', 'ai', 'agents', 'smartmemory', 'build', 'scale', 'infrastructure'];
      const confidence = calculateCategoryConfidence(keywords, 'QUALIFY_LEAD');

      expect(confidence).toBeGreaterThan(0.7);
      expect(confidence).toBeLessThanOrEqual(1.0);
    });

    test('should return medium confidence for ADD_LEAD with business keywords', () => {
      const keywords = ['business', 'startup', 'interested', 'solutions', 'inquiry'];
      const confidence = calculateCategoryConfidence(keywords, 'ADD_LEAD');

      expect(confidence).toBeGreaterThan(0.4);
      expect(confidence).toBeLessThan(0.8);
    });

    test('should return high confidence for IRRELEVANT with spam keywords', () => {
      const keywords = ['spam', 'viagra', 'lottery', 'winner', 'free', 'money'];
      const confidence = calculateCategoryConfidence(keywords, 'IRRELEVANT');

      expect(confidence).toBeGreaterThan(0.7);
      expect(confidence).toBeLessThanOrEqual(1.0);
    });

    test('should return low confidence for AMBIGUOUS with vague keywords', () => {
      const keywords = ['hello', 'thanks', 'maybe', 'later'];
      const confidence = calculateCategoryConfidence(keywords, 'AMBIGUOUS');

      expect(confidence).toBeGreaterThan(0.3);
      expect(confidence).toBeLessThan(0.7);
    });

    test('should handle empty keywords array', () => {
      const confidence = calculateCategoryConfidence([], 'AMBIGUOUS');
      expect(confidence).toBe(0.5); // Default confidence for no keywords
    });

    test('should handle invalid category type', () => {
      const keywords = ['test', 'keywords'];
      const confidence = calculateCategoryConfidence(keywords, 'INVALID' as any);
      expect(confidence).toBe(0.0); // No confidence for invalid category
    });

    test('should return confidence between 0 and 1', () => {
      const keywords = ['test', 'keywords', 'multiple', 'items'];
      const categories: CategoryType[] = ['ADD_LEAD', 'QUALIFY_LEAD', 'IRRELEVANT', 'AMBIGUOUS'];

      categories.forEach(category => {
        const confidence = calculateCategoryConfidence(keywords, category);
        expect(confidence).toBeGreaterThanOrEqual(0);
        expect(confidence).toBeLessThanOrEqual(1);
      });
    });
  });
});