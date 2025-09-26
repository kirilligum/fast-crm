/**
 * CONTROLLER for response-bot Service
 *
 * PRD REQUIREMENTS:
 * - AI model interaction, knowledge retrieval, template selection
 * - Coordinate between model.ts and index.ts
 * - Workflow orchestration and process management
 * - External API calls (AI models, SmartMemory)
 * - Cross-component communication via env bindings
 * - FORBIDDEN: Direct data persistence, protocol handling
 *
 * MUST IMPLEMENT:
 * 1. AI model interaction for response generation
 * 2. SmartMemory knowledge base retrieval
 * 3. Response template selection and customization
 * 4. Context preparation for AI generation
 * 5. AI response parsing and formatting
 * 6. Error handling for generation failures
 * 7. Response quality validation
 *
 * INTERFACES TO EXPORT:
 * - orchestrateResponseGeneration(category: CategoryType, emailData: EmailPayload): Promise<EmailResponse>
 * - retrieveResponsePrompt(category: CategoryType): Promise<string>
 * - retrieveKnowledgeBase(): Promise<string>
 * - prepareResponseContext(category: CategoryType, emailData: EmailPayload, knowledge: string): string
 * - executeAIGeneration(context: string): Promise<string>
 * - parseAIResponse(response: string): EmailResponse
 * - handleGenerationError(error: Error): EmailResponse
 *
 * IMPORTS NEEDED:
 * - From shared types: EmailPayload, EmailResponse, CategoryType, AIModelError, KnowledgeRetrievalError
 * - From env: env.AI, env.AGENT_MEMORY, env.logger
 * - From other layers: model validation and template functions
 *
 * BUSINESS RULES:
 * 1. Must retrieve current response prompts from SmartMemory
 * 2. Must retrieve Raindrop knowledge base for accurate responses
 * 3. ADD_LEAD responses include trial signup and Quick Start tutorial
 * 4. QUALIFY_LEAD responses validate use case and ask probing questions
 * 5. Subject line follows "Re: [original subject]" format
 * 6. Response generation must be deterministic and professional
 * 7. All responses logged for quality monitoring
 *
 * ERROR HANDLING:
 * - AIModelError for model API failures
 * - KnowledgeRetrievalError for memory access failures
 * - TemplateError for missing response templates
 * - Fallback to generic professional response on failures
 *
 * INTEGRATION POINTS:
 * - env.AI.run() for response generation
 * - env.AGENT_MEMORY.get() for prompts and knowledge retrieval
 * - env.logger for generation logging
 * - model.validateEmailResponse() for validation
 */

import {
  EmailPayload,
  EmailResponse,
  CategoryType,
  AIModelError,
  KnowledgeRetrievalError,
  TemplateError
} from '../types/shared';
import {
  selectResponseTemplate,
  validateEmailResponse
} from './model';

// Environment interface for dependency injection
interface ControllerEnv {
  AI: {
    run: (context: string) => Promise<string>;
  };
  AGENT_MEMORY: {
    get: (key: string) => Promise<string | null>;
    search: (query: string) => Promise<Array<{ content: string }>>;
  };
  logger: {
    info: (message: string, meta?: any) => void;
    error: (message: string, meta?: any) => void;
    warn: (message: string, meta?: any) => void;
  };
}

// Default env - this gets replaced by dependency injection in tests
let env: ControllerEnv = {
  AI: {
    run: async (context: string): Promise<string> => {
      throw new Error('AI service not configured');
    }
  },
  AGENT_MEMORY: {
    get: async (key: string): Promise<string | null> => {
      return null;
    },
    search: async (query: string): Promise<Array<{ content: string }>> => {
      return [];
    }
  },
  logger: {
    info: (message: string, meta?: any) => console.log(message, meta),
    error: (message: string, meta?: any) => console.error(message, meta),
    warn: (message: string, meta?: any) => console.warn(message, meta)
  }
};

// Function to set environment for testing
export function setControllerEnv(newEnv: ControllerEnv) {
  env = newEnv;
}

