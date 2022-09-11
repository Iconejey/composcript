#!/usr/bin/env node
const fs = require('fs');
const rl = require('readline').createInterface({
	input: process.stdin,
	output: process.stdout
});

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

// If package.json is not found, exit
if (!fs.existsSync('package.json')) {
	console.log(`${colors.red}package.json not found${colors.reset}`);
	process.exit(1);
}

// Get package.json
const package = JSON.parse(fs.readFileSync('package.json'));

// Get the arguments
const arg = process.argv[2];

// If user wants to init CompoScript config
if (arg === 'init') {
	console.log(`${colors.green}Initializing CompoScript config${colors.reset}`);

	const config = {};

	// Components directory
	rl.question(`${colors.yellow}Components directory${colors.reset} (default: ./components): `, dir => {
		config.components = dir || './components';

		// Styles type
		rl.question(`${colors.yellow}Styles type${colors.reset} (default: scss): `, type => {
			// Styles directory
			rl.question(`${colors.yellow}Styles directory${colors.reset} (default: ./styles): `, dir => {
				config[type || 'scss'] = dir || './styles';

				// Log config
				console.log('Adding config to package.json:');
				console.log(config);

				// Save config
				package.composcript = config;
				fs.writeFileSync('package.json', JSON.stringify(package, '\n', 4));

				// Exit
				rl.close();
			});
		});
	});
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
