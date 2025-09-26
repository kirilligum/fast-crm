import { expect, test, describe } from 'vitest';
import {
  validateEmailPayload,
  formatProcessEmailResponse,
  validateLeadStatus,
  sanitizeEmailContent
} from './model';
import {
  EmailPayload,
  ProcessEmailResponse,
  CategoryResult,
  ValidationError
} from '../../../src/types/shared';

describe('Model Validation Functions - TDD RED PHASE', () => {
  describe('validateEmailPayload', () => {
    test('should reject invalid email format', () => {
      const invalidPayload: EmailPayload = {
        sender_email: 'invalid-email',
        subject: 'Test Subject',
        body: 'Test body content'
      };

      expect(() => validateEmailPayload(invalidPayload)).toThrow(ValidationError);
      expect(() => validateEmailPayload(invalidPayload)).toThrow('Invalid email format');
    });

    test('should reject empty subject', () => {
      const invalidPayload: EmailPayload = {
        sender_email: 'test@example.com',
        subject: '',
        body: 'Test body content'
      };

      expect(() => validateEmailPayload(invalidPayload)).toThrow(ValidationError);
      expect(() => validateEmailPayload(invalidPayload)).toThrow('Subject cannot be empty');
    });

    test('should reject empty body', () => {
      const invalidPayload: EmailPayload = {
        sender_email: 'test@example.com',
        subject: 'Test Subject',
        body: ''
      };

      expect(() => validateEmailPayload(invalidPayload)).toThrow(ValidationError);
      expect(() => validateEmailPayload(invalidPayload)).toThrow('Body cannot be empty');
    });

    test('should reject missing fields', () => {
      const invalidPayload = {
        sender_email: 'test@example.com',
        subject: 'Test Subject'
        // body is missing
      } as EmailPayload;

      expect(() => validateEmailPayload(invalidPayload)).toThrow(ValidationError);
      expect(() => validateEmailPayload(invalidPayload)).toThrow('Body is required');
    });

    test('should accept valid email payload', () => {
      const validPayload: EmailPayload = {
        sender_email: 'test@example.com',
        subject: 'Test Subject',
        body: 'Test body content'
      };

      expect(() => validateEmailPayload(validPayload)).not.toThrow();
      const result = validateEmailPayload(validPayload);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe('validateLeadStatus', () => {
    test('should reject invalid lead status', () => {
      expect(validateLeadStatus('Invalid')).toBe(false);
      expect(validateLeadStatus('PENDING')).toBe(false);
      expect(validateLeadStatus('')).toBe(false);
      expect(validateLeadStatus('lead')).toBe(false); // case sensitive
    });

    test('should accept valid lead statuses', () => {
      expect(validateLeadStatus('Lead')).toBe(true);
      expect(validateLeadStatus('Qualified')).toBe(true);
    });
  });

  describe('sanitizeEmailContent', () => {
    test('should remove HTML tags', () => {
      const dirtyContent = '<script>alert("xss")</script>Hello <b>World</b>';
      const cleanContent = sanitizeEmailContent(dirtyContent);
      expect(cleanContent).toBe('Hello World');
      expect(cleanContent).not.toContain('<script>');
      expect(cleanContent).not.toContain('<b>');
    });

    test('should handle SQL injection attempts', () => {
      const dirtyContent = "'; DROP TABLE users; --";
      const cleanContent = sanitizeEmailContent(dirtyContent);
      expect(cleanContent).not.toContain('DROP TABLE');
      expect(cleanContent).not.toContain(';');
    });

    test('should preserve normal text', () => {
      const normalContent = 'Hello, this is a normal email message.';
      const cleanContent = sanitizeEmailContent(normalContent);
      expect(cleanContent).toBe(normalContent);
    });

    test('should handle special characters properly', () => {
      const specialContent = 'Price: $100 & taxes included';
      const cleanContent = sanitizeEmailContent(specialContent);
      expect(cleanContent).toBe('Price: $100 & taxes included');
    });
  });

  describe('formatProcessEmailResponse', () => {
    test('should format complete response data', () => {
      const categoryResult: CategoryResult = {
        category: 'ADD_LEAD',
        reason: 'New potential customer inquiry'
      };

      const responseData = {
        categoryResult,
        senderEmail: 'test@example.com',
        dbAction: 'INSERT INTO leads',
        responseEmail: {
          to: 'test@example.com',
          subject: 'Re: Test Subject',
          body: 'Thank you for your inquiry'
        },
        requiresReview: false
      };

      const result = formatProcessEmailResponse(responseData);

      expect(result.status).toBe('processed');
      expect(result.category).toBe('ADD_LEAD');
      expect(result.sender_email).toBe('test@example.com');
      expect(result.db_action).toBe('INSERT INTO leads');
      expect(result.response_email).toEqual({
        to: 'test@example.com',
        subject: 'Re: Test Subject',
        body: 'Thank you for your inquiry'
      });
      expect(result.requires_review).toBe(false);
      expect(result.error).toBeUndefined();
    });

    test('should format error response', () => {
      const responseData = {
        categoryResult: {
          category: 'AMBIGUOUS' as const,
          reason: 'Processing error'
        },
        senderEmail: 'test@example.com',
        dbAction: 'No action taken',
        responseEmail: null,
        requiresReview: true,
        error: 'AI model unavailable'
      };

      const result = formatProcessEmailResponse(responseData);

      expect(result.status).toBe('error');
      expect(result.category).toBe('AMBIGUOUS');
      expect(result.response_email).toBeNull();
      expect(result.requires_review).toBe(true);
      expect(result.error).toBe('AI model unavailable');
    });
  });
});