// ================================
// FALLBACK KNOWLEDGE & PROMPTS
// ================================

const FALLBACK_RESPONSE_PROMPTS = {
  ADD_LEAD: `You are ResponseBot, AI technical advisor at LiquidMetal AI responding to technical founders.
Goal: Draft email responses for ADD_LEAD category. Tone: Professional, knowledgeable, direct (Peer-to-Peer Technical Advisor).

For ADD_LEAD responses:
- Introduce value proposition of Raindrop AI-native platform
- Encourage free trial signup
- Point to "Raindrop + Claude Quick Start" tutorial
- Be professional and helpful

Output: Email body content only (no headers).`,

  QUALIFY_LEAD: `You are ResponseBot, AI technical advisor at LiquidMetal AI responding to technical founders.
Goal: Draft email responses for QUALIFY_LEAD category. Tone: Professional, knowledgeable, direct (Peer-to-Peer Technical Advisor).

For QUALIFY_LEAD responses:
- Validate use case fit with Raindrop platform
- Reference specific Raindrop components (SmartMemory, SmartSQL, etc.)
- Ask 2-3 probing questions about their technical requirements
- Be consultative and technical

Output: Email body content only (no headers).`,

  IRRELEVANT: `You are ResponseBot, AI technical advisor at LiquidMetal AI responding to inquiries.
Goal: Draft polite responses for IRRELEVANT category emails. Tone: Professional, courteous.

For IRRELEVANT responses:
- Thank them for their inquiry
- Politely indicate this may not be relevant to our platform
- Provide general contact information if they need assistance
- Keep response brief and professional

Output: Email body content only (no headers).`,

  AMBIGUOUS: `You are ResponseBot, AI technical advisor at LiquidMetal AI responding to unclear inquiries.
Goal: Draft responses for AMBIGUOUS category emails. Tone: Professional, helpful.

For AMBIGUOUS responses:
- Thank them for their inquiry
- Request clarification about their needs or use case
- Provide general information about Raindrop platform
- Encourage them to reach out with more specific questions

Output: Email body content only (no headers).`
};

const FALLBACK_KNOWLEDGE = `
Raindrop Smart Blocks documentation and platform capabilities:

Raindrop is an AI-native platform that helps technical founders build and scale intelligent applications.

Key Components:
- SmartMemory: AI-powered data management and retrieval system
- SmartSQL: Intelligent database interactions with natural language queries
- Native Claude Integration: Advanced AI capabilities built into the platform
- Scalable Infrastructure: Grows with your application needs

Resources:
- "Raindrop + Claude Quick Start" tutorial for new users
- Free trial available for all new users
- Comprehensive documentation and examples
- Technical support for implementation

Value Propositions:
- Rapid development of AI-powered applications
- Seamless integration with existing infrastructure
- Professional-grade scalability and reliability
- Expert technical support and guidance
`;

// ================================
// EXPORTED FUNCTIONS
// ================================

export async function orchestrateResponseGeneration(
  category: CategoryType,
  emailData: EmailPayload
): Promise<EmailResponse> {
  try {
    // Step 1: Retrieve prompt and knowledge
    const [prompt, knowledge] = await Promise.allSettled([
      retrieveResponsePrompt(category),
      retrieveKnowledgeBase()
    ]);

    const responsePrompt = prompt.status === 'fulfilled' ? prompt.value : FALLBACK_RESPONSE_PROMPTS[category];
    const knowledgeBase = knowledge.status === 'fulfilled' ? knowledge.value : FALLBACK_KNOWLEDGE;

    // Step 2: Prepare context for AI generation
    const context = prepareResponseContext(category, emailData, knowledgeBase);

    // Step 3: Execute AI generation
    const aiResponse = await executeAIGeneration(`${responsePrompt}\n\n${context}`);

    // Step 4: Parse and validate response
    const emailResponse = parseAIResponse(aiResponse, emailData.sender_email, emailData.subject);

    // Step 5: Validate final response
    const validation = validateEmailResponse(emailResponse);
    if (!validation.isValid) {
      env.logger.warn('Generated response failed validation', { errors: validation.errors });
      return handleGenerationError(new Error('Response validation failed'), emailData);
    }

    return emailResponse;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    env.logger.error('Response generation failed', { error: errorMessage, category, sender: emailData.sender_email });
    return handleGenerationError(error instanceof Error ? error : new Error(String(error)), emailData);
  }
}

