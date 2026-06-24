import dotenv from 'dotenv';

dotenv.config();

const HF_API_URL = 'https://router.huggingface.co/hf-inference/models/sentence-transformers/all-MiniLM-L6-v2/pipeline/feature-extraction';

/**
 * Sleep helper function
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetch embeddings for a batch of text chunks using Hugging Face Inference API.
 * Handles the "Model loading" status with automatic retries.
 */
export async function getEmbeddings(texts, retries = 5, delay = 10000) {
  const hfToken = process.env.HF_TOKEN;
  if (!hfToken || hfToken.startsWith('your_')) {
    throw new Error('HF_TOKEN is missing or not configured in .env file.');
  }

  // Ensure texts is an array
  const inputs = Array.isArray(texts) ? texts : [texts];

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(HF_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${hfToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ inputs }),
      });

      const result = await response.json();

      if (response.status === 200) {
        return result; // Array of embeddings
      }

      // If model is loading, wait and retry
      if (result.error && result.error.includes('loading')) {
        const waitTime = result.estimated_time ? Math.ceil(result.estimated_time) * 1000 : delay;
        console.log(`Hugging Face model is loading. Attempt ${attempt}/${retries}. Waiting ${waitTime / 1000}s...`);
        await sleep(waitTime);
        continue;
      }

      throw new Error(result.error || `Hugging Face API returned status code ${response.status}`);
    } catch (error) {
      if (attempt === retries) {
        throw error;
      }
      console.warn(`Hugging Face API request failed (Attempt ${attempt}/${retries}). Retrying... Error: ${error.message}`);
      await sleep(delay);
    }
  }

  throw new Error('Failed to retrieve embeddings from Hugging Face after maximum retries.');
}

/**
 * Get embedding for a single query text
 */
export async function getQueryEmbedding(text) {
  const embeddings = await getEmbeddings([text]);
  return embeddings[0];
}
