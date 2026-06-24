import fs from 'fs';
import pdf from 'pdf-parse';

const filePath = 'documents/L15XAI.pdf';

if (!fs.existsSync(filePath)) {
  console.log(`File not found: ${filePath}`);
  process.exit(1);
}

const dataBuffer = fs.readFileSync(filePath);

pdf(dataBuffer).then(function(data) {
  console.log('--- Metadata ---');
  console.log('Pages:', data.numpages);
  console.log('Info:', data.info);
  console.log('--- Text Sample (first 500 chars) ---');
  console.log(JSON.stringify(data.text.slice(0, 500)));
  console.log('Total characters extracted:', data.text.length);
}).catch(err => {
  console.error(err);
});
