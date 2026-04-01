# 🦀 ClawHub Skill Publishing Guide

This guide explains how to publish and maintain your video generator's skills on the **ClawHub** registry (part of the OpenClaw ecosystem).

## 🛠️ 1. Initial CLI Setup

Before you can publish, ensure you have the required CLI installed and authenticated:

```bash
# 1. Install the CLI globally
npm i -g clawhub

# 2. Login (Opens a browser window for GitHub OAuth)
# You must have a GitHub account at least 1 week old.
clawhub login

# 3. Verify identity
clawhub whoami
```

---

## 📝 2. SKILL.md Formatting Requirements

ClawHub strictly uses the `SKILL.md` file inside every skill directory for metadata parsing. Ensure your frontmatter follows the official structure.

### Standard Frontmatter:
```yaml
---
name: my-skill-name
description: A short summary of what the skill does.
version: 1.0.0
metadata:
  requires:
    env:
      - API_KEY_NAME        # Required environment variables
    bins:
      - node                # Required global binaries
      - ffmpeg
---
```

### Tips for AI Optimization:
*   **Code Blocks**: Ensure your `SKILL.md` contains runnable CLI examples in code blocks.
*   **YAML Metadata**: The `requires` block is crucial as it tells the AI agent which tools it must have installed before attempting to use the skill.

---

### 1. Publish Individual Skills
To publish your individual skills (CLI and Script Generator), run the `publish` command pointing to the specific subdirectories:

```bash
# Publish CLI Operations Skill
clawhub publish .agent/skills/cli-operations --slug video-gen-cli --version 1.1.3 --name "Video Generator CLI"

# Publish Script Generation Skill
clawhub publish .agent/skills/generate-script --slug video-gen-script --version 1.1.3 --name "Video Script Generator"
```

### 2. Publish Project as a Plugin
To publish the entire project as a native **Code Plugin** (including the MCP server support), run the `package publish` command from the root directory:

```bash
# Replace (git rev-parse HEAD) with the actual commit SHA if (git rev-parse HEAD) fails on your shell.
clawhub package publish "$PWD" --family code-plugin --name automated-video-generator --display-name "Automated Video Generator" --version 1.1.0 --source-repo itsPremkumar/Automated-Video-Generator --source-commit (git rev-parse HEAD)
```

---

## 🐞 4. Troubleshooting & Best Practices

### ⏳ GitHub API Rate Limits
During authentication or publishing, you might see an error like `GitHub API rate limit exceeded`.
*   **Cause**: This happens if too many login/validation attempts happen in a short window.
*   **Fix**: Wait **60 seconds** and try the command again.

### 📁 Directory Structure
Always ensure you are publishing the **folder** that contains the `SKILL.md`, not the root directory of the entire project.

```text
📁 .agent/skills/cli-operations/
   ┗ 📄 SKILL.md (Required)
   ┗ 📄 other_scripts.js (Optional)
```

### 🌍 Registry Visibility
Once published, your skill will be visible on [clawhub.ai](https://clawhub.ai) under your profile (e.g. `@itsPremkumar`).
