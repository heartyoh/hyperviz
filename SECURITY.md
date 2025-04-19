# Security Policy

## SLSA Implementation

This project implements SLSA Level 1 for supply chain security. All builds are performed through GitHub Actions with SLSA provenance generation.

### Verification

To verify the SLSA provenance of any artifact:

```bash
# Install SLSA verifier
npm install -g @slsa/verify

# Verify an artifact
slsa verify <artifact-path>
```

## Reporting a Vulnerability

Please report any security vulnerabilities to security@hyperviz.dev 