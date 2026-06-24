import fitz # PyMuPDF

filePath = "documents/L15XAI.pdf"
try:
    doc = fitz.open(filePath)
    print("--- PyMuPDF (fitz) extraction ---")
    print("Total pages:", len(doc))
    for i in range(min(5, len(doc))):
        page = doc[i]
        text = page.get_text()
        print(f"Page {i+1} Text Length: {len(text)}")
        if len(text) > 0:
            print(f"Page {i+1} Sample: {repr(text[:200])}")
except Exception as e:
    print("Error:", e)
