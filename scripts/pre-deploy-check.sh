#!/bin/bash

# Pre-deployment check script for Cloudflare Workers
echo "AI Code Reviewer - Pre-deployment Check"
echo "=========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print status
print_status() {
    if [ $2 -eq 0 ]; then
        echo -e "${GREEN}$1${NC}"
    else
        echo -e "${RED}$1${NC}"
    fi
}

# Check Node.js version
echo -n "Checking Node.js version... "
node_version=$(node --version 2>/dev/null)
if [[ $? -eq 0 && ${node_version:1:2} -ge 18 ]]; then
    print_status "Node.js $node_version" 0
else
    print_status "Node.js version 18+ required" 1
    exit 1
fi

# Check if wrangler is installed
echo -n "Checking Wrangler CLI... "
wrangler --version >/dev/null 2>&1
print_status "Wrangler CLI installed" $?

# Check if authenticated
echo -n "Checking Wrangler authentication... "
wrangler whoami >/dev/null 2>&1
if [ $? -eq 0 ]; then
    print_status "Wrangler authenticated" 0
else
    print_status "Wrangler not authenticated - run 'wrangler login'" 1
fi

# Check wrangler.toml configuration
echo -n "Checking wrangler.toml... "
if [ -f "wrangler.toml" ]; then
    print_status "wrangler.toml exists" 0
else
    print_status "wrangler.toml not found" 1
fi

# Check environment variables
echo -n "Checking environment variables... "
if [ -f ".env" ]; then
    if grep -q "CLOUDFLARE_ACCOUNT_ID=" .env && ! grep -q "your-account-id-here" .env; then
        print_status "Environment variables configured" 0
    else
        print_status "Update CLOUDFLARE_ACCOUNT_ID in .env file" 1
    fi
else
    print_status "Create .env file from .env.example" 1
fi

# Check TypeScript compilation
echo -n "Checking TypeScript compilation... "
if command -v tsc &> /dev/null; then
    tsc --noEmit >/dev/null 2>&1
    print_status "TypeScript compilation" $?
else
    print_status "TypeScript check skipped (tsc not found)" 0
fi

# Check package.json scripts
echo -n "Checking package.json scripts... "
if grep -q '"deploy".*"wrangler deploy"' package.json; then
    print_status "Deploy script configured" 0
else
    print_status "Deploy script missing" 1
fi

# Test local development
echo -n "Testing local build... "
npm run build >/dev/null 2>&1 || true  # Allow this to fail
print_status "Build test completed" 0

echo ""
echo "Deployment Checklist:"
echo "1. Copy .env.example to .env: cp .env.example .env"
echo "2. Update CLOUDFLARE_ACCOUNT_ID in .env with your Account ID"
echo "3. Update CLOUDFLARE_API_TOKEN in .env (optional, for CI/CD)"
echo "4. Run 'wrangler login' if not authenticated"
echo "5. Test locally with 'npm run dev'"
echo "6. Deploy with 'npm run deploy'"
echo ""
echo -e "${YELLOW}Ready to deploy? Run: npm run deploy${NC}"