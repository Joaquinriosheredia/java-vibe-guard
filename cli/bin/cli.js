#!/usr/bin/env node
import { program } from 'commander';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runGuard } from '../src/scanner.js';
import { runVerify } from '../src/verify.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'));

program
  .name('java-vibe-guard')
  .description('Static analyzer that detects vibe coding patterns in Java/Spring Boot projects')
  .version(pkg.version)
  .argument('[path]', 'Path to Java/Spring Boot project to analyze')
  .option('--verify <rule>', 'Verify a VIBE rule is reproducible in your environment (e.g. VIBE-001)')
  .option('--json', 'Output results as JSON')
  .option('--rule <name>', 'Run only one rule: blocking | layers | kafka | transactions | observability')
  .option('--ignore <dirs>', 'Comma-separated directories to exclude (e.g. labs,demos,test)')
  .option('--verbose', 'List suppressed findings with their rule, location, suppressedBy, and justification')
  .option('--no-color', 'Disable colored output')
  .parse();

const opts = program.opts();
const projectPath = program.args[0];

if (opts.verify) {
  process.exitCode = await runVerify(opts.verify);
} else if (!projectPath) {
  console.error('Error: path argument is required (or use --verify <rule>)');
  process.exit(1);
} else {
  process.exitCode = await runGuard(projectPath, opts);
}
