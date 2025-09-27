/**
 * Advisor RAG utilities for document-based response enhancement
 *
 * Provides functionality for:
 * - Processing uploaded documents (books, texts) into advisory chunks
 * - Retrieving relevant advisor context for email responses
 * - Enhancing AI prompts with expert knowledge from documents
 */

import { EmailPayload } from '../types/shared';

export interface AdvisorDocument {
  id: string;
  title: string;
  author?: string;
  content: string;
  upload_timestamp: string;
  chunk_count: number;
  metadata: {
    document_type: 'book' | 'article' | 'manual' | 'guide' | 'other';
    domain: string; // e.g., 'sales', 'marketing', 'leadership', 'technical'
    language: string;
  };
}

export interface AdvisorChunk {
  id: string;
  document_id: string;
  document_title: string;
  content: string;
  chunk_index: number;
  total_chunks: number;
  metadata: {
    section_title?: string;
    page_number?: number;
    topic_keywords: string[];
    relevance_score?: number;
  };
}

export interface AdvisorContext {
  relevant_chunks: AdvisorChunk[];
  documents_used: string[];
  advice_summary: string;
  confidence_score: number;
}

/**
 * Process uploaded document text into semantic chunks for advisor RAG
 */
export function processAdvisorDocument(
  title: string,
  content: string,
  author?: string,
  documentType: AdvisorDocument['metadata']['document_type'] = 'other',
  domain: string = 'general'
): AdvisorDocument {
  const documentId = generateDocumentId(title, author);

  // Clean and normalize content
  const cleanedContent = cleanDocumentContent(content);

  // Estimate chunk count (will be updated when actually chunked)
  const estimatedChunks = Math.ceil(cleanedContent.length / 500);

  return {
    id: documentId,
    title: title.trim(),
    author: author?.trim(),
    content: cleanedContent,
    upload_timestamp: new Date().toISOString(),
    chunk_count: estimatedChunks,
    metadata: {
      document_type: documentType,
      domain: domain.toLowerCase(),
      language: 'en' // Could be enhanced with language detection
    }
  };
}

/**
 * Chunk advisor document into semantic pieces for RAG retrieval
 */
export function chunkAdvisorDocument(
  document: AdvisorDocument,
  maxChunkSize: number = 500
): AdvisorChunk[] {
  const chunks: AdvisorChunk[] = [];

  // Split by paragraphs first, then by sentences if needed
  const paragraphs = document.content.split(/\n\s*\n/).filter(p => p.trim().length > 50);

  let currentChunk = '';
  let chunkIndex = 0;
  let currentSection = '';

  for (const paragraph of paragraphs) {
    // Check if this might be a section header
    if (paragraph.length < 100 && paragraph.match(/^[A-Z][^.]*$/)) {
      currentSection = paragraph.trim();
    }

    const potentialChunk = currentChunk + (currentChunk ? '\n\n' : '') + paragraph;

    if (potentialChunk.length > maxChunkSize && currentChunk.length > 0) {
      // Save current chunk
      chunks.push(createAdvisorChunk(
        document,
        currentChunk,
        chunkIndex,
        currentSection
      ));

      currentChunk = paragraph;
      chunkIndex++;
    } else {
      currentChunk = potentialChunk;
    }
  }

  // Add final chunk
  if (currentChunk.length > 0) {
    chunks.push(createAdvisorChunk(
      document,
      currentChunk,
      chunkIndex,
      currentSection
    ));
  }

  // Update total chunks for all chunks
  chunks.forEach(chunk => {
    chunk.total_chunks = chunks.length;
  });

  return chunks;
}

/**
 * Create a single advisor chunk with metadata
 */
function createAdvisorChunk(
  document: AdvisorDocument,
  content: string,
  chunkIndex: number,
  sectionTitle?: string
): AdvisorChunk {
  const keywords = extractKeywords(content);

  return {
    id: `${document.id}_chunk_${chunkIndex}`,
    document_id: document.id,
    document_title: document.title,
    content: content.trim(),
    chunk_index: chunkIndex,
    total_chunks: 0, // Will be updated later
    metadata: {
      section_title: sectionTitle,
      topic_keywords: keywords,
    }
  };
}

/**
 * Retrieve advisor context for email response enhancement
 */
export function prepareAdvisorContext(
  chunks: AdvisorChunk[],
  emailData: EmailPayload,
  maxChunks: number = 3
): AdvisorContext {
  if (chunks.length === 0) {
    return {
      relevant_chunks: [],
      documents_used: [],
      advice_summary: 'No advisor knowledge available.',
      confidence_score: 0
    };
  }

  // Sort chunks by relevance (simplified - could use embeddings)
  const emailKeywords = extractKeywords(`${emailData.subject} ${emailData.body}`);
  const rankedChunks = chunks.map(chunk => ({
    ...chunk,
    metadata: {
      ...chunk.metadata,
      relevance_score: calculateRelevanceScore(chunk, emailKeywords)
    }
  })).sort((a, b) => (b.metadata.relevance_score || 0) - (a.metadata.relevance_score || 0));

  const topChunks = rankedChunks.slice(0, maxChunks);
  const uniqueDocuments = [...new Set(topChunks.map(c => c.document_title))];

  const adviceSummary = generateAdviceSummary(topChunks, emailData);
  const confidenceScore = calculateConfidenceScore(topChunks);

  return {
    relevant_chunks: topChunks,
    documents_used: uniqueDocuments,
    advice_summary: adviceSummary,
    confidence_score: confidenceScore
  };
}

