import dotenv from 'dotenv';
import Groq from 'groq-sdk';

dotenv.config();

async function testKeys() {
  console.log('--- Testing API Keys ---');
  
  // 1. Test Hugging Face Connection
  const hfToken = process.env.HF_TOKEN;
  console.log(`Hugging Face Token: ${hfToken ? 'Configured (starts with ' + hfToken.slice(0, 4) + '...)' : 'Missing'}`);
  
  if (hfToken) {
    try {
      console.log('Sending test embedding request to Hugging Face...');
      const response = await fetch('https://router.huggingface.co/hf-inference/models/sentence-transformers/all-MiniLM-L6-v2/pipeline/feature-extraction', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${hfToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ inputs: ['Hello world test embedding'] }),
      });
      const result = await response.json();
      if (response.status === 200 && Array.isArray(result)) {
        console.log('✅ Hugging Face embedding API connected successfully!');
        console.log(`Embedding dimensions: ${result[0].length}`);
      } else {
        console.error('❌ Hugging Face API error:', result);
      }
    } catch (err) {
      console.error('❌ Hugging Face request failed:', err.message);
    }
  }

  // 2. Test Groq Connection
  const groqKey = process.env.GROQ_API_KEY;
  console.log(`\nGroq API Key: ${groqKey ? 'Configured (starts with ' + groqKey.slice(0, 4) + '...)' : 'Missing'}`);
  
  if (groqKey) {
    try {
      console.log('Sending test chat completion request to Groq...');
      const groq = new Groq({ apiKey: groqKey });
      const completion = await groq.chat.completions.create({
        messages: [{ role: 'user', content: 'Say hello!' }],
        model: 'llama-3.1-8b-instant',
      });
      console.log('✅ Groq LLM API connected successfully!');
      console.log(`Response: "${completion.choices[0]?.message?.content.trim()}"`);
    } catch (err) {
      console.error('❌ Groq API error:', err.message);
    }
  }
}

testKeys();