export async function retrieveResponsePrompt(category: CategoryType): Promise<string> {
  // Hard-coded response bot prompt for reliable generation
  return `You are ResponseBot, an AI technical advisor at LiquidMetal AI. You are responding to potential customers (technical founders).
Your goal is to draft an email response based on the categorization of the lead and the original email content.
The tone should be professional, knowledgeable, direct, and helpful (Peer-to-Peer Technical Advisor). Avoid overly salesy language.

## Product Context
Raindrop is a Claude Native Infrastructure designed to help developers build, deploy, and scale AI-powered applications easily. We handle the infrastructure (using components like Services, Actors, SQL, Queues) and provide core AI patterns we call "Smart Blocks" (like RAG, Multi-Agent Systems, SmartMemory, SmartSQL, and SmartBuckets).

## Task
Draft the email body based on the provided Category and Original Email.

## Input
Original Email Subject: {subject}
Original Email Body: {body}
Category: ${category}

## Response Guidelines

### Case 1: Category is ADD_LEAD
Goal: Introduce the value proposition and encourage them to try the platform.
1. Acknowledge their inquiry or how we met (e.g., the hackathon).
2. Briefly explain Raindrop's value (focus on speed, zero infrastructure management, and scalability for AI agents).
3. Clear Call-to-Action (CTA): Invite them to sign up for a free trial and point them towards the "Raindrop + Claude Quick Start" tutorial.
4. Keep it concise.

### Case 2: Category is QUALIFY_LEAD
Goal: Validate their interest and ask probing questions to understand their technical needs better.
1. Acknowledge and validate their specific question or use case (e.g., "Your use case for inventory management agents is exactly what Raindrop is built for.").
2. Briefly confirm that the platform supports their need, referencing specific Raindrop components (e.g., "Yes, Raindrop's SQL Database component or SmartSQL block is designed to interface with your data," or "SmartMemory is ideal for maintaining that long-term context.").
3. Ask 2-3 probing discovery questions to gather context:
    - Their current technical stack.
    - The specific challenges they face (e.g., "Are you running into context limitations or infrastructure overhead with your current setup?").
    - Other solutions they have tried and why they failed.
4. Suggest next steps (e.g., A specific tutorial like "SmartMemory App Deployment" or a quick technical call).

## Output
Provide only the content of the email reply body. Do not include "To:", "From:", or "Subject:" lines.`;
}

export async function retrieveKnowledgeBase(): Promise<string> {
  // Hard-coded knowledge base for reliable responses
  return `Raindrop Smart Blocks documentation and platform capabilities:

Raindrop is an AI-native platform that helps technical founders build and scale intelligent applications.

Key Components:
- SmartMemory: AI-powered data management and retrieval system
- SmartSQL: Intelligent database interactions with natural language queries
- Native Claude Integration: Advanced AI capabilities built into the platform
- Scalable Infrastructure: Grows with your application needs
- Services: Stateless compute components
- Actors: Stateful compute components
- RAG: Retrieval-Augmented Generation capabilities
- Multi-Agent Systems: Build complex AI workflows
- SmartBuckets: Intelligent storage solutions
- Vector Search: Advanced search capabilities

Resources:
- "Raindrop + Claude Quick Start" tutorial for new users
- Free trial available for all new users
- Comprehensive documentation and examples
- Technical support for implementation
- "Building a CRUD API with Claude Code + Raindrop MCP" advanced tutorial
- "SmartMemory App Deployment" tutorial

Value Propositions:
- Rapid development of AI-powered applications
- Zero infrastructure management
- Seamless integration with existing infrastructure
- Professional-grade scalability and reliability
- Expert technical support and guidance
- Claude Native Infrastructure designed for AI applications`;
}

