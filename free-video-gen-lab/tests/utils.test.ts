import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ensureDir, writeTextFile, formatDuration, generateTempFilePath, isCommandAvailable } from '../src/utils.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('utils', () => {
  describe('ensureDir', () => {
    it('should create directory if not exists', () => {
      const testDir = path.join(os.tmpdir(), 'test-ensure-dir-' + Date.now());
      assert.equal(fs.existsSync(testDir), false);
      ensureDir(testDir);
      assert.equal(fs.existsSync(testDir), true);
      fs.rmdirSync(testDir);
    });

    it('should not throw if directory exists', () => {
      ensureDir(os.tmpdir());
    });
  });

  describe('writeTextFile', () => {
    it('should write content to file', () => {
      const testFile = path.join(os.tmpdir(), 'test-write-' + Date.now() + '.txt');
      writeTextFile(testFile, 'hello world');
      assert.equal(fs.readFileSync(testFile, 'utf-8'), 'hello world');
      fs.unlinkSync(testFile);
    });
  });

  describe('formatDuration', () => {
    it('should format seconds correctly', () => {
      assert.equal(formatDuration(0), '0:00');
      assert.equal(formatDuration(5), '0:05');
      assert.equal(formatDuration(60), '1:00');
      assert.equal(formatDuration(90), '1:30');
      assert.equal(formatDuration(3661), '61:01');
    });
  });

  describe('generateTempFilePath', () => {
    it('should generate a path with correct extension', () => {
      const path1 = generateTempFilePath('mp4');
      assert.ok(path1.endsWith('.mp4'));
      assert.ok(path1.includes('gen_'));

      const path2 = generateTempFilePath('wav', 'music');
      assert.ok(path2.endsWith('.wav'));
      assert.ok(path2.includes('music_'));
    });
  });

  describe('isCommandAvailable', () => {
    it('should return true for existing commands', () => {
      // node should always be available
      const result = isCommandAvailable('node');
      assert.equal(result, true);
    });

    it('should return false for non-existing commands', () => {
      const result = isCommandAvailable('this-command-does-not-exist-xyz');
      assert.equal(result, false);
    });
  });
});
