# Security Policy

## Supported Versions

| Version | Supported | Support Level |
|---------|-----------|---------------|
| 5.x     | ✅ Yes    | Full support (bug fixes, security patches, new features) |
| 4.x     | ⚠️ Limited | Security fixes only |
| < 4.0   | ❌ No     | End of life — upgrade recommended |

We strongly recommend using the latest stable version. See [CHANGELOG.md](./CHANGELOG.md) for upgrade notes and [SUPPORTED_VERSIONS.md](./SUPPORTED_VERSIONS.md) for details.

---

## Reporting a Vulnerability

### Private Disclosure (Preferred)

Please **do not** open a public GitHub issue for security vulnerabilities.

Instead, use one of these private channels:

1. **GitHub Private Vulnerability Reporting** — Navigate to the repository's "Security" tab and use the "Report a vulnerability" button (recommended)
2. **GitHub Security Advisory** — If this repository has advisories enabled
3. **Direct message** the maintainer through GitHub at [@itsPremkumar](https://github.com/itsPremkumar)

### What to Include

To help us respond quickly, please provide:

- A clear description of the vulnerability
- Steps to reproduce (if safe to share privately)
- Affected files, endpoints, or components
- Potential impact and attack vector
- Any suggested remediation (optional but appreciated)
- Your contact information for follow-up

### Response Timeline

| Phase | Expected Time |
|-------|---------------|
| Initial acknowledgment | Within 48 hours |
| Triage and assessment | Within 5 business days |
| Fix development | Depends on severity and complexity |
| Public disclosure | After fix is released and deployed |

---

## Security Best Practices for Users

### API Keys and Credentials

- **Never commit `.env` to version control** — it is already in `.gitignore`
- Use `.env.example` as a template; keep real credentials out of the repository
- Review code and logs before sharing to ensure no secrets are exposed
- Rotate API keys periodically

### Self-Hosted Deployments

- Run behind a reverse proxy (nginx, Caddy) for production use
- Enable HTTPS in production
- Set `PUBLIC_BASE_URL` correctly in `.env` for public deployments
- Review rate limits and firewall rules for public-facing instances
- Keep the deployment up to date with the latest release

### Desktop Application

- Download the Windows installer only from [official GitHub releases](https://github.com/itsPremkumar/Automated-Video-Generator/releases)
- Verify bundle integrity: `npm run electron:verify-bundle`
- The desktop app runs locally and does not phone home

---

## Dependencies

We use [Dependabot](https://docs.github.com/en/code-security/dependabot) to monitor dependencies:

- **npm packages** — Checked weekly for security updates
- **GitHub Actions** — Checked weekly for updates
- **Critical updates** — Applied promptly with patch releases

For major dependency changes, refer to [CHANGELOG.md](./CHANGELOG.md).

---

## Security-Related Labels

When filing security-related issues (via private reporting, not public issues):

- Label: `security` (for our internal tracking)
- Priority: Assessed on a case-by-case basis
- Disclosure: Coordinated with reporter before public release

---

## Acknowledgments

We appreciate the security research community and thank anyone who reports vulnerabilities responsibly. Contributors who report valid security issues will be acknowledged in release notes (unless they prefer to remain anonymous).

---

*Last updated: July 2026*
