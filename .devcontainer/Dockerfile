FROM mcr.microsoft.com/devcontainers/javascript-node:3-22-bookworm

# Layer 1: Update and upgrade system packages
RUN apt-get update && apt-get upgrade -y

# Layer 2: Install PostgreSQL client
RUN apt-get install -y postgresql-client \
    && apt-get clean -y && rm -rf /var/lib/apt/lists/*
