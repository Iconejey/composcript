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

// Compile component function
function compileComponent(component_tag, code) {
	// Add HTMLElement extension if not present
	if (!code.includes('extends')) code = code.replace(/class \w+/, '$& extends ComposcriptComponent');

	// Get attribute map
	const attribute_map = code.match(new RegExp(`\/\/\\s*<${component_tag}.*?\/>`))?.[0];

	// If attribute map is not present, error
	if (!attribute_map) {
		console.log(`${colors.red}Attribute map not found, please add "// <${component_tag} />" to the top of the component${colors.reset}`);
		process.exit(1);
	}

	// Get attributes
	const attributes = attribute_map
		.replace(`// <${component_tag}`, '')
		.replace('/>', '')
		.trim()
		.split(' ')
		.filter(attr => attr);

	let bottom_code = '';

	// For each attribute
	for (const attribute of attributes) {
		// If attribute is a class
		if (attribute.includes('.')) {
			// Add getter and setter for the class
			bottom_code += `
				get ${attribute.slice(1)}() {
					return this.classList.contains('${attribute.slice(1)}');
				}

				set ${attribute.slice(1)}(val) {
					this.classList.toggle('${attribute.slice(1)}', val);
				}
			`;
		}

		// Else check if attribute is a boolean
		else if (attribute.includes('?')) {
			// Add getter and setter for the boolean
			bottom_code += `
				get ${attribute.slice(0, -1)}() {
					return this.hasAttribute('${attribute.slice(0, -1)}');
				}

				set ${attribute.slice(0, -1)}(val) {
					this.toggleAttribute('${attribute.slice(0, -1)}', val);
				}
			`;
		}

		// Else, attribute is a normal attribute
		else {
			const attr_name = attribute.replace('!', '');

			// Add getter and setter for the attribute
			bottom_code += `
				get ${attr_name}() {
					return this.getAttribute('${attr_name}');
				}

				set ${attr_name}(val) {
					this.setAttribute('${attr_name}', val);
				}
			`;
		}
	}

	// Add bottom code to the component
	code = code.slice(0, -1) + bottom_code.replace(/^\t{4}/gm, '\t') + '}';

	// Add constructor if not present
	code = code.replace(attribute_map, code.includes('constructor') ? '' : `constructor(attr) { super(attr); }`);

	// <This> tag
	code = code.replaceAll(/<This.*?>.*?<\/This>/gs, this_tag => {
		// Get inner HTML
		let innerHTML = this_tag.match(/<This.*?>(.*?)<\/This>/s)[1];

		// Add $ to {} variables
		innerHTML = innerHTML.replace(/{(.*?)}/g, '${$1}');

		// Return innerHTML
		return `this.innerHTML = \`${innerHTML}\``;
	});

	// Return compiled code
	return code;
}

// Build function
function build() {
	console.clear();

	// Get config
	const config = package.composcript;

	// Output
	let output = `
		function render(html) {
			const div = document.createElement('div');
			div.innerHTML = html;
			const elem = div.firstElementChild;
			elem.remove();
			return elem;
		}

		class ComposcriptComponent extends HTMLElement {
			constructor(attr) {
				super();
		
				this.created = false;
		
				if (attr) {
					for (let key in attr) this.setAttribute(key, attr[key]);
				}
			}
		
			async connectedCallback() {
				if (!this.created) {
					this.created = true;
					const content = this.innerHTML;
					this.created(content);
				}
			}
		
		}
	`;

	// Remove \t
	output = output.replaceAll(/^\t\t/gm, '').replace(/\t$/, '');

	// Get all component files
	const files = fs.readdirSync(config.components);

	// Loop through files
	for (const file of files) {
		// If file is not a component, skip
		if (!file.endsWith('.cmp')) continue;

		console.log(`Compiling ${colors.yellow}${file}${colors.reset}`);

		// Get component code
		let code = fs.readFileSync(`${config.components}/${file}`).toString();

		// Get component class
		const component_start = code.indexOf('class');
		let component_end = component_start + 1;
		let curly_count = 0;

		// Count curly braces
		while (component_end < code.length) {
			const char = code[component_end];

			// If open curly brace, increment
			if (char === '{') curly_count++;
			// Else if close curly brace, decrement and if 0, break
			else if (char === '}') {
				curly_count--;
				if (curly_count === 0) break;
			}

			component_end++;
		}

		// Cut out component class
		const component_code = code.slice(component_start, component_end + 1);

		// Replace by compiled component
		code = code.replace(component_code, compileComponent(file.slice(0, -4), component_code));

		// Add compiled code to output
		output += '\n' + code;
	}

	// Write to compiled.js
	fs.writeFileSync(`${config.components}/compiled.js`, output);
	console.log(`${colors.green}OK${colors.reset}`);
}

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
				// <${tag} />
				
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

// If user wants to build
else if (arg === 'build') {
	build();

	// Exit
	rl.close();
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
