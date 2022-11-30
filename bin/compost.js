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

	const required_attributes = attributes.filter(a => a.includes('!')).map(a => a.replace('!', ''));

	// Add static getter for required attributes
	bottom_code += `
				get requiredAttributes() {
					return ${JSON.stringify(required_attributes)};
				}
	`;

	// For each attribute
	for (const attribute of attributes) {
		// If attribute is a class
		if (attribute.includes('.')) {
			const html_attr = attribute.slice(1);
			const js_attr = html_attr.replace('-', '_');

			// Add getter and setter for the class
			bottom_code += `
				get ${js_attr}() {
					return this.classList.contains('${html_attr}');
				}

				set ${js_attr}(val) {
					this.classList.toggle('${html_attr}', val);
				}
			`;
		}

		// Else check if attribute is a boolean
		else if (attribute.includes('?')) {
			const html_attr = attribute.slice(0, -1);
			const js_attr = html_attr.replace('-', '_');

			// Add getter and setter for the boolean
			bottom_code += `
				get ${js_attr}() {
					return this.hasAttribute('${html_attr}');
				}

				set ${js_attr}(val) {
					this.toggleAttribute('${html_attr}', val);
				}
			`;
		}

		// Else, attribute is a normal attribute
		else {
			const html_attr = attribute.replace('!', '');
			const js_attr = html_attr.replace('-', '_');

			// Add getter and setter for the attribute
			bottom_code += `
				get ${js_attr}() {
					return this.getAttribute('${html_attr}');
				}

				set ${js_attr}(val) {
					this.setAttribute('${html_attr}', val);
				}
			`;
		}
	}

	// Add bottom code to the component
	code = code.slice(0, -1) + bottom_code.replace(/^\t{4}/gm, '\t') + `}\n\ncustomElements.define('${component_tag}', ${code.match(/class (\w+)/)?.[1]});`;

	// Add constructor if not present
	code = code.replace(attribute_map, code.includes('constructor') ? '' : `constructor(attr) { super(attr); }`);

	// Return compiled code
	return code;
}

// Replace html code by render() function
function replaceHTMLCode(code) {
	let current = 0;
	let line = 1;
	let start = null;
	let height = 0;

	let line_comment = false;
	let block_comment = false;

	let in_string = false;
	let string_type = null;

	// Crawl through the code
	while (current < code.length) {
		const char = code[current];

		// If current chracter is a \n, increase line
		if (char === '\n') {
			line++;
			line_comment = false;
		}

		// Check for comments
		const two_chars = code.slice(current, current + 2);
		const pred_char = code[current - 1] || '';
		if (two_chars === '//' && pred_char !== ':') line_comment = true;
		if (two_chars === '/*') block_comment = true;
		if (two_chars === '*/') block_comment = false;

		// If not in a comment
		if (!line_comment && !block_comment) {
			// If currently not in a HTML block, check for strings
			if (!start) {
				// Check for strings
				if (char === '"' || char === "'" || char === '`') {
					if (!in_string) {
						in_string = true;
						string_type = char;
					} else if (char === string_type) {
						in_string = false;
						string_type = null;
					}
				}
			}

			// If not in a string
			if (!in_string) {
				// If current character is a '<'
				if (char === '<') {
					// Check if it is a HTML tag
					const tag = code.slice(current).match(/^<\/?(\w+)(.*?)>/)?.[0];

					// If it is a HTML tag
					if (tag) {
						// If start is null, set start to current
						if (start === null) start = current;

						// If self closing tag
						if (tag.includes('/>')) {
							// Get tag name
							const tag_name = tag.match(/^<\/?([\w-]+)/)?.[1];

							// If tag is a component tag (includes a dash)
							if (tag_name.includes('-')) {
								// Make the tag a non self closing tag
								const new_tag = tag.replace(/\s*\/>/, `></${tag_name}>`);

								// Replace the tag
								code = code.slice(0, current) + new_tag + code.slice(current + tag.length);

								// Move current to the end of the tag
								current += new_tag.length - 1;
							}
						}

						// Else increase / decrease height
						else if (tag[1] !== '/') height++;
						else height--;

						// If height is 0, the tag is closed
						if (height === 0) {
							// Slice the HTML code
							let html_code = code.slice(start, current + tag.length);

							// Replace all {/* */} by <!-- -->
							html_code = html_code.replace('{/*', '<!--').replace('*/}', '-->');

							// Replace all {...} with ${...}
							html_code = html_code.replaceAll(/{/g, '${');

							// If the HTML code is a <This> tag, replace it with an innerHTML call
							if (html_code.includes('<This')) {
								html_code = html_code.replace(/<This(.*?)>/g, 'this.innerHTML = `');
								html_code = html_code.replace(/<\/This>/g, '`');
							}

							// Else, replace it with a renderComposcriptHTMl() call
							else html_code = `renderComposcriptHTMl(\`${html_code}\`)`;

							// Add to the code
							code = code.slice(0, start) + html_code + code.slice(current + tag.length);

							// Update current
							current = start + html_code.length;

							// Reset start
							start = null;
						}
					}
				}
			}
		}

		current++;
	}

	return code;
}

// Build function
function build(log = true) {
	if (log) console.clear();

	// Get config
	const config = package.composcript;

	// Output
	let output = `
		function renderComposcriptHTMl(html) {
			const div = document.createElement('div');
			div.innerHTML = html;
			const elem = div.firstElementChild;
			elem.remove();
			return elem;
		}

		class ComposcriptComponent extends HTMLElement {
			constructor(attr) {
				super();
		
				this.creation_complete = false;
		
				if (attr) {
					for (let key in attr) this.setAttribute(key.replace('_', '-'), attr[key]);
				}
			}
		
			async connectedCallback() {
				if (!this.creation_complete) {
					this.creation_complete = true;

					for (const req_attr of this.requiredAttributes) {
						if (!this.hasAttribute(req_attr)) {
							throw new Error(\`Required attribute "\${req_attr}" not found\`);
						}
					}
					
					this.created();
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
		if (!file.endsWith('.jsx')) continue;

		if (log) console.log(`Compiling ${colors.yellow}${file}${colors.reset}`);

		// Get component code
		let code = fs.readFileSync(`${config.components}/${file}`).toString();

		// Handle HTML code
		code = replaceHTMLCode(code);

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
	if (log) console.log(`${colors.green}OK${colors.reset}`);
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
		const file_path = `${config.components}/${tag}.jsx`;

		// Create component file and open it
		console.log(`\nCreating ${colors.yellow}${class_name} ${colors.cyan}<${colors.red}${tag}${colors.cyan} />${colors.reset} component in ${colors.green}${file_path}${colors.reset}`);

		const output = `
			class ${class_name} {
				// <${tag} />
				
				created() {
					<This></This>
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
	console.clear();
	console.log(`${colors.green}Watching for changes${colors.reset}`);

	const config = package.composcript;

	// Build once
	build(false);

	// Use timeout to prevent multiple builds
	let timeout;

	// Watch for changes
	fs.watch(config.components, { recursive: true }, (event, file) => {
		// If file is not a component, ignore
		if (!file || !file.endsWith('.jsx')) return;

		// Clear timeout and set new one
		if (timeout) clearTimeout(timeout);
		timeout = setTimeout(() => {
			console.log(`${colors.green}Change detected in ${file}${colors.reset}`);
			build(false);
		}, 500);
	});
}

// Wrong argument
else {
	console.log(`Usage: ${colors.cyan}composcript [init|create|watch]${colors.reset}`);
	process.exit(1);
}
