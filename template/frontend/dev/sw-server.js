// 22.11.30

const use_cache = false;
const cache_domains = ['localhost', 'notask.app', 'fonts.gstatic.com'];
const cache_ignore = [];

const badge = '/img/badge_icon_x192.png';
const icon = '/img/round_icon_x512.png';

// Install event
self.addEventListener('install', async e => {
	// Show notification
	notify('Update', {
		body: 'The app is being updated',
		tag: 'update',
		requireInteraction: true
	});

	self.skipWaiting();
});

// Activate event
self.addEventListener('activate', async e => {
	// Delete caches
	const cache_list = await caches.keys();
	for (const cache_name of cache_list) await caches.delete(cache_name);

	// Show notification
	notify('Update', {
		body: 'The app has been updated',
		tag: 'update',
		actions: [{ title: 'Reload app', action: 'reload' }],
		renotify: true
	});

	self.clients.claim();
});

// Fetch event
self.addEventListener('fetch', e => e.respondWith(respond(e)));

async function fetchAndCache(req, cache_name) {
	// Fetch request
	const res = await fetch(req);

	// If response is ok and should be cached, cache it
	if (res.ok && use_cache && req.method === 'GET' && cache_domains.includes(new URL(req.url).hostname) && !cache_ignore.some(ignore => req.url.includes(ignore))) {
		const cache = await caches.open(cache_name);
		cache.put(req, res.clone());
	}

	return res;
}

async function respond(e) {
	// Try to get response from cache
	const cached_res = await caches.match(e.request);

	// If response is found, return it
	if (cached_res) return cached_res;

	// If request is not found, try to fetch it
	return await fetchAndCache(e.request, 'main');
}

// Show notification
function notify(title, options) {
	if (Notification.permission === 'granted') {
		self.registration.showNotification(title, { body: 'Notification', badge, ...options });
	}
}

// Notification click
self.addEventListener('notificationclick', e => {
	// Close action
	if (e.action === 'close') e.notification.close();

	// Reload action
	if (e.action === 'reload') {
		e.notification.close();
		refreshClients();
	}
});

// Notification close
self.addEventListener('notificationclose', e => {});

// Refresh clients
async function refreshClients() {
	const client_list = await self.clients.matchAll();
	for (const client of client_list) client.navigate?.('/');
}
