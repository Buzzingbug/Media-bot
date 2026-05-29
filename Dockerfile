FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy root package.json
COPY package.json .

# Copy backend and frontend source
COPY backend /app/backend
COPY frontend /app/frontend

# Install root/backend dependencies
RUN npm install --production

# Install frontend dependencies and build
WORKDIR /app/frontend
RUN npm install
RUN npm run build

# Switch back to root
WORKDIR /app

# Expose API/Frontend port
EXPOSE 3001

# Start the server
CMD ["node", "backend/server.js"]