/**
 * Build enhanced prompt with advisor context
 */
export function buildAdvisorEnhancedPrompt(
  basePrompt: string,
  advisorContext: AdvisorContext,
  emailData: EmailPayload
): string {
  if (advisorContext.relevant_chunks.length === 0) {
    return basePrompt;
  }

  const advisorSection = `
## EXPERT ADVISOR CONTEXT

You have access to expert advice from the following sources:
**Documents**: ${advisorContext.documents_used.join(', ')}
**Confidence**: ${(advisorContext.confidence_score * 100).toFixed(0)}%

### Expert Advice for This Response:
${advisorContext.advice_summary}

### Relevant Knowledge Excerpts:
${advisorContext.relevant_chunks.map((chunk, index) =>
  `${index + 1}. From "${chunk.document_title}" ${chunk.metadata.section_title ? `(${chunk.metadata.section_title})` : ''}:
     ${chunk.content.substring(0, 300)}${chunk.content.length > 300 ? '...' : ''}`
).join('\n\n')}

### Guidelines for Using Advisor Knowledge:
- Integrate expert insights naturally into your response
- Reference authoritative sources when appropriate
- Adapt advice to the specific context of the email
- Maintain the professional, helpful tone while adding expertise
- Don't directly quote unless highly relevant

---

`;

  return advisorSection + basePrompt;
}

/**
 * Format advisor chunks for SmartBucket storage
 */
export function formatAdvisorChunksForStorage(chunks: AdvisorChunk[]): Array<{
  key: string;
  content: string;
  metadata: Record<string, any>;
}> {
  return chunks.map(chunk => ({
    key: chunk.id,
    content: chunk.content,
    metadata: {
      document_id: chunk.document_id,
      document_title: chunk.document_title,
      chunk_index: chunk.chunk_index,
      total_chunks: chunk.total_chunks,
      section_title: chunk.metadata.section_title,
      topic_keywords: chunk.metadata.topic_keywords,
      relevance_score: chunk.metadata.relevance_score
    }
  }));
}

// Helper functions

function generateDocumentId(title: string, author?: string): string {
  const base = `${title}_${author || 'unknown'}`.toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `doc_${base}_${Date.now()}`;
}

function cleanDocumentContent(content: string): string {
  return content
    .replace(/\r\n/g, '\n') // Normalize line endings
    .replace(/\n{3,}/g, '\n\n') // Reduce excessive line breaks
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

function extractKeywords(text: string): string[] {
  const words = text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 3);

  // Simple keyword extraction - could be enhanced with NLP
  const stopWords = new Set(['this', 'that', 'with', 'have', 'will', 'from', 'they', 'been', 'were', 'said', 'each', 'which', 'their', 'time', 'more', 'very', 'when', 'come', 'here', 'just', 'like', 'over', 'also', 'back', 'after', 'first', 'well', 'many', 'some', 'would', 'could', 'should']);

  const filteredWords = words.filter(word => !stopWords.has(word));

  // Get unique words and limit to most frequent
  const wordCount = new Map<string, number>();
  filteredWords.forEach(word => {
    wordCount.set(word, (wordCount.get(word) || 0) + 1);
  });

  return Array.from(wordCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);
}

function calculateRelevanceScore(chunk: AdvisorChunk, emailKeywords: string[]): number {
  const chunkKeywords = chunk.metadata.topic_keywords;
  const overlap = chunkKeywords.filter(keyword =>
    emailKeywords.some(emailKeyword =>
      keyword.includes(emailKeyword) || emailKeyword.includes(keyword)
    )
  ).length;

  return overlap / Math.max(chunkKeywords.length, emailKeywords.length, 1);
}

function generateAdviceSummary(chunks: AdvisorChunk[], emailData: EmailPayload): string {
  if (chunks.length === 0) return 'No relevant advice found.';

  const mainTopics = chunks.flatMap(c => c.metadata.topic_keywords).slice(0, 5);
  const sources = [...new Set(chunks.map(c => c.document_title))];

  return `Based on ${sources.join(' and ')}, focus on ${mainTopics.join(', ')} when responding to this ${emailData.subject.toLowerCase().includes('pricing') ? 'pricing inquiry' : emailData.subject.toLowerCase().includes('technical') ? 'technical question' : 'business inquiry'}. The expert knowledge suggests addressing concerns about implementation, value proposition, and next steps.`;
}

function calculateConfidenceScore(chunks: AdvisorChunk[]): number {
  if (chunks.length === 0) return 0;

  const avgRelevance = chunks.reduce((sum, chunk) =>
    sum + (chunk.metadata.relevance_score || 0), 0) / chunks.length;

  // Factor in number of chunks and their relevance
  const chunkBonus = Math.min(chunks.length / 3, 1) * 0.3;
  return Math.min(avgRelevance + chunkBonus, 1);
}