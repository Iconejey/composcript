#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const child_process = require('child_process');
const { question } = require('readline-sync');
const { createCanvas, loadImage } = require('canvas');

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

// Compile component function
function compileComponent(component_tag, code) {
	// Add HTMLElement extension if not present
	if (!code.includes('extends')) code = code.replace(/class \w+/, '$& extends CompostComponent');

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

// Compile jsx
function compileJSX(code, tag) {
	// Handle HTML code
	code = replaceHTMLCode(code);

	// If file is a component
	if (tag) {
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
		code = code.replace(component_code, compileComponent(tag, component_code));
	}

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

							// Else, replace it with a renderCompostHTMl() call
							else html_code = `renderCompostHTMl(\`${html_code}\`)`;

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

// Compile html page
function compileHTML(code) {
	// Handle meta tags
	code = code.replaceAll(/<meta name="(.*?)" content="(.*?)"\s?\/>/g, (match, name, content) => {
		// Title
		if (name === 'title')
			return `${match}
		<meta name="og:type" content="website" />
		<meta name="og:title" content="${content}" />
		<meta name="twitter:card" content="summary_large_image" />
		<meta name="twitter:title" content="${content}" />`;

		// Description
		if (name === 'description')
			return `${match}
		<meta name="og:description" content="${content}" />
		<meta name="twitter:description" content="${content}" />`;

		// Image
		if (name === 'image')
			return `<meta name="og:image" content="${content}" />
		<meta name="twitter:image" content="${content}" />`;

		if (name === 'url')
			return `<meta name="og:url" content="${content}" />
		<meta name="twitter:url" content="${content}" />`;

		return match;
	});

	// Handle icon
	code = code.replace(/<icon name="(.*?)"\s?\/>/g, (match, name) => {
		return `<link rel="icon" href="/imgs/icons/badge_${name}_x192.png" type="image/png" />
		<link rel="shortcut icon" href="/imgs/icons/badge_${name}_x192.png" type="image/png" />
		<link rel="apple-touch-icon" href="/imgs/icons/apple_${name}_x180.png" sizes="180x180" />`;
	});

	return code;
}

// Compile manifest
function compileManifest(content) {
	let manifest = JSON.parse(content);

	manifest.icons = [
		{
			src: `/imgs/icons/round_${manifest.icon}_x192.png`,
			sizes: '192x192',
			type: 'image/png',
			purpose: 'any'
		},
		{
			src: `/imgs/icons/round_${manifest.icon}_x512.png`,
			sizes: '512x512',
			type: 'image/png',
			purpose: 'any'
		},
		{
			src: `/imgs/icons/maskable_${manifest.icon}_x192.png`,
			sizes: '192x192',
			type: 'image/png',
			purpose: 'maskable'
		},
		{
			src: `/imgs/icons/maskable_${manifest.icon}_x512.png`,
			sizes: '512x512',
			type: 'image/png',
			purpose: 'maskable'
		}
	];

	delete manifest.icon;

	return JSON.stringify(manifest, '\t', 4);
}

// Create icon
function createIcon(image, background, size, padding, round) {
	// If background color is hex, add # to it
	if (background?.length === 6) background = '#' + background;

	// Create canvas
	const canvas = createCanvas(size, size);
	const ctx = canvas.getContext('2d');

	// Draw background
	if (background) {
		ctx.fillStyle = background;

		if (!round) ctx.fillRect(0, 0, size, size);
		else {
			ctx.beginPath();
			ctx.arc(size / 2, size / 2, size / 2, 0, 2 * Math.PI);
			ctx.fill();
		}
	}

	// Draw image
	ctx.drawImage(image, padding, padding, size - padding * 2, size - padding * 2);

	// Return canvas
	return canvas;
}

// Compile icon
async function compileIcon(elem_src) {
	// Load icon
	const icon = await loadImage(fs.readFileSync(elem_src));

	let [name, color] = path.basename(elem_src).split('.')[0].split('_');
	const dest_path = path.join(elem_src, '..', '..', '..', '..', 'dist', 'imgs', 'icons');
	console.dir(dest_path);

	// Icons config
	const config = [
		['badge', null, 512, 0, false],
		['badge', null, 192, 0, false],
		['maskable', color, 512, 512 * 0.2, false],
		['maskable', color, 192, 192 * 0.2, false],
		['round', color, 512, 512 * 0.15, true],
		['round', color, 192, 192 * 0.15, true],
		['apple', color, 180, 180 * 0.15, false]
	];

	// Create icons
	for (const [type, color, size, padding, round] of config) {
		const src = path.join(dest_path, `${type}_${name}_x${size}.png`);
		fs.writeFileSync(src, createIcon(icon, color, size, padding, round).toBuffer());
	}
}

// Build function
async function build(log = true) {
	if (log) console.clear();

	// Output
	let compiled_scripts = fs.readFileSync(path.join(__dirname, '../resources/compost.js'));
	let compiled_scss = '';

	const dev_dir = path.join(process.cwd(), 'frontend/dev');
	const dist_dir = path.join(process.cwd(), 'frontend/dist');

	// If dist folder exists, delete it
	if (fs.existsSync(dist_dir)) fs.rmSync(dist_dir, { recursive: true });

	// Create dist folder
	fs.mkdirSync(dist_dir);

	// Crawl recursively through a directory
	async function crawl(dir) {
		// Get elements in the directory
		const elems = fs.readdirSync(dir);

		// For each file
		for (const elem of elems) {
			// Get file path
			const elem_src = path.join(dir, elem);
			const elem_dest = elem_src.replace(dev_dir, dist_dir);

			// If file is a directory, create it in dist and crawl it
			if (fs.statSync(elem_src).isDirectory()) {
				fs.mkdirSync(elem_dest);
				await crawl(elem_src);
			}

			// Else compile file to dist
			else {
				const content = fs.readFileSync(elem_src).toString();

				// js file in scripts: add it to the compiled scripts
				if (elem_src.endsWith('.js') && dir.endsWith('scripts')) compiled_scripts += content;
				// jsx file: compile it and add it to the compiled scripts
				else if (elem_src.endsWith('.jsx')) compiled_scripts += compileJSX(content, elem_src.includes('/components/') ? elem.replace('.jsx', '') : null);
				// scss file: add it to the compiled scss
				else if (elem_src.endsWith('.scss')) compiled_scss += content;
				// html file: compile it and add it to dist
				else if (elem_src.endsWith('.html')) fs.writeFileSync(elem_dest, compileHTML(content));
				// manifest file: compile it and add it to dist
				else if (elem_src.endsWith('manifest.json')) fs.writeFileSync(elem_dest, compileManifest(content));
				// icon file: compile it and add it to dist
				else if (elem_src.endsWith('.png') && dir.endsWith('icons')) await compileIcon(elem_src, elem_dest);
				// Else copy it to dist
				else fs.copyFileSync(elem_src, elem_dest);
			}
		}

		// If the equivalent directory in dist is empty, delete it
		const dist_equiv = dir.replace(dev_dir, dist_dir);
		if (!fs.readdirSync(dist_equiv).length) fs.rmdirSync(dist_equiv);
	}

	// Crawl through the dev folder
	await crawl(dev_dir);

	// Write compiled scripts and styles to dist
	const js_path = path.join(dist_dir, 'compiled-scripts.js');
	const scss_path = path.join(dist_dir, 'compiled-styles.scss');
	const css_path = path.join(dist_dir, 'compiled-styles.css');
	fs.writeFileSync(js_path, compiled_scripts);
	fs.writeFileSync(scss_path, compiled_scss);

	// Compile scss using child process and delete scss file
	child_process.execSync(`sass --no-source-map ${scss_path} ${css_path}`);
	fs.unlinkSync(scss_path);

	if (log) console.log(`${colors.green}OK${colors.reset}`);
}

// Copy folder content to another folder (recursive)
function copyFolder(from, to) {
	// Get folder content
	const elems = fs.readdirSync(from);

	// Loop through elements
	for (const elem of elems) {
		// Get element path
		const elem_path = `${from}/${elem}`;

		// If element is a file, copy it
		if (fs.lstatSync(elem_path).isFile()) {
			fs.copyFileSync(elem_path, `${to}/${elem}`);
		}

		// Else, create folder and copy content
		else {
			fs.mkdirSync(`${to}/${elem}`);
			copyFolder(elem_path, `${to}/${elem}`);
		}
	}
}

// If user wants to init Compost project
if (arg === 'init') {
	// Ask for project id, name, description, author and url
	const id = question(`${colors.yellow}Project ID: ${colors.reset}`);
	const name = question(`${colors.yellow}Project name: ${colors.reset}`);
	const description = question(`${colors.yellow}Project description: ${colors.reset}`);
	const author = question(`${colors.yellow}Author: ${colors.reset}`);
	const url = question(`${colors.yellow}URL: ${colors.reset}`);

	console.log(`\n${colors.green}Initializing Compost file structure:${colors.reset}
${id}
├─ package.json
├─ .env
├─ frontend
│  ├─ dev
│  │  ├─ index.html
│  │  ├─ manifest.json
│  │  ├─ sw-server.js
│  │  ├─ scripts
│  │  │  ├─ main.jsx
│  │  │  ├─ components
│  │  │  │  ├─ test.jsx
│  │  │  │  └─ ...
│  │  │  ├─ libs
│  │  │  │  └─ ...
│  │  │  ├─ sw-client.js
│  │  │  └─ ...
│  │  ├─ styles
│  │  │  ├─ main.scss
│  │  │  └─ ...
│  │  ├─ imgs
│  │  │  ├─ icons
│  │  │  │  ├─ logo.png (512x512)
│  │  │  │  └─ ...
│  │  │  └─ ...
│  │  └─ ...
│  ├─ dist (generated, used by express as '/')
│  │  ├─ index.html
│  │  ├─ manifest.json
│  │  ├─ sw-server.js
│  │  ├─ compiled-scripts.js
│  │  ├─ compiled-styles.scss
│  │  ├─ compiled-styles.css
│  │  ├─ imgs
│  │  │  ├─ icons
│  │  │  │  ├─ badge_logo_x192.png
│  │  │  │  ├─ badge_logo_x512.png
│  │  │  │  ├─ maskable_logo_x192.png
│  │  │  │  ├─ maskable_logo_x512.png
│  │  │  │  ├─ rounded_logo_x192.png
│  │  │  │  ├─ rounded_logo_x512.png
│  │  │  │  ├─ apple_logo_x180.png
│  │  │  │  └─ ...
│  │  │  └─ ...
│  │  └─ ...
│  ├─ backend
│  │  ├─ server.js
│  │  ├─ routes.js
│  │  └─ ...
│  └─ ...
└─ ...`);

	// Copy all folders and files from template
	const src = path.join(__dirname, '../template');
	const dest = process.cwd();

	copyFolder(src, dest);

	// Update package.json
	console.log(`${colors.green}Updating package.json...${colors.reset}`);
	const package = {
		...JSON.parse(fs.readFileSync(`${dest}/package.json`)),
		name: id,
		version: '0.0.0',
		description,
		main: './backend/server.js',
		scripts: {
			start: 'node ./backend/server.js',
			prod: `pm2 start ./backend/server.js --name ${id} && npm run logs`,
			dev: 'nodemon ./backend/server.js --ignore frontend/',
			logs: `pm2 logs ${id} --raw`,
			build: 'compost build'
		},
		author,
		hompage: url
	};

	fs.writeFileSync('package.json', JSON.stringify(package, '\t', 4));

	// Update manifest.json
	console.log(`${colors.green}Updating manifest.json...${colors.reset}`);
	manifest = {
		...JSON.parse(fs.readFileSync(`${dest}/frontend/dev/manifest.json`)),
		id,
		name,
		short_name: name,
		description,
		related_applications: [{ platform: 'web', url }]
	};

	fs.writeFileSync(`${dest}/frontend/dev/manifest.json`, JSON.stringify(manifest, '\n', 4));

	// Add name and description to index.html
	let index = fs.readFileSync(`${dest}/frontend/dev/index.html`).toString();
	const meta = `<title>${name}</title>
		<meta name="title" content="${name}" />
		<meta name="description" content="${description}" />
		<meta name="url" content="${url}" />
		<meta name="image" content="${url}/imgs/banner.png" />`;
	index = index.replace('<title-description />', meta);
	fs.writeFileSync(`${dest}/frontend/dev/index.html`, index);

	// Add domain to service worker
	let sw = fs.readFileSync(`${dest}/frontend/dev/sw-server.js`).toString();
	sw = sw.replace('<domain>', new URL(url).host);
	fs.writeFileSync(`${dest}/frontend/dev/sw-server.js`, sw);

	console.log(`${colors.green}Done!${colors.reset}\n`);
}

// If user wants to create a new component
else if (arg === 'create') {
	console.log(`${colors.green}Creating new component${colors.reset}`);

	// Ask user for component tag name
	const tag = question(`${colors.yellow}Component tag name${colors.reset} (e.g. my-component): `);

	// If tag is not valid, exit
	if (!tag || !/^[a-z]+-(-?[a-z0-9]+)+$/.test(tag)) {
		console.error(`${colors.red}<${tag}></${tag}> : Invalid tag name, please use kebab-case (lowwercase letters and hyphens) and at least two words with no numbers in the first word${colors.reset}`);
		process.exit(1);
	}

	// Deduce component class name
	const class_name = tag
		.split('-')
		.map(word => word[0].toUpperCase() + word.slice(1))
		.join('');

	// Create component file and open it
	console.log(`\nCreating ${colors.yellow}${class_name} ${colors.cyan}<${colors.red}${tag}${colors.cyan} />${colors.reset} component`);

	const output = `class ${class_name} {
	// <${tag} />
	
	created() {
		<This></This>;
	}
}`;

	const file_src = `frontend/dev/scripts/components/${tag}.jsx`;
	fs.writeFileSync(file_src, output);
	child_process.exec(`code ${file_src}`);
}

// If user wants to build
else if (arg === 'build') {
	build();
}

// If user wants to watch for changes
else if (arg === 'watch') {
	console.clear();
	console.log(`${colors.green}Watching for changes${colors.reset}`);

	// Build once
	build(false);

	// Use timeout to prevent multiple builds
	let timeout;

	// Watch for changes
	fs.watch('frontend/dev', { recursive: true }, (event, file) => {
		if (timeout) clearTimeout(timeout);
		timeout = setTimeout(() => {
			console.clear();
			console.log(`${colors.green}Change detected in ${file}${colors.reset}`);
			build(false);
		}, 1000);
	});
}

// Wrong argument
else {
	console.log(`Usage: ${colors.cyan}compost [init|create|watch]${colors.reset}`);
	process.exit(1);
}
