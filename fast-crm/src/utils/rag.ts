/**
 * RAG (Retrieval-Augmented Generation) utilities for email history
 *
 * Provides functionality for:
 * - Storing email history in SmartBucket with chunking
 * - Retrieving relevant context from previous conversations
 * - Preparing context for AI response generation
 */

import { EmailPayload } from '../types/shared';

export interface EmailChunk {
  id: string;
  sender_email: string;
  timestamp: string;
  subject: string;
  content: string;
  chunk_index: number;
  total_chunks: number;
  metadata: {
    email_type: 'incoming' | 'outgoing';
    category?: string;
    interaction_id: string;
  };
}

export interface RAGContext {
  relevant_chunks: EmailChunk[];
  conversation_summary: string;
  previous_interactions: number;
}

/**
 * Chunk email content into smaller, semantically meaningful pieces
 */
export function chunkEmailContent(
  email: EmailPayload,
  category: string,
  interactionId: string,
  maxChunkSize: number = 300
): EmailChunk[] {
  const chunks: EmailChunk[] = [];

  // Combine subject and body for full context
  const fullContent = `Subject: ${email.subject}\n\nBody: ${email.body}`;

  // Simple chunking by sentences/paragraphs
  const sentences = fullContent.split(/[.!?]\s+/).filter(s => s.trim().length > 10);

  let currentChunk = '';
  let chunkIndex = 0;

  for (const sentence of sentences) {
    const potentialChunk = currentChunk + (currentChunk ? '. ' : '') + sentence;

    if (potentialChunk.length > maxChunkSize && currentChunk.length > 0) {
      // Save current chunk and start new one
      chunks.push(createEmailChunk(
        email,
        currentChunk,
        chunkIndex,
        category,
        interactionId
      ));

      currentChunk = sentence;
      chunkIndex++;
    } else {
      currentChunk = potentialChunk;
    }
  }

  // Add final chunk if there's remaining content
  if (currentChunk.length > 0) {
    chunks.push(createEmailChunk(
      email,
      currentChunk,
      chunkIndex,
      category,
      interactionId
    ));
  }

  // Update total_chunks for all chunks
  chunks.forEach(chunk => {
    chunk.total_chunks = chunks.length;
  });

  return chunks;
}

/**
 * Create a single email chunk with metadata
 */
function createEmailChunk(
  email: EmailPayload,
  content: string,
  chunkIndex: number,
  category: string,
  interactionId: string
): EmailChunk {
  return {
    id: `${email.sender_email}_${interactionId}_${chunkIndex}`,
    sender_email: email.sender_email,
    timestamp: new Date().toISOString(),
    subject: email.subject,
    content: content.trim(),
    chunk_index: chunkIndex,
    total_chunks: 0, // Will be updated later
    metadata: {
      email_type: 'incoming',
      category,
      interaction_id: interactionId
    }
  };
}

/**
 * Create chunks for outgoing response emails
 */
export function chunkResponseEmail(
  recipientEmail: string,
  subject: string,
  body: string,
  category: string,
  interactionId: string
): EmailChunk[] {
  const responseEmail: EmailPayload = {
    sender_email: recipientEmail, // For storage purposes, track by recipient
    subject,
    body
  };

  const chunks = chunkEmailContent(responseEmail, category, interactionId);

  // Mark as outgoing responses
  chunks.forEach(chunk => {
    chunk.metadata.email_type = 'outgoing';
    chunk.id = `${recipientEmail}_response_${interactionId}_${chunk.chunk_index}`;
  });

  return chunks;
}

/**
 * Format chunks for SmartBucket storage
 */
export function formatChunksForStorage(chunks: EmailChunk[]): Array<{
  key: string;
  content: string;
  metadata: Record<string, any>;
}> {
  return chunks.map(chunk => ({
    key: chunk.id,
    content: chunk.content,
    metadata: {
      sender_email: chunk.sender_email,
      timestamp: chunk.timestamp,
      subject: chunk.subject,
      chunk_index: chunk.chunk_index,
      total_chunks: chunk.total_chunks,
      email_type: chunk.metadata.email_type,
      category: chunk.metadata.category,
      interaction_id: chunk.metadata.interaction_id
    }
  }));
}

/**
 * Prepare RAG context from retrieved chunks for prompt enhancement
 */
export function prepareRAGContext(chunks: EmailChunk[]): RAGContext {
  if (chunks.length === 0) {
    return {
      relevant_chunks: [],
      conversation_summary: 'No previous conversation history found.',
      previous_interactions: 0
    };
  }

  // Sort chunks by timestamp (most recent first)
  const sortedChunks = chunks.sort((a, b) =>
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  // Group by interaction ID to count interactions
  const uniqueInteractions = new Set(
    chunks.map(chunk => chunk.metadata.interaction_id)
  );

  // Create conversation summary
  const recentSubjects = [...new Set(
    sortedChunks.slice(0, 5).map(chunk => chunk.subject).filter(Boolean)
  )];

  const conversationSummary = sortedChunks.length > 0 && sortedChunks[0]
    ? `Previous conversation topics: ${recentSubjects.join(', ')}. ` +
      `Most recent interaction on ${new Date(sortedChunks[0].timestamp).toLocaleDateString()}.`
    : 'No previous conversation history.';

  return {
    relevant_chunks: sortedChunks.slice(0, 8), // Top 8 most relevant chunks
    conversation_summary: conversationSummary,
    previous_interactions: uniqueInteractions.size
  };
}

/**
 * Build enhanced prompt with RAG context
 */
export function buildRAGEnhancedPrompt(
  basePrompt: string,
  ragContext: RAGContext,
  currentEmail: EmailPayload
): string {
  if (ragContext.relevant_chunks.length === 0) {
    return basePrompt;
  }

  const contextSection = `
## CONVERSATION HISTORY CONTEXT

${ragContext.conversation_summary}

### Previous Email Exchanges:
${ragContext.relevant_chunks.map((chunk, index) =>
  `${index + 1}. [${chunk.metadata.email_type.toUpperCase()}] ${chunk.subject}
     Content: ${chunk.content.substring(0, 200)}${chunk.content.length > 200 ? '...' : ''}
     Date: ${new Date(chunk.timestamp).toLocaleDateString()}`
).join('\n\n')}

### Current Email Context:
Subject: ${currentEmail.subject}
Content: ${currentEmail.body}

IMPORTANT: Use this conversation history to provide contextual, personalized responses that reference previous discussions when relevant. Maintain continuity in the conversation while addressing the current inquiry.

---

`;

  return contextSection + basePrompt;
}

/**
 * Extract search terms from email for RAG retrieval
 */
export function extractSearchTerms(email: EmailPayload): string[] {
  const text = `${email.subject} ${email.body}`.toLowerCase();

  // Extract key technical terms and concepts
  const technicalTerms = [
    'smartmemory', 'smartsql', 'smartbucket', 'raindrop', 'ai', 'agent',
    'vector', 'embedding', 'rag', 'claude', 'actor', 'service', 'api',
    'database', 'sql', 'nosql', 'scaling', 'performance', 'infrastructure',
    'deployment', 'docker', 'kubernetes', 'microservice', 'serverless'
  ];

  const foundTerms = technicalTerms.filter(term => text.includes(term));

  // Add sender email domain for user-specific context
  const emailDomain = email.sender_email.split('@')[1];
  if (emailDomain) {
    foundTerms.push(emailDomain);
  }

  // Add key words from subject and body (simple extraction)
  const words = text.match(/\b[a-z]{4,}\b/g) || [];
  const importantWords = words.filter(word =>
    word.length > 4 &&
    !['the', 'and', 'for', 'with', 'from', 'this', 'that', 'have', 'been', 'your', 'what', 'when', 'where', 'will', 'would', 'could', 'should'].includes(word)
  );

  foundTerms.push(...importantWords.slice(0, 5));

  return [...new Set(foundTerms)]; // Remove duplicates
}