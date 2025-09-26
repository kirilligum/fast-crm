// Shared TypeScript interfaces for Fast-CRM application
// Used across all components for type safety and consistency

// API Request/Response Types
export interface EmailPayload {
  sender_email: string;
  subject: string;
  body: string;
}

export interface ProcessEmailRequest extends EmailPayload {}

export interface ProcessEmailResponse {
  status: 'processed' | 'error';
  category: CategoryType;
  sender_email: string;
  db_action: string;
  response_email: EmailResponse | null;
  requires_review: boolean;
  error?: string;
}

// Email Categorization Types
export type CategoryType = 'ADD_LEAD' | 'QUALIFY_LEAD' | 'IRRELEVANT' | 'AMBIGUOUS';

export interface CategoryResult {
  category: CategoryType;
  reason: string;
}

// Email Response Types
export interface EmailResponse {
  to: string;
  subject: string;
  body: string;
}

// Database Entity Types
export interface Lead {
  id: number;
  email: string;
  status: 'Lead' | 'Qualified';
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface LeadCreate {
  email: string;
  status: 'Lead' | 'Qualified';
  notes?: string;
}

export interface LeadUpdate {
  status?: 'Lead' | 'Qualified';
  notes?: string;
  updated_at?: Date;
}

// Agent Memory Types
export interface AgentPrompt {
  id: string;
  type: 'triage' | 'response';
  content: string;
  version: string;
}

export interface KnowledgeBase {
  id: string;
  topic: string;
  content: string;
  tags: string[];
}

export interface InteractionLog {
  id: string;
  timestamp: Date;
  email_payload: EmailPayload;
  category_result: CategoryResult;
  response_generated: EmailResponse;
  db_action: string;
}

// Error Types
export class ValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class AIModelError extends Error {
  constructor(message: string, public model?: string) {
    super(message);
    this.name = 'AIModelError';
  }
}

export class DatabaseError extends Error {
  constructor(message: string, public operation?: string) {
    super(message);
    this.name = 'DatabaseError';
  }
}

export class TemplateError extends Error {
  constructor(message: string, public templateType?: string) {
    super(message);
    this.name = 'TemplateError';
  }
}

export class KnowledgeRetrievalError extends Error {
  constructor(message: string, public knowledgeType?: string) {
    super(message);
    this.name = 'KnowledgeRetrievalError';
  }
}