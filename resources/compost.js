class CompostComponent extends HTMLElement {
	static render(html) {
		const div = document.createElement('div');
		div.innerHTML = html;
		const elem = div.firstElementChild;
		elem.remove();
		return elem;
	}

	constructor(attr) {
		super();

		if (attr) {
			for (let key in attr) this.setAttribute(key.replace('_', '-'), attr[key]);
		}

		this.created();
	}
}
