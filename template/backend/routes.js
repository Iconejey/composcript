// Main libraries
const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

// Routes function called by both http and https servers
module.exports = function routes(app) {
	// Global
	app.use('/', express.static(path.join(__dirname, '../frontend/dist')));

	// 404
	app.get('*', (req, res) => {
		res.status(404).sendFile(path.join(__dirname, '../frontend/dist/404.html'));
	});
};