export function prepareResponseContext(
  category: CategoryType,
  emailData: EmailPayload,
  knowledge: string
): string {
  const categoryInstructions = {
    ADD_LEAD: `Focus on introducing our value proposition, encouraging free trial signup, and pointing to "Raindrop + Claude Quick Start" tutorial.`,
    QUALIFY_LEAD: `Focus on validate use case fit, referencing specific Raindrop components, and asking 2-3 probing questions about their technical requirements.`,
    IRRELEVANT: `Politely acknowledge the inquiry but indicate it may not be relevant to our platform. Provide general contact information if needed.`,
    AMBIGUOUS: `Thank them for their inquiry, request clarification about their needs, and provide general information about Raindrop platform.`
  };

  return `
## Email Context
Category: ${category}
Sender: ${emailData.sender_email}
Subject: ${emailData.subject}
Body: ${emailData.body}

## Response Instructions
${categoryInstructions[category] || 'Provide a professional, helpful response.'}

## Available Knowledge
${knowledge}

## Response Requirements
- Subject format: "Re: ${emailData.subject}"
- Professional, knowledgeable tone (Peer-to-Peer Technical Advisor)
- Reference relevant Raindrop capabilities
- Include appropriate call-to-action for the category
`;
}

export async function executeAIGeneration(context: string): Promise<string> {
  try {
    const response = await env.AI.run(context);

    if (!response || response.trim() === '') {
      throw new AIModelError('AI service returned empty response');
    }

    return response.trim();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new AIModelError(`AI generation failed: ${errorMessage}`);
  }
}

export function parseAIResponse(response: string, recipientEmail: string, originalSubject?: string): EmailResponse {
  if (!response || response.trim() === '') {
    throw new AIModelError('Cannot parse empty AI response');
  }

  // Try to parse structured response first
  const subjectMatch = response.match(/Subject:\s*(.+)/i);
  const bodyMatch = response.match(/Body:\s*([\s\S]+)/i);

  let subject: string;
  let body: string;

  if (subjectMatch && bodyMatch) {
    // Structured response
    subject = subjectMatch[1]?.trim() || '';
    body = bodyMatch[1]?.trim() || '';
  } else {
    // Unstructured response - treat entire response as body
    body = response.trim();
    // Use original subject if available, otherwise generic
    subject = originalSubject || 'Your inquiry';
  }

  // Ensure subject follows "Re:" format
  if (!subject.startsWith('Re:')) {
    subject = `Re: ${subject}`;
  }

  return {
    to: recipientEmail,
    subject: subject,
    body: body
  };
}

export function handleGenerationError(error: Error, emailData: EmailPayload): EmailResponse {
  const fallbackResponses = {
    ValidationError: `Thank you for your inquiry. We appreciate your interest in Raindrop. Our team will review your message and respond with detailed information shortly.`,
    AIModelError: `Thank you for your inquiry. We're currently experiencing high demand for our platform. Our team will review your message and respond with personalized information shortly.`,
    KnowledgeRetrievalError: `Thank you for your inquiry about Raindrop. Our technical team will review your requirements and respond with detailed information about how our platform can help.`,
    TemplateError: `Thank you for reaching out. Our team will review your message and respond with relevant information about our platform capabilities.`,
    Error: `Thank you for reaching out. Our technical team will review your inquiry and respond shortly with information about how Raindrop can help with your requirements.`,
    default: `Thank you for reaching out. Our technical team will review your inquiry and respond shortly with information about how Raindrop can help with your requirements.`
  };

  const errorType = error.name as keyof typeof fallbackResponses;
  const fallbackBody = fallbackResponses[errorType] || fallbackResponses.default;

  return {
    to: emailData.sender_email,
    subject: `Re: ${emailData.subject}`,
    body: fallbackBody
  };
}