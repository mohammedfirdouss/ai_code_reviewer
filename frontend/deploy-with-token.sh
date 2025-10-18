#!/bin/bash

# Cloudflare Pages Direct Deploy - No OAuth Required
# Uses API token from .env file

set -e  # Exit on error

echo "🚀 Cloudflare Pages Deployment (API Token Method)"
echo "================================================="

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Load .env file from project root
ENV_FILE="../.env"
if [ ! -f "$ENV_FILE" ]; then
    ENV_FILE=".env"
fi

if [ -f "$ENV_FILE" ]; then
    echo -e "${BLUE}📋 Loading credentials from .env...${NC}"
    export $(grep -v '^#' "$ENV_FILE" | xargs)
    echo -e "${GREEN}✅ Credentials loaded${NC}"
else
    echo -e "${RED}❌ .env file not found${NC}"
    exit 1
fi

# Verify credentials
if [ -z "$CLOUDFLARE_ACCOUNT_ID" ] || [ -z "$CLOUDFLARE_API_TOKEN" ]; then
    echo -e "${RED}❌ Missing credentials in .env file${NC}"
    echo "Required: CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN"
    exit 1
fi

echo "Account ID: ${CLOUDFLARE_ACCOUNT_ID:0:10}..."
echo ""

# Build frontend
echo -e "${BLUE}📦 Building frontend...${NC}"
npm run build

if [ ! -d "dist" ]; then
    echo -e "${RED}❌ Build failed - dist directory not found${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Build complete${NC}"
echo ""

# Deploy using wrangler with API token
echo -e "${BLUE}🚀 Deploying to Cloudflare Pages...${NC}"
echo ""

# Export tokens for wrangler
export CLOUDFLARE_API_TOKEN
export CLOUDFLARE_ACCOUNT_ID

# Deploy with wrangler using environment variables
wrangler pages deploy dist \
    --project-name=ai-code-reviewer-frontend \
    --branch=main \
    --commit-dirty=true \
    --commit-message="Deploy from CLI with API token"

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}🎉 Deployment Successful!${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "Your frontend is live at:"
    echo -e "${BLUE}https://ai-code-reviewer-frontend.pages.dev${NC}"
    echo ""
    echo "Backend Worker: https://ai-code-reviewer.mohammedfirdousaraoye.workers.dev"
    echo ""
else
    echo ""
    echo -e "${RED}❌ Deployment failed${NC}"
    echo ""
    echo -e "${YELLOW}Alternative: Manual Upload${NC}"
    echo "1. Go to https://dash.cloudflare.com"
    echo "2. Navigate to Workers & Pages → Create application → Pages"
    echo "3. Click 'Upload assets'"
    echo "4. Upload the 'dist' folder"
    echo "5. Project name: ai-code-reviewer-frontend"
    exit 1
fi