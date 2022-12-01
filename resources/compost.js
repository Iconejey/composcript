function renderCompostHTMl(html) {
	const div = document.createElement('div');
	div.innerHTML = html;
	const elem = div.firstElementChild;
	elem.remove();
	return elem;
}

class CompostComponent extends HTMLElement {
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
					throw new Error(`Required attribute "${req_attr}" not found`);
				}
			}

			this.created();
		}
	}
}
