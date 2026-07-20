import chalk from 'chalk';

function timestamp(): string {
    return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

export const logger = {
    heading(text: string): void {
        console.log(`\n${chalk.bold.cyan(text)}`);
        console.log(chalk.gray('─'.repeat(text.length)));
    },
    info(text: string): void {
        console.log(`${chalk.blue('ℹ')} ${text}`);
    },
    success(text: string): void {
        console.log(`${chalk.green('✔')} ${text}`);
    },
    warn(text: string): void {
        console.log(`${chalk.yellow('⚠')} ${text}`);
    },
    error(text: string): void {
        console.error(`${chalk.red('✘')} ${text}`);
    },
    debug(text: string): void {
        if (process.env.DEBUG) {
            console.log(`${chalk.gray(`[${timestamp()}]`)} ${text}`);
        }
    },
};
