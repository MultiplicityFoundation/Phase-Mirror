# Phase Mirror Development Environment

**Date Configured:** {CONFIGURE_DATE}
**Configured By:** {CONFIGURE_USER}

## System Information

- **OS:** {OS_INFO}
- **Node.js:** {NODE_VERSION}
- **pnpm:** {PNPM_VERSION}
- **AWS CLI:** {AWS_VERSION}
- **Terraform:** {TERRAFORM_VERSION}

## AWS Configuration

- **Profile:** {AWS_PROFILE}
- **Region:** {AWS_REGION}
- **Account ID:** {AWS_ACCOUNT_ID}

## Repository Status

- **Branch:** {GIT_BRANCH}
- **Commit:** {GIT_COMMIT}
- **Last Modified:** {GIT_LAST_MODIFIED}

## Build Status

- **Last Build:** {BUILD_DATE}
- **Tests Passing:** {TESTS_PASSING}
- **Coverage:** Run `pnpm test:coverage` to generate

## Next Steps

- [ ] Day -1: AWS Infrastructure Bootstrap
- [ ] Day 0: Baseline Documentation
- [ ] Week 1: Core Implementation Validation

## Troubleshooting

If environment validation fails, review:
1. `./scripts/validate-environment.sh` output
2. `pnpm install` logs
3. AWS credential configuration: `aws sts get-caller-identity`

---

## Environment Setup Instructions

### Prerequisites Installation

#### macOS
```bash
# Install Homebrew
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Node.js and pnpm
brew install node
npm install -g pnpm

# Install AWS CLI
brew install awscli

# Install Terraform
brew tap hashicorp/tap
brew install hashicorp/tap/terraform
```

#### Linux (Ubuntu/Debian)
```bash
# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install pnpm
npm install -g pnpm

# Install AWS CLI
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Install Terraform
wget -O- https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list
sudo apt update && sudo apt install terraform
```

### Repository Setup

```bash
# Clone repository
git clone https://github.com/PhaseMirror/Phase-Mirror.git
cd Phase-Mirror

# Install dependencies
pnpm install

# Build packages
pnpm build

# Run tests
pnpm test

# Validate environment
./scripts/validate-environment.sh
```

### AWS Configuration

```bash
# Configure AWS credentials
aws configure

# Verify access
aws sts get-caller-identity

# Set environment variables (optional)
export AWS_PROFILE=your-profile
export AWS_REGION=us-east-1
```

## Validation Checklist

Run through these checks to ensure your environment is properly configured:

- [ ] Node.js v18+ installed and accessible
- [ ] pnpm v8+ installed and accessible
- [ ] Git installed and configured
- [ ] AWS CLI v2+ installed
- [ ] Terraform v1.5+ installed
- [ ] AWS credentials configured
- [ ] Repository cloned
- [ ] Dependencies installed (`pnpm install`)
- [ ] Packages built successfully (`pnpm build`)
- [ ] Tests passing (`pnpm test`)
- [ ] Validation script runs without errors (`./scripts/validate-environment.sh`)

## Common Issues

### Issue: AWS credentials not configured
**Solution:**
```bash
aws configure
# Enter your AWS Access Key ID, Secret Access Key, and default region
```

### Issue: pnpm not found
**Solution:**
```bash
npm install -g pnpm
```

### Issue: Build fails with TypeScript errors
**Solution:**
```bash
# Clean and rebuild
pnpm clean
pnpm install
pnpm build
```

### Issue: Tests fail
**Solution:**
```bash
# Check for uncommitted changes
git status

# Ensure dependencies are up to date
pnpm install

# Run tests with verbose output
pnpm test -- --verbose
```
