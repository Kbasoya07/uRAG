import fs from 'fs';

const store = JSON.parse(fs.readFileSync('store/vector_store.json', 'utf-8'));
const files = {};

for (const chunk of store) {
  if (chunk.page === 0) continue; // skip placeholders
  if (!files[chunk.filename]) {
    files[chunk.filename] = [];
  }
  files[chunk.filename].push(chunk);
}

console.log('--- Ingested Files Summary ---');
for (const [filename, chunks] of Object.entries(files)) {
  console.log(`\nFile: ${filename} (${chunks.length} chunks)`);
  console.log('Sample Chunk 1:', chunks[0]?.text.slice(0, 300) + '...');
  if (chunks[1]) {
    console.log('Sample Chunk 2:', chunks[1]?.text.slice(0, 300) + '...');
  }
}
