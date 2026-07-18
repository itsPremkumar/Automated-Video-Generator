/**
 * archive.test.ts — verify STAGE 18 consolidation + manifest integrity.
 * Pure fs ops, offline, no ffmpeg. Builds a fake workspace, archives, asserts.
 */

import * as fs from 'fs';
import * as path from 'path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { archiveJob, verifyArchive, ArchiveManifest } from './archive.js';
import { AgenticWorkspace } from './workspace.js';

function fakeWorkspace(root: string): AgenticWorkspace {
    fs.mkdirSync(path.join(root, 'render'), { recursive: true });
    fs.mkdirSync(path.join(root, 'audio'), { recursive: true });
    fs.mkdirSync(path.join(root, 'assets', 'images', 'scene_01'), { recursive: true });
    const ws: AgenticWorkspace = {
        jobId: 'job_test',
        root,
        assetsDir: path.join(root, 'assets'),
        imagesDir: path.join(root, 'assets', 'images'),
        videosDir: path.join(root, 'assets', 'videos'),
        musicDir: path.join(root, 'assets', 'music'),
        verificationDir: path.join(root, 'verification'),
    };
    return ws;
}

test('archiveJob copies final video, subtitles, and source assets into archive/', () => {
    const root = fs.mkdtempSync(path.join(require('os').tmpdir(), 'arch-'));
    try {
        const ws = fakeWorkspace(root);
        const mp4 = path.join(root, 'render', 'job_test.mp4');
        fs.writeFileSync(mp4, 'FAKE_MP4');
        fs.writeFileSync(path.join(root, 'render', 'job_test_9x16.mp4'), 'FAKE_9x16');
        fs.writeFileSync(path.join(root, 'render', 'job_test_thumbnail.jpg'), 'IMG');
        fs.writeFileSync(path.join(root, 'render', 'job_test_metadata.txt'), 'META');
        fs.writeFileSync(path.join(root, 'render', 'job_test_subtitles.srt'), 'SRT');
        fs.writeFileSync(path.join(root, 'audio', 'subtitles.vtt'), 'VTT');
        fs.writeFileSync(path.join(root, 'assets', 'images', 'scene_01', 'img1.jpg'), 'PIX');
        fs.writeFileSync(path.join(root, 'contact-sheet.png'), 'SHEET');

        const m = archiveJob(ws, mp4);
        assert.ok(m, 'manifest returned');
        assert.equal(m!.jobId, 'job_test');
        assert.ok(fs.existsSync(path.join(root, 'archive', 'archive-manifest.json')), 'manifest file written');

        const roles = new Set(m!.files.map((f) => f.role));
        assert.ok(roles.has('final_video'), 'has final_video');
        assert.ok(roles.has('multi_aspect'), 'has multi_aspect');
        assert.ok(roles.has('subtitles'), 'has subtitles');
        assert.ok(roles.has('source_asset'), 'has source_asset');
        assert.ok(roles.has('contact_sheet'), 'has contact_sheet');
        // originals untouched (consolidate = copy, not move)
        assert.ok(fs.existsSync(mp4), 'original mp4 still present');
        assert.ok(m!.totalBytes > 0, 'total bytes counted');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('verifyArchive confirms integrity and flags tampering', () => {
    const root = fs.mkdtempSync(path.join(require('os').tmpdir(), 'arch2-'));
    try {
        const ws = fakeWorkspace(root);
        const mp4 = path.join(root, 'render', 'job_test.mp4');
        fs.writeFileSync(mp4, 'FAKE_MP4');
        const m = archiveJob(ws, mp4)!;
        const check = verifyArchive(path.join(root, 'archive', 'archive-manifest.json'));
        assert.equal(check.ok, true, 'intact archive passes');
        assert.equal(check.missing.length, 0);

        // tamper with a copied file
        const vid = m.files.find((f) => f.role === 'final_video')!;
        fs.appendFileSync(vid.dest, 'TAMPER');
        const after = verifyArchive(path.join(root, 'archive', 'archive-manifest.json'));
        assert.equal(after.ok, false, 'tampered archive fails');
        assert.ok(after.corrupted.length > 0, 'corruption detected');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('archiveJob returns null when archive dir cannot be created', () => {
    // Make `root` a real FILE so mkdir(root/archive) provably fails.
    const fileRoot = fs.mkdtempSync(path.join(require('os').tmpdir(), 'arch-bad-'));
    const badFile = path.join(fileRoot, 'isa_file_not_dir');
    fs.writeFileSync(badFile, 'x');
    const bad: AgenticWorkspace = {
        jobId: 'x',
        root: badFile,
        assetsDir: badFile,
        imagesDir: badFile,
        videosDir: badFile,
        musicDir: badFile,
        verificationDir: badFile,
    };
    let threw = false;
    let m = null as ArchiveManifest | null;
    try {
        m = archiveJob(bad, badFile);
    } catch {
        threw = true;
    }
    assert.equal(threw, false, 'does not throw');
    assert.equal(m, null, 'returns null on failure (safe)');
    fs.rmSync(fileRoot, { recursive: true, force: true });
});
