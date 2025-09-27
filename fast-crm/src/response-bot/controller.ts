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
import {
  chunkEmailContent,
  chunkResponseEmail,
  formatChunksForStorage,
  prepareRAGContext,
  buildRAGEnhancedPrompt,
  extractSearchTerms
} from '../utils/rag';
import {
  prepareAdvisorContext,
  buildAdvisorEnhancedPrompt
} from '../utils/advisor';

// Environment interface for dependency injection
interface ControllerEnv {
  AI: {
    run: (context: string) => Promise<string>;
  };
  AGENT_MEMORY: {
    get: (key: string) => Promise<string | null>;
    search: (query: string) => Promise<Array<{ content: string }>>;
  };
  EMAIL_HISTORY: {
    put: (key: string, content: string, metadata?: Record<string, any>) => Promise<void>;
    search: (query: string, limit?: number) => Promise<Array<{
      key: string;
      content: string;
      metadata: Record<string, any>;
      score: number;
    }>>;
  };
  ADVISOR_KNOWLEDGE: {
    search: (query: string, limit?: number) => Promise<Array<{
      key: string;
      content: string;
      metadata: Record<string, any>;
      score: number;
    }>>;
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
  EMAIL_HISTORY: {
    put: async (key: string, content: string, metadata?: Record<string, any>): Promise<void> => {
      // Default implementation - no-op
    },
    search: async (query: string, limit?: number): Promise<Array<{
      key: string;
      content: string;
      metadata: Record<string, any>;
      score: number;
    }>> => {
      return [];
    }
  },
  ADVISOR_KNOWLEDGE: {
    search: async (query: string, limit?: number): Promise<Array<{
      key: string;
      content: string;
      metadata: Record<string, any>;
      score: number;
    }>> => {
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
// ADVISOR RAG FUNCTIONS
// ================================

async function retrieveAdvisorContext(emailData: EmailPayload): Promise<any> {
  try {
    // Extract search terms from email for advisor knowledge retrieval
    const searchTerms = extractSearchTerms(emailData);

    // Search advisor knowledge base for relevant chunks
    const advisorResults = await env.ADVISOR_KNOWLEDGE.search(searchTerms.join(' '), 3);

    if (advisorResults.length === 0) {
      env.logger.info('No relevant advisor knowledge found', { searchTerms });
      return {
        relevant_chunks: [],
        documents_used: [],
        advice_summary: 'No advisor knowledge available.',
        confidence_score: 0
      };
    }

    // Convert search results to advisor chunks format
    const advisorChunks = advisorResults.map(result => ({
      id: result.key,
      document_id: result.metadata.document_id || 'unknown',
      document_title: result.metadata.document_title || 'Unknown Document',
      content: result.content,
      chunk_index: result.metadata.chunk_index || 0,
      total_chunks: result.metadata.total_chunks || 1,
      metadata: {
        section_title: result.metadata.section_title,
        topic_keywords: result.metadata.topic_keywords || [],
        relevance_score: result.score
      }
    }));

    // Use advisor utilities to prepare context
    const advisorContext = prepareAdvisorContext(advisorChunks, emailData, 3);

    env.logger.info('Advisor context retrieved successfully', {
      chunks_found: advisorChunks.length,
      confidence_score: advisorContext.confidence_score,
      documents_used: advisorContext.documents_used
    });

    return advisorContext;
  } catch (error) {
    env.logger.error('Failed to retrieve advisor context', { error: error instanceof Error ? error.message : 'Unknown error' });
    return {
      relevant_chunks: [],
      documents_used: [],
      advice_summary: 'Advisor knowledge retrieval failed.',
      confidence_score: 0
    };
  }
}

// ================================
// EXPORTED FUNCTIONS
// ================================

export async function orchestrateResponseGeneration(
  category: CategoryType,
  emailData: EmailPayload
): Promise<EmailResponse> {
  const interactionId = generateInteractionId();

  try {
    // Step 1: Retrieve RAG context from email history and advisor knowledge
    const [ragContext, advisorContext] = await Promise.allSettled([
      retrieveRAGContext(emailData, interactionId),
      retrieveAdvisorContext(emailData)
    ]);

    const emailRagContext = ragContext.status === 'fulfilled' ? ragContext.value : { relevant_chunks: [], conversation_summary: '', confidence_score: 0 };
    const advisorRagContext = advisorContext.status === 'fulfilled' ? advisorContext.value : { relevant_chunks: [], documents_used: [], advice_summary: '', confidence_score: 0 };

    // Step 2: Retrieve prompt and knowledge
    const [prompt, knowledge] = await Promise.allSettled([
      retrieveResponsePrompt(category),
      retrieveKnowledgeBase()
    ]);

    const responsePrompt = prompt.status === 'fulfilled' ? prompt.value : FALLBACK_RESPONSE_PROMPTS[category];
    const knowledgeBase = knowledge.status === 'fulfilled' ? knowledge.value : FALLBACK_KNOWLEDGE;

    // Step 3: Prepare multi-layered RAG-enhanced context for AI generation
    const baseContext = prepareResponseContext(category, emailData, knowledgeBase);

    // Build email RAG enhanced prompt first
    const emailRagEnhancedPrompt = buildRAGEnhancedPrompt(responsePrompt, emailRagContext, emailData);

    // Then enhance with advisor knowledge
    const advisorEnhancedPrompt = buildAdvisorEnhancedPrompt(emailRagEnhancedPrompt, advisorRagContext, emailData);

    // Step 4: Execute AI generation with both RAG contexts
    const aiResponse = await executeAIGeneration(`${advisorEnhancedPrompt}\n\n${baseContext}`);

    // Step 5: Parse and validate response
    const emailResponse = parseAIResponse(aiResponse, emailData.sender_email, emailData.subject);

    // Step 6: Validate final response
    const validation = validateEmailResponse(emailResponse);
    if (!validation.isValid) {
      env.logger.warn('Generated response failed validation', { errors: validation.errors });
      return handleGenerationError(new Error('Response validation failed'), emailData);
    }

    // Step 7: Store email and response in RAG system for future context
    await storeEmailInRAG(emailData, emailResponse, category, interactionId);

    env.logger.info('Multi-RAG enhanced response generated successfully', {
      sender: emailData.sender_email,
      category,
      email_rag_chunks_used: emailRagContext.relevant_chunks.length,
      advisor_chunks_used: advisorRagContext.relevant_chunks.length,
      advisor_documents_used: advisorRagContext.documents_used,
      advisor_confidence: advisorRagContext.confidence_score,
      interaction_id: interactionId
    });

    return emailResponse;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    env.logger.error('RAG-enhanced response generation failed', {
      error: errorMessage,
      category,
      sender: emailData.sender_email,
      interaction_id: interactionId
    });
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

// ================================
// RAG FUNCTIONS
// ================================

export function generateInteractionId(): string {
  return `interaction_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

export async function retrieveRAGContext(emailData: EmailPayload, interactionId: string): Promise<any> {
  try {
    // Extract search terms from current email
    const searchTerms = extractSearchTerms(emailData);
    const searchQuery = `sender:${emailData.sender_email} ${searchTerms.slice(0, 5).join(' ')}`;

    env.logger.info('Retrieving RAG context', {
      sender: emailData.sender_email,
      search_terms: searchTerms.slice(0, 5),
      interaction_id: interactionId
    });

    // Search for relevant email history
    const searchResults = await env.EMAIL_HISTORY.search(searchQuery);
    const limitedResults = searchResults.slice(0, 10);

    // Convert search results to email chunks format
    const relevantChunks = limitedResults.map((result: any) => ({
      id: result.key,
      sender_email: result.metadata.sender_email || emailData.sender_email,
      timestamp: result.metadata.timestamp || new Date().toISOString(),
      subject: result.metadata.subject || '',
      content: result.content,
      chunk_index: result.metadata.chunk_index || 0,
      total_chunks: result.metadata.total_chunks || 1,
      metadata: {
        email_type: result.metadata.email_type || 'incoming',
        category: result.metadata.category,
        interaction_id: result.metadata.interaction_id || 'unknown'
      }
    }));

    return prepareRAGContext(relevantChunks);
  } catch (error) {
    env.logger.warn('Failed to retrieve RAG context', {
      error: error instanceof Error ? error.message : String(error),
      sender: emailData.sender_email,
      interaction_id: interactionId
    });

    // Return empty context on failure
    return prepareRAGContext([]);
  }
}

export async function storeEmailInRAG(
  emailData: EmailPayload,
  responseEmail: EmailResponse,
  category: string,
  interactionId: string
): Promise<void> {
  try {
    // Chunk incoming email
    const incomingChunks = chunkEmailContent(emailData, category, interactionId);
    const incomingChunksForStorage = formatChunksForStorage(incomingChunks);

    // Chunk outgoing response
    const responseChunks = chunkResponseEmail(
      responseEmail.to,
      responseEmail.subject,
      responseEmail.body,
      category,
      interactionId
    );
    const responseChunksForStorage = formatChunksForStorage(responseChunks);

    // Store all chunks in SmartBucket
    const allChunks = [...incomingChunksForStorage, ...responseChunksForStorage];

    await Promise.all(
      allChunks.map(chunk =>
        env.EMAIL_HISTORY.put(chunk.key, chunk.content, chunk.metadata)
      )
    );

    env.logger.info('Email interaction stored in RAG system', {
      sender: emailData.sender_email,
      interaction_id: interactionId,
      chunks_stored: allChunks.length,
      incoming_chunks: incomingChunksForStorage.length,
      response_chunks: responseChunksForStorage.length
    });
  } catch (error) {
    env.logger.error('Failed to store email in RAG system', {
      error: error instanceof Error ? error.message : String(error),
      sender: emailData.sender_email,
      interaction_id: interactionId
    });
    // Don't throw - RAG storage failure shouldn't break response generation
  }
}