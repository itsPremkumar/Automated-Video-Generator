import { runCli } from './adapters/cli/cli-runner';

runCli().catch(() => {
    process.exitCode = 1;
});
