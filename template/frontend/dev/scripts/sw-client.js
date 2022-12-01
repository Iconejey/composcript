let diferred_prompt = null;

addEventListener('beforeinstallprompt', e => {
	// Prevent install prompt from showing
	e.preventDefault();

	// Save prompt and add install class to body
	diferred_prompt = e;
	document.body.classList.add('install');
});

addEventListener('appinstalled', e => {
	// Remove install class from body
	document.body.classList.remove('install');

	// Delete prompt
	diferred_prompt = null;

	// Ask user permission to show notifications
	setTimeout(() => Notification.requestPermission(), 1000);
});

async function promptInstall() {
	// Remove install class from body
	document.body.classList.remove('install');

	// Show install prompt
	diferred_prompt.prompt();
	diferred_prompt = null;
}

addEventListener('load', e => {
	// Register service worker
	navigator.serviceWorker?.register('/service-worker.js');
});
