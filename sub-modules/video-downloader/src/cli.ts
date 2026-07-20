#!/usr/bin/env node
import { Command } from 'commander';
import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import { buildConfig, AppConfig } from './config';
import { buildProviders, searchVideos, downloadVideos, SourceSelection } from './index';
import { SearchFilters, VideoResult } from './models/video';
import { logger } from './utils/logger';
import { formatBytes, formatDuration } from './utils/file';
import { exportMetadataToCsv, readHistory } from './download/metadata';

interface CliOptions {
  keyword?: string;
  count?: string;
  source?: string;
  output?: string;
  license?: string;
  minDuration?: string;
  maxDuration?: string;
  minResolution?: string;
  maxSize?: string;
  hdOnly?: boolean;
  sort?: string;
  page?: string;
  history?: boolean;
  exportCsv?: boolean;
  yes?: boolean;
}

const program = new Command();

program
  .name('free-video-downloader')
  .description(
    'Search and download copyright-friendly videos from Wikimedia Commons and the Internet Archive. No API keys required.',
  )
  .version('1.0.0')
  .option('-k, --keyword <keyword>', 'search keyword')
  .option('-c, --count <number>', 'number of videos to download')
  .option('-s, --source <source>', 'source: wikimedia, archive, or all', 'all')
  .option('-o, --output <path>', 'download output folder')
  .option('--license <license>', 'filter by license (substring match, e.g. "CC BY")')
  .option('--min-duration <seconds>', 'minimum video duration in seconds')
  .option('--max-duration <seconds>', 'maximum video duration in seconds')
  .option('--min-resolution <height>', 'minimum vertical resolution in pixels (e.g. 720)')
  .option('--max-size <bytes>', 'maximum file size in bytes')
  .option('--hd-only', 'only include videos of 720p or higher')
  .option('--sort <mode>', 'sort by: relevance, newest, or resolution', 'relevance')
  .option('--page <number>', 'search result page number', '1')
  .option('--history', 'show download history and exit')
  .option('--export-csv', 'export existing metadata.json to CSV and exit')
  .option('-y, --yes', 'skip confirmation prompts and download all results')
  .parse(process.argv);

const options = program.opts<CliOptions>();

async function main(): Promise<void> {
  printBanner();

  const config = buildConfig({
    downloadDir: options.output ? path.resolve(process.cwd(), options.output) : undefined,
  } as Partial<AppConfig>);

  if (options.history) {
    await showHistory(config);
    return;
  }

  if (options.exportCsv) {
    await handleExportCsv(config);
    return;
  }

  const filters = await resolveSearchFilters();
  const sourceSelection = await resolveSourceSelection();

  const providers = buildProviders(config, sourceSelection);

  const spinner = ora({ text: `Searching for "${filters.keyword}"...`, color: 'cyan' }).start();
  let results: VideoResult[];
  try {
    results = await searchVideos(config, providers, filters);
    spinner.succeed(`Found ${results.length} video${results.length === 1 ? '' : 's'}.`);
  } catch (err) {
    spinner.fail('Search failed.');
    logger.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
    return;
  }

  if (results.length === 0) {
    logger.warn('No videos matched your search and filters. Try a different keyword or loosen your filters.');
    return;
  }

  displayResults(results);

  const selected = options.yes ? results : await promptSelection(results);
  if (selected.length === 0) {
    logger.info('No videos selected. Exiting.');
    return;
  }

  logger.heading(`Downloading ${selected.length} video${selected.length === 1 ? '' : 's'} to ${config.downloadDir}`);
  const downloadResults = await downloadVideos(config, selected);

  const successCount = downloadResults.filter((r) => r.success).length;
  const failCount = downloadResults.length - successCount;

  logger.heading('Download Summary');
  if (successCount > 0) {
    logger.success(`${successCount} video${successCount === 1 ? '' : 's'} downloaded successfully.`);
  }
  if (failCount > 0) {
    logger.error(`${failCount} video${failCount === 1 ? '' : 's'} failed to download.`);
    downloadResults
      .filter((r) => !r.success)
      .forEach((r) => logger.warn(`  - ${r.video.title} (${r.video.provider}): ${r.error}`));
  }

  logger.info(`Metadata written to ${path.join(config.downloadDir, 'metadata.json')}`);
  logger.info(`Attribution info written to ${path.join(config.downloadDir, 'ATTRIBUTION.txt')}`);
}

function printBanner(): void {
  console.log(chalk.bold.cyan('\n📹 Free Copyright-Friendly Video Downloader'));
  console.log(chalk.gray('   Wikimedia Commons + Internet Archive · No API keys required\n'));
}

