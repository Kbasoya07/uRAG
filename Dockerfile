# Use Node.js base image
FROM node:20-slim

# Set up and build the React frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Set up the Node.js backend
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install --omit=dev
COPY backend/ ./

# Expose port 7860 (Hugging Face Spaces default port)
EXPOSE 7860

# Force environment port to 7860
ENV PORT=7860

# Start backend server
CMD ["node", "index.js"]
