FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies for mysql-connector-python
RUN apt-get update && apt-get install -y \
    gcc libmariadb-dev pkg-config mariadb-client && \
    rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY . .
