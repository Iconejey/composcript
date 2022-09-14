#!/usr/bin/env node
const fs = require('fs');
const child_process = require('child_process');
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
	console.log(`\n${colors.green}Initializing CompoScript config${colors.reset}\n`);

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
				console.log('\nAdding config to package.json:');
				console.log(config);

				// Save config
				package.composcript = config;
				fs.writeFileSync('package.json', JSON.stringify(package, '\n', 4));

				// If components directory does not exist, create it
				if (!fs.existsSync(config.components)) {
					console.log('\nCreating components directory\n');
					fs.mkdirSync(config.components);
				}

				// Create compiled.js file
				fs.writeFileSync(`${config.components}/compiled.js`, '');

				console.log(`You're all set! Just run ${colors.cyan}composcript watch${colors.reset} to run the compiler and add the following to your HTML file:`);
				console.log(
					`${colors.cyan}<${colors.red}script ${colors.magenta}src${colors.cyan}=${colors.green}"${config.components.replace('./public', '')}/compiled.js"${colors.cyan}></${colors.red}script${colors.cyan}>${colors.reset}`
				);

				// Exit
				rl.close();
			});
		});
	});
}

// If user wants to create a new component
else if (arg === 'create') {
	console.log(`${colors.green}Creating new component${colors.reset}`);

	const config = package.composcript;

	// Get component tag name
	rl.question(`${colors.yellow}Component tag name${colors.reset} (e.g. my-component): `, tag => {
		// If tag is not valid, exit
		if (!tag || !/^[a-z]+-(-?[a-z0-9]+)+$/.test(tag)) {
			console.error(`${colors.red}<${tag}></${tag}> : Invalid tag name, please use kebab-case (lowwercase letters and hyphens) and at least two words with no numbers in the first word${colors.reset}`);
			process.exit(1);
		}

		// Deduce component class name and file path
		const class_name = tag
			.split('-')
			.map(word => word[0].toUpperCase() + word.slice(1))
			.join('');
		const file_path = `${config.components}/${tag}.cmp`;

		// Create component file and open it
		console.log(`\nCreating ${colors.yellow}${class_name} ${colors.cyan}<${colors.red}${tag}${colors.cyan}></${colors.red}${tag}${colors.cyan}>${colors.reset} component in ${colors.green}${file_path}${colors.reset}`);

		const output = `
			class ${class_name} {
				// <${tag}></${tag}>
				
				created(content) {
					// ...
				}
			}
		`;

		fs.writeFileSync(file_path, output.replaceAll(/^\t\t\t/gm, ''));
		child_process.exec(`code ${file_path}`);

		// Exit
		rl.close();
	});
}

// If user wants to watch for changes
else if (arg === 'watch') {
	console.log(`${colors.green}Watching for changes${colors.reset}`);
}

// Wrong argument
else {
	console.log(`Usage: ${colors.cyan}composcript [init|create|watch]${colors.reset}`);
	process.exit(1);
}

// Exit
rl.close();
