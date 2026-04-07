/**
 * Electron Builder Configuration
 * Builds the Automated Video Generator as a Windows desktop app
 */
module.exports = {
    appId: 'com.premkumar.automated-video-generator',
    productName: 'Automated Video Generator',
    copyright: 'Copyright © 2026 Premkumar',

    // Directories
    directories: {
        buildResources: 'assets',
        output: 'release',
    },

    // Files to include in the app package
    files: [
        'package.json',
        'dist-electron/**/*',
        'electron/electron-setup.html',
        'src/**/*',
        'remotion/**/*',
        'input/**/*',
        'scripts/**/*',
        'skills/**/*',
        'docs/**/*',
        'public/**/*',
        'bin/**/*',
        '!input/input-assests/**/*',
        '!input/music/**/*',
        '!output/**/*',
        '!.env',
        '!.env.*',
        '!**/*.log',
        '!**/.DS_Store',
        '!**/*.tmp',
        '!**/*.bak',
        '!**/Thumbs.db',
        '!**/desktop.ini',
        '!tmp/**/*',
        '!temp/**/*',
        '!.cache/**/*',
        '!.vscode/**/*',
        '!.idea/**/*',
        '!.git/**/*',
        '!.video-cache.json',
        '!.mcp-jobs.json',
        '!npm-debug.log*',
        '!yarn-debug.log*',
        '!yarn-error.log*',
    ],

    // Extra resources bundled alongside the app (not inside asar)
    extraResources: [
        {
            from: '.',
            to: 'app-bundle',
            filter: [
                'package-lock.json',
                'tsconfig.json',
                '.env.example',
                'requirements.txt',
                'portable-python/**/*',
                '!node_modules/.cache/**',
                '!node_modules/electron/**',
                '!node_modules/electron-builder/**',
                '!tmp/**',
                '!temp/**',
                '!.cache/**',
                '!.video-cache.json',
                '!.mcp-jobs.json',
                '!*.log',
            ],
        },
        {
            from: 'assets/icon.ico',
            to: 'icon.ico',
        },
        {
            from: 'assets/logo-automation.png',
            to: 'logo-automation.png',
        },
    ],

    // Skip @electron/rebuild — this project has no native C++ addons
    npmRebuild: false,

    // Don't use asar for easier debugging and file access  
    asar: false,

    // Windows-specific configuration
    win: {
        target: [
            {
                target: 'nsis',
                arch: ['x64'],
            },
        ],
        icon: 'assets/icon.ico',
    },

    // NSIS installer configuration
    nsis: {
        oneClick: false,
        allowToChangeInstallationDirectory: true,
        createDesktopShortcut: true,
        createStartMenuShortcut: true,
        shortcutName: 'Automated Video Generator',
        installerIcon: 'assets/icon.ico',
        uninstallerIcon: 'assets/icon.ico',
        installerHeaderIcon: 'assets/icon.ico',
        deleteAppDataOnUninstall: false,
        perMachine: false,
        allowElevation: true,
        runAfterFinish: true,
        installerSidebar: null,
    },

    // GitHub publishing configuration
    publish: ['github'],
};
