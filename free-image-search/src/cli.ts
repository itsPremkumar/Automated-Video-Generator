export interface CLIOptions {
  keyword: string | null;
  count: number;
}

export function program(): CLIOptions {
  const args = process.argv.slice(2);
  const opts: CLIOptions = { keyword: null, count: 5 };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--keyword":
      case "-k":
        opts.keyword = args[++i] || null;
        break;
      case "--count":
      case "-n": {
        const val = parseInt(args[++i], 10);
        opts.count = val > 0 ? val : 5;
        break;
      }
      case "--help":
      case "-h":
        console.log(`
Usage:
  npx tsx src/index.ts [options]

Options:
  -k, --keyword <term>   Search keyword (omit for interactive mode)
  -n, --count <number>   Number of images to download (default: 5)
  -h, --help             Show this help
`);
        process.exit(0);
    }
  }

  return opts;
}
