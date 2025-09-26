/**
 * COMPREHENSIVE TESTS for response-bot MODEL
 *
 * TDD RED PHASE: Write failing tests FIRST
 * These tests define the expected behavior for response validation,
 * template selection, tone validation, and content formatting.
 */

import { describe, test, expect } from 'vitest';
import {
  validateEmailResponse,
  selectResponseTemplate,
  validateTone,
  formatResponseContent,
  validateResponseStructure,
  calculateResponseQuality
} from './model';
import {
  EmailResponse,
  CategoryType,
  ValidationError,
  TemplateError
} from '../types/shared';

describe('response-bot Model - Email Response Validation', () => {
  const validEmailResponse: EmailResponse = {
    to: 'test@example.com',
    subject: 'Re: Your inquiry about Raindrop',
    body: 'Thank you for your interest in Raindrop. We appreciate your inquiry about our AI-powered platform...'
  };

  test('should validate a complete and valid email response', () => {
    const result = validateEmailResponse(validEmailResponse);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('should reject email response with missing to field', () => {
    const invalidResponse = { ...validEmailResponse, to: '' };
    const result = validateEmailResponse(invalidResponse);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Email recipient (to) is required');
  });

  test('should reject email response with invalid email format', () => {
    const invalidResponse = { ...validEmailResponse, to: 'invalid-email' };
    const result = validateEmailResponse(invalidResponse);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Invalid email format for recipient');
  });

  test('should reject email response with empty subject', () => {
    const invalidResponse = { ...validEmailResponse, subject: '' };
    const result = validateEmailResponse(invalidResponse);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Subject is required');
  });

  test('should reject email response with improper subject format', () => {
    const invalidResponse = { ...validEmailResponse, subject: 'Your inquiry about Raindrop' };
    const result = validateEmailResponse(invalidResponse);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Subject must follow "Re: [original subject]" format');
  });

  test('should reject email response with empty body', () => {
    const invalidResponse = { ...validEmailResponse, body: '' };
    const result = validateEmailResponse(invalidResponse);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Body content is required');
  });

  test('should reject email response with body too short', () => {
    const invalidResponse = { ...validEmailResponse, body: 'Hi' };
    const result = validateEmailResponse(invalidResponse);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Body content too short for meaningful response');
  });

  test('should reject email response with placeholder text', () => {
    const invalidResponse = { ...validEmailResponse, body: 'TODO: Write response content here' };
    const result = validateEmailResponse(invalidResponse);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Body contains placeholder text or TODO items');
  });
});

describe('response-bot Model - Template Selection', () => {
  test('should return ADD_LEAD template for ADD_LEAD category', () => {
    const template = selectResponseTemplate('ADD_LEAD');
    expect(template).toContain('value proposition');
    expect(template).toContain('free trial');
    expect(template).toContain('Raindrop + Claude Quick Start');
  });

  test('should return QUALIFY_LEAD template for QUALIFY_LEAD category', () => {
    const template = selectResponseTemplate('QUALIFY_LEAD');
    expect(template).toContain('validate use case');
    expect(template).toContain('Raindrop components');
    expect(template).toContain('probing questions');
  });

  test('should throw TemplateError for unsupported category', () => {
    expect(() => selectResponseTemplate('IRRELEVANT' as CategoryType)).toThrow(TemplateError);
    expect(() => selectResponseTemplate('AMBIGUOUS' as CategoryType)).toThrow(TemplateError);
  });

  test('should throw TemplateError for invalid category', () => {
    expect(() => selectResponseTemplate('INVALID' as CategoryType)).toThrow(TemplateError);
    expect(() => selectResponseTemplate(null as any)).toThrow(TemplateError);
  });
});

describe('response-bot Model - Tone Validation', () => {
  test('should validate professional and knowledgeable tone', () => {
    const professionalContent = 'Thank you for your inquiry about our AI platform. Based on your requirements, I recommend exploring our SmartMemory capabilities for your use case.';
    expect(validateTone(professionalContent)).toBe(true);
  });

  test('should reject overly casual tone', () => {
    const casualContent = 'Hey there! Thanks for reaching out. Our stuff is pretty cool and you should totally check it out!';
    expect(validateTone(casualContent)).toBe(false);
  });

  test('should reject overly salesy tone', () => {
    const salesyContent = 'AMAZING OFFER! Buy now and get 50% off! Limited time only! Don\'t miss out on this incredible deal!';
    expect(validateTone(salesyContent)).toBe(false);
  });

  test('should reject content with inappropriate language', () => {
    const inappropriateContent = 'This is damn good software that will blow your mind!';
    expect(validateTone(inappropriateContent)).toBe(false);
  });

  test('should reject empty or very short content', () => {
    expect(validateTone('')).toBe(false);
    expect(validateTone('Hi')).toBe(false);
  });
});

describe('response-bot Model - Content Formatting', () => {
  test('should format content with proper structure and spacing', () => {
    const rawContent = 'thank you for your inquiry.we appreciate your interest.please let us know if you have questions.';
    const formatted = formatResponseContent(rawContent);

    expect(formatted).toMatch(/^Thank you/); // Proper capitalization
    expect(formatted).toContain('\n\n'); // Proper paragraph spacing
    expect(formatted).not.toContain('..'); // No double periods
  });

  test('should preserve professional formatting', () => {
    const wellFormattedContent = 'Thank you for your inquiry about Raindrop.\n\nWe appreciate your interest in our AI platform.';
    const formatted = formatResponseContent(wellFormattedContent);

    expect(formatted).toBe(wellFormattedContent); // Should not change well-formatted content
  });

  test('should handle empty content gracefully', () => {
    expect(() => formatResponseContent('')).toThrow(ValidationError);
    expect(() => formatResponseContent(null as any)).toThrow(ValidationError);
  });
});

describe('response-bot Model - Response Structure Validation', () => {
  test('should validate and return proper EmailResponse structure', () => {
    const rawResponse = {
      to: 'test@example.com',
      subject: 'Re: Your inquiry',
      body: 'Thank you for reaching out.'
    };

    const validated = validateResponseStructure(rawResponse);
    expect(validated).toEqual(rawResponse);
    expect(validated.to).toBe('test@example.com');
    expect(validated.subject).toBe('Re: Your inquiry');
    expect(validated.body).toBe('Thank you for reaching out.');
  });

  test('should throw ValidationError for missing required fields', () => {
    const incompleteResponse = {
      to: 'test@example.com',
      subject: 'Re: Your inquiry'
      // missing body
    };

    expect(() => validateResponseStructure(incompleteResponse)).toThrow(ValidationError);
  });

  test('should throw ValidationError for invalid structure', () => {
    expect(() => validateResponseStructure(null)).toThrow(ValidationError);
    expect(() => validateResponseStructure('invalid')).toThrow(ValidationError);
    expect(() => validateResponseStructure({})).toThrow(ValidationError);
  });
});

describe('response-bot Model - Response Quality Calculation', () => {
  test('should calculate high quality score for comprehensive ADD_LEAD response', () => {
    const highQualityResponse: EmailResponse = {
      to: 'prospect@startup.com',
      subject: 'Re: Interested in AI development platform',
      body: 'Thank you for your interest in Raindrop. Our AI-native platform helps technical founders build and scale intelligent applications. I recommend starting with our free trial and checking out the "Raindrop + Claude Quick Start" tutorial.'
    };

    const quality = calculateResponseQuality(highQualityResponse);
    expect(quality).toBeGreaterThan(0.8);
  });

  test('should calculate high quality score for comprehensive QUALIFY_LEAD response', () => {
    const highQualityResponse: EmailResponse = {
      to: 'developer@techcorp.com',
      subject: 'Re: Technical requirements for AI integration',
      body: 'Thank you for reaching out about your AI integration needs. Based on your requirements, our SmartMemory and SmartSQL components could be ideal for your use case. Could you share more about: 1) Your current data infrastructure, 2) Expected query volumes, 3) Integration timeline requirements?'
    };

    const quality = calculateResponseQuality(highQualityResponse);
    expect(quality).toBeGreaterThan(0.8);
  });

  test('should calculate low quality score for generic response', () => {
    const lowQualityResponse: EmailResponse = {
      to: 'user@example.com',
      subject: 'Re: Hello',
      body: 'Thanks for your email.'
    };

    const quality = calculateResponseQuality(lowQualityResponse);
    expect(quality).toBeLessThan(0.5);
  });

  test('should handle empty response gracefully', () => {
    const emptyResponse: EmailResponse = {
      to: '',
      subject: '',
      body: ''
    };

    const quality = calculateResponseQuality(emptyResponse);
    expect(quality).toBe(0);
  });
});