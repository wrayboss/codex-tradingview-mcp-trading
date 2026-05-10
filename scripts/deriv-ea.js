#!/usr/bin/env node
import { parseDerivEaCliArgs, runDerivEaBridgeCommand } from "../src/derivEaBridge.js";

const { command, args } = parseDerivEaCliArgs(process.argv.slice(2));
const result = runDerivEaBridgeCommand({ command, args });

console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
