import { moment, Notice, Plugin, TAbstractFile, TFile, WorkspaceLeaf } from "obsidian";
import { TextPromptModal } from "./modals";
import { findStudyHeadings, insertCodeblock, renameHeadingLines, renameStudyHeading } from "./parser";
import { reconcileFile } from "./reconcile";
import { MemoryTrackerSettingTab } from "./settings";
import { DEFAULT_SETTINGS, PluginData, Settings, StageKey, Unit } from "./types";
import { ReviewBlock, ReviewView, VIEW_TYPE } from "./view";

const CODEBLOCK_LANG = "memory-tracker";

export default class MemoryTrackerPlugin extends Plugin {
	settings!: Settings;
	units: Unit[] = [];
	private listeners = new Set<() => void>();
	private ribbonEl: HTMLElement | null = null;
	/** 부모 헤더 일괄 변경 중에는 수정 이벤트로 재조정하지 않음 */
	private suspendReconcile = false;
	private lastToday = "";

	async onload() {
		await this.loadAll();

		this.registerView(VIEW_TYPE, (leaf: WorkspaceLeaf) => new ReviewView(leaf, this));
		this.registerMarkdownCodeBlockProcessor(CODEBLOCK_LANG, (source, el, ctx) => {
			ctx.addChild(new ReviewBlock(el, this, source, ctx.sourcePath));
		});
		this.addSettingTab(new MemoryTrackerSettingTab(this.app, this));

		this.ribbonEl = this.addRibbonIcon("calendar-check", "오늘의 복습 열기", () => this.activateView());
		this.addCommand({ id: "open-review-view", name: "오늘의 복습 열기", callback: () => this.activateView() });
		this.addCommand({
			id: "rescan",
			name: "데일리 노트 다시 스캔",
			callback: async () => {
				await this.scanAll();
				new Notice("Memory Tracker: 스캔 완료");
			},
		});
		this.applySidebarSetting();

		this.app.workspace.onLayoutReady(async () => {
			await this.scanAll();
			this.registerEvent(this.app.metadataCache.on("changed", (file, data) => this.onFileChanged(file, data)));
			this.registerEvent(this.app.vault.on("rename", (file, oldPath) => this.onRename(file, oldPath)));
			this.registerEvent(this.app.vault.on("delete", (file) => this.onDelete(file)));
			this.registerEvent(this.app.workspace.on("file-open", (file) => file && this.maybeInsertCodeblock(file)));
			const active = this.app.workspace.getActiveFile();
			if (active) this.maybeInsertCodeblock(active);
		});

		// 자정이 지나면 "오늘" 갱신
		this.lastToday = this.today();
		this.registerInterval(
			window.setInterval(() => {
				if (this.today() !== this.lastToday) {
					this.lastToday = this.today();
					this.notify();
				}
			}, 60_000),
		);
	}

	// ---------------- 데이터 ----------------