/** Resolves search filters from CLI flags, falling back to interactive prompts for missing required fields. */
async function resolveSearchFilters(): Promise<SearchFilters> {
  let keyword = options.keyword;
  let count = options.count ? parseInt(options.count, 10) : undefined;

  if (!keyword || !count) {
    const answers = await inquirer.prompt<{ keyword: string; count: number }>([
      {
        type: 'input',
        name: 'keyword',
        message: 'Search keyword:',
        when: !keyword,
        validate: (input: string) => (input.trim().length > 0 ? true : 'Please enter a keyword.'),
      },
      {
        type: 'number',
        name: 'count',
        message: 'How many videos?',
        default: 10,
        when: !count,
        validate: (input: number | undefined) =>
          input && input > 0 ? true : 'Please enter a number greater than 0.',
      },
    ]);
    keyword = keyword ?? answers.keyword;
    count = count ?? answers.count;
  }

  const sortBy = (options.sort as SearchFilters['sortBy']) ?? 'relevance';

  return {
    keyword: keyword!,
    count: count!,
    license: options.license,
    minDurationSeconds: options.minDuration ? parseInt(options.minDuration, 10) : undefined,
    maxDurationSeconds: options.maxDuration ? parseInt(options.maxDuration, 10) : undefined,
    minResolutionHeight: options.minResolution ? parseInt(options.minResolution, 10) : undefined,
    maxFileSizeBytes: options.maxSize ? parseInt(options.maxSize, 10) : undefined,
    hdOnly: Boolean(options.hdOnly),
    sortBy: ['relevance', 'newest', 'resolution'].includes(sortBy) ? sortBy : 'relevance',
    page: options.page ? parseInt(options.page, 10) : 1,
  };
}

/** Resolves which source(s) to search, from CLI flag or interactive prompt. */
async function resolveSourceSelection(): Promise<SourceSelection> {
  const raw = options.source?.toLowerCase();
  if (raw === 'wikimedia' || raw === 'archive' || raw === 'all') {
    return raw;
  }

  if (options.keyword) {
    // A keyword was passed via flags but source wasn't valid/specified;
    // default to "all" rather than prompting, to keep non-interactive use smooth.
    return 'all';
  }

  const { source } = await inquirer.prompt<{ source: SourceSelection }>([
    {
      type: 'list',
      name: 'source',
      message: 'Choose source:',
      choices: [
        { name: '1. Wikimedia Commons', value: 'wikimedia' },
        { name: '2. Internet Archive', value: 'archive' },
        { name: '3. All Sources', value: 'all' },
      ],
    },
  ]);
  return source;
}

/** Renders the search results table to the console. */
function displayResults(results: VideoResult[]): void {
  logger.heading(`Search Results (${results.length})`);
  results.forEach((video, idx) => {
    console.log(chalk.bold(`\n${idx + 1}. ${video.title}`));
    console.log(`   ${chalk.gray('Creator:')} ${video.creator}`);
    console.log(`   ${chalk.gray('License:')} ${video.license}`);
    console.log(`   ${chalk.gray('Duration:')} ${formatDuration(video.durationSeconds)}`);
    console.log(`   ${chalk.gray('Resolution:')} ${video.resolution ?? 'Unknown'}`);
    console.log(`   ${chalk.gray('Provider:')} ${video.provider}`);
    console.log(`   ${chalk.gray('File Size:')} ${video.fileSizeBytes ? formatBytes(video.fileSizeBytes) : 'Unknown'}`);
    console.log(`   ${chalk.gray('Download URL:')} ${video.downloadUrl}`);
    console.log(`   ${chalk.gray('Thumbnail:')} ${video.thumbnailUrl ?? 'N/A'}`);
  });
  console.log('');
}

/** Prompts the user to choose which of the search results to actually download. */
async function promptSelection(results: VideoResult[]): Promise<VideoResult[]> {
  const { confirmAll } = await inquirer.prompt<{ confirmAll: boolean }>([
    {
      type: 'confirm',
      name: 'confirmAll',
      message: `Download all ${results.length} videos?`,
      default: true,
    },
  ]);

  if (confirmAll) return results;

  const { chosenIndexes } = await inquirer.prompt<{ chosenIndexes: number[] }>([
    {
      type: 'checkbox',
      name: 'chosenIndexes',
      message: 'Select videos to download:',
      choices: results.map((v, idx) => ({
        name: `${v.title} (${v.provider}, ${v.resolution ?? 'unknown res'})`,
        value: idx,
      })),
    },
  ]);

  return chosenIndexes.map((idx) => results[idx]);
}

async function showHistory(config: AppConfig): Promise<void> {
  const history = await readHistory(config);
  if (history.length === 0) {
    logger.info('No download history found yet.');
    return;
  }

  logger.heading(`Download History (${history.length} entries)`);
  history.forEach((entry) => {
    const status = entry.success ? chalk.green('✔') : chalk.red('✘');
    console.log(`${status} ${entry.timestamp} — ${entry.title} [${entry.provider}] → ${entry.localPath}`);
  });
}

async function handleExportCsv(config: AppConfig): Promise<void> {
  await fs.ensureDir(config.downloadDir);
  const csvPath = await exportMetadataToCsv(config);
  if (!csvPath) {
    logger.warn('No metadata.json found to export. Download some videos first.');
    return;
  }
  logger.success(`Exported metadata to ${csvPath}`);
}

main().catch((err) => {
  logger.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});