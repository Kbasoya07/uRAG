import Groq from 'groq-sdk';
import dotenv from 'dotenv';

dotenv.config();

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

/**
 * Generates an answer using Groq Llama 3 model based on user query and retrieved context chunks
 */
export async function generateAnswer(query, retrievedChunks) {
  if (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY.startsWith('your_')) {
    throw new Error('GROQ_API_KEY is missing or not configured in .env file.');
  }

  // Format retrieved chunks into context string
  const contextText = retrievedChunks
    .map((chunk, idx) => `[Source ${idx + 1}: ${chunk.filename}, Page ${chunk.page}]\nContent: ${chunk.text}`)
    .join('\n\n---\n\n');

  const systemPrompt = `You are a helpful, precise RAG assistant. You answer questions about the provided documents.

Context documents:
---
${contextText}
---

INSTRUCTIONS:
1. Answer the query using ONLY the facts present in the Context documents above. Do NOT make up facts, draw external knowledge, or extrapolate beyond what is stated.
2. For every assertion, claim, or fact you write, you MUST cite the source document and page number in brackets (e.g. "[IDM_Subject_1.pdf, Page 12]" or "[IDM_Subject_2.pdf, Page 4]").
3. Put the citation immediately after the sentence or clause that relies on that source. Do not bundle all citations at the end of the paragraph.
4. If the context does not contain enough information to answer the question, state clearly that the information is not found in the documents. Do not attempt to guess or answer from general knowledge.`;

  try {
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: query }
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.1, // Low temperature for high factual accuracy
      max_tokens: 1024,
    });

    return chatCompletion.choices[0]?.message?.content || '';
  } catch (error) {
    console.error('Error calling Groq API:', error);
    throw new Error(`Groq API failure: ${error.message}`);
  }
}
