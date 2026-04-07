/**
 * Sync Version Script
 * Automatically synchronizes the version from package.json to:
 * - openclaw.plugin.json
 * - skills/generate-script/SKILL.md (frontmatter)
 * - skills/cli-operations/SKILL.md (frontmatter)
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const pkgPath = path.join(rootDir, 'package.json');
const pluginPath = path.join(rootDir, 'openclaw.plugin.json');
const skillsDir = path.join(rootDir, 'skills');

if (!fs.existsSync(pkgPath)) {
    console.error('package.json not found');
    process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const version = pkg.version;

console.log(`Syncing version ${version} to all metadata files...`);

// 1. Sync to openclaw.plugin.json
if (fs.existsSync(pluginPath)) {
    const plugin = JSON.parse(fs.readFileSync(pluginPath, 'utf8'));
    plugin.version = version;
    fs.writeFileSync(pluginPath, JSON.stringify(plugin, null, 2) + '\n');
    console.log('✓ Updated openclaw.plugin.json');
}

// 2. Sync to SKILL.md files
function updateSkillVersion(skillName, baseDirName) {
    const skillPath = path.join(rootDir, baseDirName, skillName, 'SKILL.md');
    if (fs.existsSync(skillPath)) {
        let content = fs.readFileSync(skillPath, 'utf8');
        // Match version: x.x.x in YAML frontmatter
        const updatedContent = content.replace(/^version:.*$/m, `version: ${version}`);
        if (content !== updatedContent) {
            fs.writeFileSync(skillPath, updatedContent);
            console.log(`✓ Updated ${baseDirName}/${skillName}/SKILL.md`);
        } else {
            console.log(`- ${baseDirName}/${skillName}/SKILL.md is already up to date`);
        }
    } else {
        console.warn(`! Skill not found: ${skillPath}`);
    }
}

updateSkillVersion('generate-script', 'skills');
updateSkillVersion('cli-operations', 'skills');
updateSkillVersion('generate-script', '.agent/skills');
updateSkillVersion('cli-operations', '.agent/skills');

console.log('Sync complete!');
