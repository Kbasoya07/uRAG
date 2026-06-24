import fs from 'fs';
import path from 'path';
import { parsePdfPages } from './pdfParser.js';
import { getEmbeddings } from './embeddings.js';

const STORE_PATH = path.resolve('store/vector_store.json');
const DOCUMENTS_DIR = path.resolve('documents');

/**
 * Cosine similarity helper
 */
function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0.0;
  let normA = 0.0;
  let normB = 0.0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  if (normA === 0 || normB === 0) return 0.0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Split text into chunks with overlap
 */
function chunkText(text, filename, page, chunkSize = 600, overlap = 120) {
  const chunks = [];
  let start = 0;
  
  if (text.length <= chunkSize) {
    return [{
      id: `${filename}-p${page}-c0`,
      filename,
      page,
      text: text.trim()
    }];
  }

  let chunkCount = 0;
  while (start < text.length) {
    let end = start + chunkSize;
    let chunk = text.slice(start, end);
    
    chunks.push({
      id: `${filename}-p${page}-c${chunkCount}`,
      filename,
      page,
      text: chunk.trim()
    });
    
    start += (chunkSize - overlap);
    chunkCount++;
  }
  
  return chunks;
}

/**
 * Load vector store from disk
 */
export function loadVectorStore() {
  if (!fs.existsSync(STORE_PATH)) {
    return [];
  }
  try {
    const data = fs.readFileSync(STORE_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Failed to parse vector store JSON:', error);
    return [];
  }
}

/**
 * Save vector store to disk
 */
export function saveVectorStore(store) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf-8');
}

/**
 * Lists all PDFs in the documents folder and their ingestion status
 */
export function listDocuments() {
  const documents = [];
  
  // List base documents
  if (fs.existsSync(DOCUMENTS_DIR)) {
    const files = fs.readdirSync(DOCUMENTS_DIR).filter(file => file.endsWith('.pdf'));
    documents.push(...files.map(f => ({ name: f, isUpload: false })));
  }
  
  // List uploaded documents
  const uploadsDir = path.join(DOCUMENTS_DIR, 'uploads');
  if (fs.existsSync(uploadsDir)) {
    const files = fs.readdirSync(uploadsDir).filter(file => file.endsWith('.pdf'));
    documents.push(...files.map(f => ({ name: f, isUpload: true })));
  }
  
  const store = loadVectorStore();
  const fileStatuses = {};
  for (const chunk of store) {
    if (!fileStatuses[chunk.filename]) {
      fileStatuses[chunk.filename] = 'error'; // default to error placeholder
    }
    if (chunk.page > 0) {
      fileStatuses[chunk.filename] = 'ingested'; // has actual parsed text page
    }
  }
  
  return documents.map(doc => ({
    name: doc.name,
    isUpload: doc.isUpload,
    status: fileStatuses[doc.name] || 'pending'
  }));
}

/**
 * Ingests all pending PDFs in the documents folder
 */