	async loadAll() {
		const data = ((await this.loadData()) ?? {}) as Partial<PluginData>;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data.settings);
		this.units = data.units ?? [];
		if (!this.settings.startDate) {
			this.settings.startDate = this.today();
			await this.saveAll();
		}
	}

	async saveAll() {
		await this.saveData({ settings: this.settings, units: this.units } satisfies PluginData);
	}

	onChange(fn: () => void): () => void {
		this.listeners.add(fn);
		return () => this.listeners.delete(fn);
	}

	notify() {
		for (const fn of this.listeners) fn();
	}

	private async commit() {
		await this.saveAll();
		this.notify();
	}

	today(): string {
		return moment().format("YYYY-MM-DD");
	}

	// ---------------- 데일리 노트 ----------------

	dailyConfig(): { folder: string; format: string } {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const core = (this.app as any).internalPlugins?.getPluginById?.("daily-notes")?.instance?.options ?? {};
		const folder = (this.settings.dailyFolder || core.folder || "").replace(/^\/+|\/+$/g, "");
		const format = this.settings.dailyFormat || core.format || "YYYY-MM-DD";
		return { folder, format };
	}

	/** 데일리 노트 경로면 YYYY-MM-DD, 아니면 null */
	dateOfPath(path: string): string | null {
		if (!path.endsWith(".md")) return null;
		const { folder, format } = this.dailyConfig();
		let rel = path.slice(0, -3);
		if (folder) {
			if (!rel.startsWith(folder + "/")) return null;
			rel = rel.slice(folder.length + 1);
		}
		const m = moment(rel, format, true);
		return m.isValid() ? m.format("YYYY-MM-DD") : null;
	}

	/** 추적 대상 데일리 노트의 날짜 */
	private trackedDate(path: string): string | null {
		const d = this.dateOfPath(path);
		return d && d >= this.settings.startDate ? d : null;
	}

	async scanAll() {
		let changed = false;
		const seen = new Set<string>();
		for (const file of this.app.vault.getMarkdownFiles()) {
			const date = this.trackedDate(file.path);
			if (!date) continue;
			seen.add(file.path);
			const content = await this.app.vault.cachedRead(file);
			changed = reconcileFile(this.units, file.path, date, findStudyHeadings(content, this.settings.parentHeading)) || changed;
		}
		// 노트가 없어졌거나 추적 범위를 벗어난 단위는 숨김
		for (const u of this.units) {
			if (!seen.has(u.path) && !u.missing) {
				u.missing = true;
				changed = true;
			}
		}
		if (changed) await this.saveAll();
		this.notify();
	}

	private async onFileChanged(file: TFile, content: string) {
		if (this.suspendReconcile) return;
		const date = this.trackedDate(file.path);
		if (!date) return;
		if (reconcileFile(this.units, file.path, date, findStudyHeadings(content, this.settings.parentHeading))) {
			await this.commit();
		}
	}

	private async onRename(file: TAbstractFile, oldPath: string) {
		if (!(file instanceof TFile)) return;
		const moved = this.units.filter((u) => u.path === oldPath);
		if (!moved.length) return;
		const date = this.dateOfPath(file.path);
		for (const u of moved) {
			u.path = file.path;
			if (date) u.date = date;
			else u.missing = true;
		}
		await this.commit();
	}

	private async onDelete(file: TAbstractFile) {
		const before = this.units.length;
		this.units = this.units.filter((u) => u.path !== file.path);
		if (this.units.length !== before) await this.commit();
	}

	private async maybeInsertCodeblock(file: TFile) {
		if (!this.settings.enableCodeblock || !this.trackedDate(file.path)) return;
		const content = await this.app.vault.cachedRead(file);
		if (insertCodeblock(content, this.settings.codeblockHeading, CODEBLOCK_LANG) === null) return;
		await this.app.vault.process(file, (c) => insertCodeblock(c, this.settings.codeblockHeading, CODEBLOCK_LANG) ?? c);
	}

	// ---------------- 동작 ----------------

	async setStagesDone(unit: Unit, stages: StageKey[], done: boolean) {
		const set = new Set(unit.done);
		for (const s of stages) done ? set.add(s) : set.delete(s);
		unit.done = [...set];
		await this.commit();
	}

	async setIgnored(unit: Unit, ignored: boolean) {
		unit.ignored = ignored;
		await this.commit();
		if (ignored) new Notice(`추적 금지: ${unit.heading} (설정에서 해제할 수 있어요)`);
	}

	async openUnit(unit: Unit) {
		const file = this.app.vault.getAbstractFileByPath(unit.path);
		if (!(file instanceof TFile)) {
			new Notice("노트를 찾을 수 없어요");
			return;
		}
		await this.app.workspace.getLeaf(false).openFile(file, { eState: { line: unit.line } });
	}

	promptRename(unit: Unit, after?: () => void) {
		new TextPromptModal(this.app, "공부 단위 이름 변경", unit.heading, async (name) => {
			await this.renameUnit(unit, name);
			after?.();
		}).open();
	}

	/** 노트의 헤더를 고치고 기록을 그대로 이어감 */
	async renameUnit(unit: Unit, newText: string) {
		if (newText === unit.heading) return;
		const file = this.app.vault.getAbstractFileByPath(unit.path);
		if (!(file instanceof TFile)) {
			new Notice("노트를 찾을 수 없어요");
			return;
		}
		const parent = this.settings.parentHeading;
		const content = await this.app.vault.read(file);
		if (findStudyHeadings(content, parent).some((h) => h.text === newText)) {
			new Notice("같은 노트에 이미 같은 이름의 헤더가 있어요");
			return;
		}
		if (renameStudyHeading(content, parent, unit.heading, newText) === null) {
			new Notice("노트에서 헤더를 찾지 못했어요");
			return;
		}
		const oldText = unit.heading;
		unit.heading = newText; // 수정 이벤트가 오기 전에 먼저 바꿔서 같은 단위로 인식되게 함
		await this.app.vault.process(file, (c) => renameStudyHeading(c, parent, oldText, newText) ?? c);
		await this.commit();
		new Notice(`이름 변경: ${oldText} → ${newText}`);
	}

	/** 부모 헤더 변경. rewrite면 추적 범위의 데일리 노트 헤더도 고침. 수정한 노트 수 반환 */
	async changeParentHeading(newLine: string, rewrite: boolean): Promise<number> {
		const oldLine = this.settings.parentHeading;
		let count = 0;
		if (rewrite) {
			this.suspendReconcile = true;
			try {
				for (const file of this.app.vault.getMarkdownFiles()) {
					if (!this.trackedDate(file.path)) continue;
					const content = await this.app.vault.read(file);
					if (renameHeadingLines(content, oldLine, newLine) === null) continue;
					await this.app.vault.process(file, (c) => renameHeadingLines(c, oldLine, newLine) ?? c);
					count++;
				}
			} finally {
				this.suspendReconcile = false;
			}
		}
		this.settings.parentHeading = newLine.trim();
		await this.saveAll();
		await this.scanAll();
		return count;
	}

	// ---------------- 사이드바 ----------------

	applySidebarSetting() {
		if (this.ribbonEl) this.ribbonEl.toggle(this.settings.enableSidebar);
		if (!this.settings.enableSidebar) this.app.workspace.detachLeavesOfType(VIEW_TYPE);
	}

	async activateView() {
		if (!this.settings.enableSidebar) {
			new Notice("사이드바 뷰가 꺼져 있어요 (설정에서 켤 수 있어요)");
			return;
		}
		const { workspace } = this.app;
		let leaf = workspace.getLeavesOfType(VIEW_TYPE)[0];
		if (!leaf) {
			const right = workspace.getRightLeaf(false);
			if (!right) return;
			leaf = right;
			await leaf.setViewState({ type: VIEW_TYPE, active: true });
		}
		workspace.revealLeaf(leaf);
	}
}

