import { Menu, setIcon } from "obsidian";
import type MemoryTrackerPlugin from "./main";
import { GROUP_ORDER, itemsForDate, ReviewItem, STAGE_LABEL } from "./schedule";
import type { StageKey } from "./types";

const DOW = ["일", "월", "화", "수", "목", "금", "토"];

export function shortDate(date: string): string {
	const [y, m, d] = date.split("-").map(Number);
	const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
	return `${m}/${d} (${DOW[dow]})`;
}

function md(date: string): string {
	const [, m, d] = date.split("-").map(Number);
	return `${m}/${d}`;
}

const GROUP_TITLE: Record<StageKey, string> = {
	thuFull: "📘 전체 인출 · 전주",
	thuFlow: "📗 흐름 인출 · 이번주",
	d3: "📕 3일 후 · 전체 인출",
	d1: "📙 다음 날 · 흐름 인출",
};

/** 사이드바 / 코드블록 공용 렌더러 */
export function renderReviewList(el: HTMLElement, plugin: MemoryTrackerPlugin, date: string): void {
	el.empty();
	el.addClass("mt-list");
	const s = plugin.settings;
	const isToday = date === plugin.today();
	const items = itemsForDate(plugin.units, date, {
		reviewWeekday: s.reviewWeekday,
		merge: s.mergeSameDay,
		includeOverdue: isToday && s.showOverdue,
		startDate: s.startDate,
	});

	if (items.length === 0) {
		el.createDiv({ cls: "mt-empty", text: "복습할 내용이 없어요 🎉" });
		return;
	}

	const overdue = items.filter((i) => i.overdue);
	if (overdue.length) renderGroup(el, plugin, "⏰ 밀린 복습", overdue, true);

	for (const g of GROUP_ORDER) {
		const gi = items.filter((i) => !i.overdue && i.group === g);
		if (!gi.length) continue;
		const dates = gi.map((i) => i.unit.date).sort();
		const range = dates[0] === dates[dates.length - 1] ? md(dates[0]) : `${md(dates[0])}~${md(dates[dates.length - 1])}`;
		renderGroup(el, plugin, `${GROUP_TITLE[g]} (${range})`, gi, false);
	}
}

function renderGroup(el: HTMLElement, plugin: MemoryTrackerPlugin, title: string, items: ReviewItem[], overdue: boolean) {
	const group = el.createDiv({ cls: "mt-group" + (overdue ? " mt-overdue" : "") });
	const done = items.filter((i) => i.done).length;
	group.createDiv({ cls: "mt-group-title", text: `${title} · ${done}/${items.length}` });
	for (const item of items) renderItem(group, plugin, item);
}

function renderItem(el: HTMLElement, plugin: MemoryTrackerPlugin, item: ReviewItem) {
	const { unit } = item;
	const row = el.createDiv({ cls: "mt-item" + (item.done ? " mt-done" : "") });

	const cb = row.createEl("input", { type: "checkbox", cls: "mt-check" });
	cb.checked = item.done;
	cb.title = "복습 완료";
	cb.addEventListener("change", () => plugin.setStagesDone(unit, item.stages, cb.checked));

	const body = row.createDiv({ cls: "mt-body" });
	const link = body.createEl("a", { cls: "mt-title", text: unit.text });
	link.addEventListener("click", (e) => {
		e.preventDefault();
		plugin.openUnit(unit);
	});
	const meta = body.createDiv({ cls: "mt-meta" });
	meta.createSpan({ text: md(unit.date) });
	if (unit.kind === "item") meta.createSpan({ cls: "mt-tag mt-category", text: unit.category });
	if (item.overdue) {
		meta.createSpan({ cls: "mt-tag", text: `${STAGE_LABEL[item.group]} · ${md(item.due)}` });
	}
	if (item.stages.length > 1) {
		meta.createSpan({ cls: "mt-tag", text: "합침: " + item.stages.map((st) => STAGE_LABEL[st]).join(" + ") });
	}

	const ignore = row.createDiv({ cls: "mt-ignore clickable-icon", attr: { "aria-label": "추적 금지" } });
	setIcon(ignore, "ban");
	ignore.addEventListener("click", () => plugin.setIgnored(unit, true));

	row.addEventListener("contextmenu", (e) => {
		const menu = new Menu();
		menu.addItem((i) => i.setTitle("노트 열기").setIcon("file-text").onClick(() => plugin.openUnit(unit)));
		menu.addItem((i) => i.setTitle("이름 변경").setIcon("pencil").onClick(() => plugin.promptRename(unit)));
		menu.addItem((i) => i.setTitle("추적 금지").setIcon("ban").onClick(() => plugin.setIgnored(unit, true)));
		menu.showAtMouseEvent(e);
	});
}
