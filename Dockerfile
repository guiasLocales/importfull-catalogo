FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .

# Force rebuild (change this value to bust cache)
ARG CACHEBUST=2

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Explicitly copy critical files to fail build if missing
COPY main.py /app/
COPY db_conn.py /app/
COPY . /app/

# DEBUG: List files to confirm main.py exists
RUN echo "=== FINAL FILE LISTING ===" && ls -la /app && echo "========================"

# Run the application
CMD ["python", "/app/main.py"]
