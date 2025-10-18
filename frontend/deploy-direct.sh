#!/bin/bash

# Direct Cloudflare Pages deployment using Wrangler with API token (No OAuth!)
# This script bypasses OAuth by using CLOUDFLARE_API_TOKEN directly

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}🚀 Cloudflare Pages Deployment (No OAuth)${NC}"
echo "========================================"

# Load environment variables
if [ -f ../.env ]; then
    export $(cat ../.env | grep -v '^#' | xargs)
else
    echo -e "${RED}❌ .env file not found. Run 'npm run setup' first.${NC}"
    exit 1
fi

# Check for required variables
if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
    echo -e "${RED}❌ CLOUDFLARE_API_TOKEN not set in .env${NC}"
    exit 1
fi

if [ -z "$CLOUDFLARE_ACCOUNT_ID" ]; then
    echo -e "${RED}❌ CLOUDFLARE_ACCOUNT_ID not set in .env${NC}"
    exit 1
fi

PROJECT_NAME="ai-code-reviewer-frontend"

echo -e "${BLUE}📦 Building frontend...${NC}"
npm run build

if [ ! -d "dist" ]; then
    echo -e "${RED}❌ Build directory not found${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Build complete${NC}"

# Use wrangler with explicit token (no OAuth)
echo -e "${BLUE}📤 Deploying to Cloudflare Pages...${NC}"

# Set environment variables for wrangler to use
export CLOUDFLARE_API_TOKEN=$CLOUDFLARE_API_TOKEN
export CLOUDFLARE_ACCOUNT_ID=$CLOUDFLARE_ACCOUNT_ID

# Deploy using wrangler with environment variables (bypasses OAuth)
npx wrangler pages deploy dist \
  --project-name="${PROJECT_NAME}" \
  --branch=main \
  --commit-dirty=true \
  2>&1 | tee /tmp/deploy_output.log

# Check if deployment was successful
if grep -q "Deployment complete" /tmp/deploy_output.log || grep -q "Successfully created" /tmp/deploy_output.log; then
    echo ""
    echo -e "${GREEN}🎉 Frontend deployed successfully!${NC}"
    echo ""
    echo -e "Your frontend is available at:"
    echo -e "${GREEN}https://${PROJECT_NAME}.pages.dev${NC}"
    echo ""
else
    # Check for errors
    if grep -q "authorization" /tmp/deploy_output.log || grep -q "Timed out" /tmp/deploy_output.log; then
        echo ""
        echo -e "${YELLOW}⚠️  Wrangler OAuth issue detected${NC}"
        echo -e "${BLUE}Using alternative deployment method...${NC}"
        echo ""
        
        # Alternative: Use npx @cloudflare/pages-action
        echo -e "${BLUE}📤 Attempting direct upload...${NC}"
        
        # Create a simple deployment using curl with multipart form
        cd dist
        
        # Get list of files
        FILES=$(find . -type f)
        MANIFEST="{"
        for file in $FILES; do
            FILE_PATH=$(echo $file | sed 's/^\.\///')
            MANIFEST="${MANIFEST}\"${FILE_PATH}\":\"$(md5sum $file | cut -d' ' -f1)\","
        done
        MANIFEST="${MANIFEST%,}}"
        
        echo "$MANIFEST" > /tmp/manifest.json
        
        echo -e "${YELLOW}Note: Manual upload required via Cloudflare Dashboard${NC}"
        echo -e "1. Go to: https://dash.cloudflare.com"
        echo -e "2. Workers & Pages → Create → Upload assets"
        echo -e "3. Upload the 'dist' folder"
        echo -e "4. Project name: ${PROJECT_NAME}"
        
        cd ..
    else
        echo -e "${RED}❌ Deployment failed${NC}"
        cat /tmp/deploy_output.log
        exit 1
    fi
fi

# Cleanup
rm -f /tmp/deploy_output.logcurl https://ai-code-reviewer.mohammedfirdousaraoye.workers.dev/agent/reviews
