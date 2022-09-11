#!/usr/bin/env node

const colors = {
	red: '\x1b[31m',
	green: '\x1b[32m',
	yellow: '\x1b[33m',
	blue: '\x1b[34m',
	magenta: '\x1b[35m',
	cyan: '\x1b[36m',
	white: '\x1b[37m',
	reset: '\x1b[0m'
};

// Get the arguments
const arg = process.argv[2];

// If user wants to init CompoScript config
if (arg === 'init') {
	console.log(`${colors.green}Initializing CompoScript config${colors.reset}`);
}

// If user wants to create a new component
else if (arg === 'create') {
	console.log(`${colors.green}Creating new component${colors.reset}`);
}

// If user wants to watch for changes
else if (arg === 'watch') {
	console.log(`${colors.green}Watching for changes${colors.reset}`);
}

// Wrong argument
else {
	console.log(`Usage: ${colors.yellow}composcript [init|create|watch]${colors.reset}`);
}
