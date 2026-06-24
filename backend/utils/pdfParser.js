import fs from 'fs';
import pdf from 'pdf-parse';

/**
 * Parses a PDF file and extracts text page-by-page.
 * Returns an array of objects: [{ page: number, text: string }]
 */
export async function parsePdfPages(filePath) {
  const dataBuffer = fs.readFileSync(filePath);
  const pages = [];

  // A custom render function to capture page numbers and text
  async function renderPage(pageData) {
    const textContent = await pageData.getTextContent();
    let lastY, text = '';
    
    for (let item of textContent.items) {
      if (lastY === undefined || lastY === item.transform[5]) {
        text += item.str + ' ';
      } else {
        text += '\n' + item.str + ' ';
      }
      lastY = item.transform[5];
    }
    
    const pageNum = pageData.pageIndex + 1; // 1-based index
    pages.push({
      page: pageNum,
      text: text.trim()
    });
    
    return text;
  }

  const options = {
    pagerender: renderPage
  };

  await pdf(dataBuffer, options);

  // Since rendering is asynchronous, we sort the pages to ensure proper order
  pages.sort((a, b) => a.page - b.page);
  return pages;
}
