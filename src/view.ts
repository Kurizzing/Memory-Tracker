import { ItemView, MarkdownRenderChild, setIcon, WorkspaceLeaf } from "obsidian";
import type MemoryTrackerPlugin from "./main";
import { renderReviewList, shortDate } from "./render";
import { addDays } from "./schedule";

export const VIEW_TYPE = "memory-tracker-view";

export class ReviewView extends ItemView {
	private date: string | null = null; // null = 오늘 따라가기
	private unsubscribe: (() => void) | null = null;

	constructor(leaf: WorkspaceLeaf, private plugin: MemoryTrackerPlugin) {
		super(leaf);
	}

	getViewType() {
		return VIEW_TYPE;
	}
	getDisplayText() {
		return "오늘의 복습";
	}
	getIcon() {
		return "calendar-check";
	}

	async onOpen() {
		this.unsubscribe = this.plugin.onChange(() => this.render());
		this.render();
	}

	async onClose() {
		this.unsubscribe?.();
	}

	private render() {
		const root = this.contentEl;
		root.empty();
		root.addClass("mt-view");
		const date = this.date ?? this.plugin.today();

		const nav = root.createDiv({ cls: "mt-nav" });
		const prev = nav.createDiv({ cls: "clickable-icon", attr: { "aria-label": "이전 날" } });
		setIcon(prev, "chevron-left");
		prev.addEventListener("click", () => this.move(-1));
		nav.createDiv({ cls: "mt-nav-title", text: `${shortDate(date)} 복습` });
		const next = nav.createDiv({ cls: "clickable-icon", attr: { "aria-label": "다음 날" } });
		setIcon(next, "chevron-right");
		next.addEventListener("click", () => this.move(1));
		if (this.date !== null && this.date !== this.plugin.today()) {
			const todayBtn = nav.createEl("button", { cls: "mt-today", text: "오늘" });
			todayBtn.addEventListener("click", () => {
				this.date = null;
				this.render();
			});
		}

		renderReviewList(root.createDiv(), this.plugin, date);
	}

	private move(n: number) {
		const next = addDays(this.date ?? this.plugin.today(), n);
		this.date = next === this.plugin.today() ? null : next;
		this.render();
	}
}

/** ```memory-tracker``` 블록. 본문에 `date: YYYY-MM-DD`가 있으면 그 날짜, 없으면 노트 날짜, 그것도 없으면 오늘 */
export class ReviewBlock extends MarkdownRenderChild {
	constructor(el: HTMLElement, private plugin: MemoryTrackerPlugin, private source: string, private sourcePath: string) {
		super(el);
	}

	onload() {
		this.register(this.plugin.onChange(() => this.render()));
		this.render();
	}

	private render() {
		const el = this.containerEl;
		el.empty();
		if (!this.plugin.settings.enableCodeblock) {
			el.createDiv({ cls: "mt-empty", text: "Memory Tracker 코드블록이 꺼져 있어요 (설정에서 켤 수 있어요)" });
			return;
		}
		const m = /date:\s*(\d{4}-\d{2}-\d{2})/.exec(this.source);
		const date = m?.[1] ?? this.plugin.dateOfPath(this.sourcePath) ?? this.plugin.today();
		const wrap = el.createDiv({ cls: "mt-block" });
		wrap.createDiv({ cls: "mt-nav-title", text: `${shortDate(date)} 복습` });
		renderReviewList(wrap.createDiv(), this.plugin, date);
	}
}
