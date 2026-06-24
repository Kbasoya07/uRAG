import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { 
  listDocuments, 
  ingestDocuments, 
  similaritySearch, 
  loadVectorStore, 
  saveVectorStore, 
  ingestUploadedDocument 
} from './utils/vectorStore.js';
import { getQueryEmbedding } from './utils/embeddings.js';
import { generateAnswer } from './utils/groqClient.js';

dotenv.config();

const app = express();
// Hugging Face Spaces exposes port 7860 by default
const PORT = process.env.PORT || 7860;

app.use(cors());
app.use(express.json());

// Set up document directories
const documentsDir = path.resolve('documents');
const uploadsDir = path.join(documentsDir, 'uploads');
if (!fs.existsSync(documentsDir)) {
  fs.mkdirSync(documentsDir, { recursive: true });
}
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Serve static PDFs for inline loading / viewing
app.use('/pdfs', express.static(documentsDir));

// Serve static compiled React files from frontend build
const frontendDistPath = path.resolve('../frontend/dist');
app.use(express.static(frontendDistPath));

// Configure Multer for PDF uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // Generate clean filenames
    const cleanName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, `${Date.now()}-${cleanName}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB file size limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Only PDF files are allowed.'));
    }
    cb(null, true);
  }
});

/**
 * Endpoint: Get list of documents and their status
 */
app.get('/api/documents', (req, res) => {
  try {
    const docs = listDocuments();
    res.json({ success: true, documents: docs });
  } catch (error) {
    console.error('Error listing documents:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Endpoint: Ingest pending local PDFs (documents in base documents folder)
 */
app.post('/api/ingest', async (req, res) => {
  try {
    const result = await ingestDocuments();
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Error during ingestion:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Endpoint: Upload a custom PDF file (limit 5 files, max 600 pages)
 */
app.post('/api/upload', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    // 1. Enforce max 5 custom uploaded files
    const uploadedFiles = fs.readdirSync(uploadsDir).filter(f => f.endsWith('.pdf'));
    if (uploadedFiles.length > 5) {
      // Delete the file immediately
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({ 
        success: false, 
        error: 'Upload Limit Exceeded: You can only upload up to 5 custom documents. Please delete one of your uploaded files or request a larger limit.'
      });
    }

    console.log(`Ingesting uploaded document: ${req.file.filename}`);
    
    // 2. Ingest document (enforces page count <= 600 internally)
    const result = await ingestUploadedDocument(req.file.filename, req.file.path);
    
    res.json({ 
      success: true, 
      message: result.message,
      document: {
        name: req.file.filename,
        isUpload: true,
        status: 'ingested'
      }
    });
  } catch (error) {
    console.error('Error during upload ingestion:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Endpoint: Delete an uploaded PDF file and its vector store embeddings
 */
app.delete('/api/documents/:name', (req, res) => {
  const { name } = req.params;
  try {
    const filePath = path.join(uploadsDir, name);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'File not found.' });
    }

    // Delete file
    fs.unlinkSync(filePath);

    // Delete vectors
    let store = loadVectorStore();
    store = store.filter(chunk => chunk.filename !== name);
    saveVectorStore(store);

    res.json({ success: true, message: `Successfully deleted uploaded document: ${name}` });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Endpoint: Query the RAG system
 */
app.post('/api/query', async (req, res) => {
  const { query } = req.body;
  if (!query || typeof query !== 'string') {
    return res.status(400).json({ success: false, error: 'Query parameter is required' });
  }

  try {
    console.log(`Received query: "${query}"`);
    const queryEmbedding = await getQueryEmbedding(query);
    const relevantChunks = await similaritySearch(queryEmbedding, 5);
    
    if (relevantChunks.length === 0) {
      return res.json({
        success: true,
        answer: "No documents have been indexed yet. Please upload PDF files or sync the knowledge base to start.",
        sources: []
      });
    }

    const answer = await generateAnswer(query, relevantChunks);
    
    const seen = new Set();
    const sources = [];
    for (const chunk of relevantChunks) {
      const key = `${chunk.filename}-p${chunk.page}`;
      if (!seen.has(key)) {
        seen.add(key);
        sources.push({
          filename: chunk.filename,
          page: chunk.page,
          text: chunk.text
        });
      }
    }

    res.json({ success: true, answer, sources });
  } catch (error) {
    console.error('Query pipeline error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Wildcard route to serve the built index.html for Single Page App router
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/pdfs')) {
    return next();
  }
  const indexPath = path.join(frontendDistPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.send("Sample RAG Backend running. Serve files: React build not found.");
  }
});

app.listen(PORT, () => {
  console.log(`RAG Server running on port ${PORT}`);
});
