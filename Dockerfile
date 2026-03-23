FROM node:22-bookworm

# Electron + xterm.js dependencies for headless rendering
RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb \
    git \
    python3 python3-pip \
    build-essential \
    libgtk-3-0 libnss3 libgbm1 libasound2 libatk-bridge2.0-0 \
    libdrm2 libxcomposite1 libxdamage1 libxrandr2 libxshmfence1 \
    libcairo2-dev libjpeg-dev libpango1.0-dev libgif-dev \
    && rm -rf /var/lib/apt/lists/*

# Mock Claude CLI (stub that responds to --version)
RUN printf '#!/bin/bash\nif [[ "$1" == "--version" || "$1" == "-v" ]]; then echo "claude-code 1.0.0 (mock)"; else echo "Mock Claude CLI — not a real session"; fi\n' > /usr/local/bin/claude \
    && chmod +x /usr/local/bin/claude

WORKDIR /app

# Install dependencies (cached layer)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source
COPY . .

# Build the app
RUN npx electron-vite build

# Run tests with virtual display
ENV DISPLAY=:99
CMD ["xvfb-run", "--auto-servernum", "--server-args=-screen 0 1920x1080x24", "npx", "playwright", "test", "--reporter=line"]