export async function ingestDocuments() {
  const documents = listDocuments();
  const pendingDocs = documents.filter(doc => doc.status === 'pending');
  
  if (pendingDocs.length === 0) {
    return { message: 'All documents are already ingested.' };
  }
  
  console.log(`Starting ingestion of ${pendingDocs.length} pending PDFs...`);
  let store = loadVectorStore();
  
  for (const doc of pendingDocs) {
    const filePath = path.join(DOCUMENTS_DIR, doc.name);
    console.log(`Parsing pages for: ${doc.name}`);
    
    // 1. Extract pages
    const pages = await parsePdfPages(filePath);
    console.log(`Extracted ${pages.length} pages from ${doc.name}. Chunking...`);
    
    // 2. Create chunks
    let docChunks = [];
    for (const pageObj of pages) {
      if (!pageObj.text.trim()) continue; // skip blank pages
      const chunks = chunkText(pageObj.text, doc.name, pageObj.page);
      docChunks = docChunks.concat(chunks);
    }
    
    if (docChunks.length === 0) {
      console.warn(`No text chunks found in ${doc.name}. Storing empty placeholder to mark as ingested.`);
      store.push({
        id: `${doc.name}-empty`,
        filename: doc.name,
        page: 0,
        text: "[This document contains images only and no selectable text. No context was indexed.]",
        vector: Array(384).fill(0)
      });
      saveVectorStore(store);
      continue;
    }
    
    console.log(`Generated ${docChunks.length} chunks for ${doc.name}. Calculating embeddings...`);
    
    // 3. Batch generate embeddings (Hugging Face has strict payload limits, we send 20 chunks at a time)
    const batchSize = 20;
    const vectors = [];
    
    for (let i = 0; i < docChunks.length; i += batchSize) {
      const batch = docChunks.slice(i, i + batchSize);
      const texts = batch.map(c => c.text);
      console.log(`Embedding chunks ${i + 1} to ${Math.min(i + batchSize, docChunks.length)} for ${doc.name}`);
      
      const batchVectors = await getEmbeddings(texts);
      vectors.push(...batchVectors);
    }
    
    // 4. Attach vectors to chunks and append to store
    const chunksWithVectors = docChunks.map((chunk, index) => ({
      ...chunk,
      vector: vectors[index]
    }));
    
    store = store.concat(chunksWithVectors);
    
    // Save incrementally
    saveVectorStore(store);
    console.log(`Successfully ingested and saved: ${doc.name}`);
  }
  
  return { message: 'Ingestion completed successfully.' };
}

/**
 * Searches the vector store for top K matching chunks based on query embedding
 */
export async function similaritySearch(queryEmbedding, topK = 5) {
  const store = loadVectorStore();
  const activeStore = store.filter(item => item.page > 0);
  if (activeStore.length === 0) {
    return [];
  }
  
  const results = activeStore.map(item => {
    const similarity = cosineSimilarity(queryEmbedding, item.vector);
    return {
      filename: item.filename,
      page: item.page,
      text: item.text,
      similarity
    };
  });
  
  // Sort descending and take top K
  return results
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
}

/**
 * Ingests a single uploaded PDF file
 * Enforces the max 600 page limit
 */
export async function ingestUploadedDocument(fileName, filePath) {
  // 1. Extract pages
  const pages = await parsePdfPages(filePath);
  
  if (pages.length > 600) {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    throw new Error(`The uploaded PDF has ${pages.length} pages, which exceeds the limit of 600 pages.`);
  }
  
  console.log(`Ingesting uploaded PDF: ${fileName} (${pages.length} pages)`);
  let store = loadVectorStore();
  
  // 2. Create chunks
  let docChunks = [];
  for (const pageObj of pages) {
    if (!pageObj.text.trim()) continue; // skip blank pages
    const chunks = chunkText(pageObj.text, fileName, pageObj.page);
    docChunks = docChunks.concat(chunks);
  }
  
  if (docChunks.length === 0) {
    console.warn(`No text chunks found in ${fileName}. Storing empty placeholder to mark as ingested.`);
    store.push({
      id: `${fileName}-empty`,
      filename: fileName,
      page: 0,
      text: "[This document contains images only and no selectable text. No context was indexed.]",
      vector: Array(384).fill(0)
    });
    saveVectorStore(store);
    return { success: true, message: 'Document contains no text, ingested as empty placeholder.' };
  }
  
  // 3. Embed chunks in batches
  const batchSize = 20;
  const vectors = [];
  
  for (let i = 0; i < docChunks.length; i += batchSize) {
    const batch = docChunks.slice(i, i + batchSize);
    const texts = batch.map(c => c.text);
    const batchVectors = await getEmbeddings(texts);
    vectors.push(...batchVectors);
  }
  
  const chunksWithVectors = docChunks.map((chunk, index) => ({
    ...chunk,
    vector: vectors[index]
  }));
  
  store = store.concat(chunksWithVectors);
  saveVectorStore(store);
  
  return { success: true, message: 'Successfully uploaded and indexed document.' };
}
