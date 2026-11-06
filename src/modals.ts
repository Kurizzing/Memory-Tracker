import { App, Modal, Setting } from "obsidian";

export class TextPromptModal extends Modal {
	private value: string;

	constructor(app: App, private title: string, initial: string, private onSubmit: (value: string) => void) {
		super(app);
		this.value = initial;
	}

	onOpen() {
		this.titleEl.setText(this.title);
		new Setting(this.contentEl).addText((t) => {
			t.setValue(this.value).onChange((v) => (this.value = v));
			t.inputEl.style.width = "100%";
			t.inputEl.addEventListener("keydown", (e) => {
				if (e.key === "Enter" && !e.isComposing) {
					e.preventDefault();
					this.submit();
				}
			});
			window.setTimeout(() => t.inputEl.select(), 0);
		});
		new Setting(this.contentEl)
			.addButton((b) => b.setButtonText("취소").onClick(() => this.close()))
			.addButton((b) => b.setButtonText("확인").setCta().onClick(() => this.submit()));
	}

	private submit() {
		const v = this.value.trim();
		if (!v) return;
		this.close();
		this.onSubmit(v);
	}

	onClose() {
		this.contentEl.empty();
	}
}
