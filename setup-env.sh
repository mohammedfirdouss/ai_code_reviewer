#!/bin/bash

# Environment setup script for AI Code Reviewer
echo "🔧 AI Code Reviewer - Environment Setup"
echo "======================================"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Check if .env already exists
if [ -f ".env" ]; then
    echo -e "${YELLOW}⚠️  .env file already exists${NC}"
    echo -n "Do you want to overwrite it? (y/N): "
    read -r response
    if [[ ! "$response" =~ ^[Yy]$ ]]; then
        echo "Setup cancelled."
        exit 0
    fi
fi

# Copy .env.example to .env
echo -n "Creating .env file... "
if cp .env.example .env; then
    echo -e "${GREEN}✅ Done${NC}"
else
    echo -e "${RED}❌ Failed to create .env file${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}📝 Please update the .env file with your Cloudflare credentials:${NC}"
echo ""
echo "1. CLOUDFLARE_ACCOUNT_ID - Get from Cloudflare dashboard (right sidebar)"
echo "2. CLOUDFLARE_API_TOKEN - Create at My Profile → API Tokens"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Edit .env file with your credentials"
echo "2. Run: wrangler login"
echo "3. Run: npm run check (to validate setup)"
echo "4. Run: npm run deploy (to deploy)"
echo ""
echo -e "${GREEN}Setup complete! Edit .env file and you're ready to deploy.${NC}"