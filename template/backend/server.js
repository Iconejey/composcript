const express = require('express');
const useragent = require('express-useragent');
const fileUpload = require('express-fileupload');
const compression = require('compression');

const ip = require('ip');

require('dotenv').config();

// // // // // // // // // // // // // // //

// App
const app = express();

// Basic middlewares
app.enable('trust proxy');
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(useragent.express());
app.use(fileUpload());

// Filter and log connections
app.use(async (req, res, next) => {
	// If the request is the main page, log it
	if (req.path === '/') {
		const ip = req.ip?.replace('::ffff:', '').replace('::1', 'localhost').replace('127.0.0.1', 'localhost');
		console.log(`[${new Date().toLocaleString()}] ${ip}`);
	}

	// Continue
	next();
});

// Set up routes
require('./routes')(app);

// Start the server
app.listen(8000, () => console.log('Server started'));
