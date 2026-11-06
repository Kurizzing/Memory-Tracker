import { test } from "node:test";
import assert from "node:assert/strict";
import { doneCount, dueDates, itemsForDate, stageLabel, weekday } from "../src/schedule";
import { DEFAULT_STAGES, StageDef, Unit } from "../src/types";

const THU = 4;
const STAGES = DEFAULT_STAGES;

function unit(date: string, heading = date, done: Unit["done"] = []): Unit {
	return { id: heading, path: `${date}.md`, category: "c", text: heading, kind: "item", line: 0, order: 0, date, done, ignored: false, missing: false };
}

const opts = { stages: STAGES, reviewWeekday: THU, merge: false, includeOverdue: false, startDate: "" };

test("2026-11-07은 토요일", () => {
	assert.equal(weekday("2026-11-07"), 6);
});

test("기본 단계: 다음 날, 3일 후, 이번주 목, 다음 주 목", () => {
	assert.deepEqual(dueDates("2026-11-07", STAGES, THU), {
		d1: "2026-11-08",
		d3: "2026-11-10",
		thuFlow: "2026-11-12",
		thuFull: "2026-11-19",
	});
	assert.deepEqual(STAGES.map(stageLabel), ["다음 날", "3일 후", "복습일 · 이번주", "복습일 · 전주"]);
});

test("화요일 공부의 3일 후는 금요일 그대로 (미루지 않음)", () => {
	assert.equal(dueDates("2026-11-10", STAGES, THU).d3, "2026-11-13");
});

test("목/금 공부는 다음 주 진도로 취급", () => {
	assert.equal(dueDates("2026-11-12", STAGES, THU).thuFlow, "2026-11-19");
	assert.equal(dueDates("2026-11-13", STAGES, THU).thuFlow, "2026-11-19");
	assert.equal(dueDates("2026-11-12", STAGES, THU).thuFull, "2026-11-26");
});

test("11/19(목): 11/7~11/11은 전체 인출, 11/14~11/18은 흐름 인출, 전주 그룹이 먼저", () => {
	const units = ["2026-11-07", "2026-11-09", "2026-11-11", "2026-11-14", "2026-11-16", "2026-11-18"].map((d) => unit(d));
	const items = itemsForDate(units, "2026-11-19", opts);
	const full = items.filter((i) => i.group.id === "thuFull").map((i) => i.unit.date);
	const flow = items.filter((i) => i.group.id === "thuFlow").map((i) => i.unit.date);
	assert.deepEqual(full, ["2026-11-07", "2026-11-09", "2026-11-11"]);
	assert.deepEqual(flow, ["2026-11-14", "2026-11-16", "2026-11-18"]);
	assert.equal(items[0].group.id, "thuFull");
	assert.ok(items.some((i) => i.unit.date === "2026-11-18" && i.group.id === "d1"));
	assert.ok(items.some((i) => i.unit.date === "2026-11-16" && i.group.id === "d3"));
});

test("합치기 켜짐: 같은 날 단계는 한 항목, 전체 인출 우선", () => {
	const items = itemsForDate([unit("2026-11-16")], "2026-11-19", { ...opts, merge: true });
	assert.equal(items.length, 1);
	assert.equal(items[0].group.id, "d3");
	assert.equal(items[0].mode, "full");
	assert.deepEqual(items[0].stages.map((s) => s.id).sort(), ["d3", "thuFlow"]);
});

test("밀린 복습: 끝나지 않은 지난 단계만", () => {
	const u = unit("2026-11-07", "a", ["d1"]);
	const items = itemsForDate([u], "2026-11-11", { ...opts, includeOverdue: true });
	assert.deepEqual(
		items.map((i) => [i.group.id, i.overdue]),
		[["d3", true]],
	);
});

test("추적 금지 / 사라진 단위 / 시작일 이전은 제외", () => {
	const a = { ...unit("2026-11-07"), ignored: true };
	const b = { ...unit("2026-11-07"), missing: true };
	const c = unit("2026-11-01");
	assert.equal(itemsForDate([a, b], "2026-11-08", opts).length, 0);
	assert.equal(itemsForDate([c], "2026-11-02", { ...opts, startDate: "2026-11-06" }).length, 0);
});

test("사용자 단계: 7일 후 추가, 3번째 복습일", () => {
	const custom: StageDef[] = [
		...STAGES,
		{ id: "w1", type: "days", value: 7, mode: "full" },
		{ id: "r3", type: "review", value: 3, mode: "full" },
	];
	const dues = dueDates("2026-11-07", custom, THU);
	assert.equal(dues.w1, "2026-11-14");
	assert.equal(dues.r3, "2026-11-26");
	assert.equal(stageLabel(custom[5]), "복습일 · 2주 전");
	const items = itemsForDate([unit("2026-11-07")], "2026-11-14", { ...opts, stages: custom });
	assert.deepEqual(
		items.map((i) => i.group.id),
		["w1"],
	);
});

test("단계를 지우면 완료 수에서 빠지고, 기록은 남음", () => {
	const u = unit("2026-11-07", "a", ["d1", "d3"]);
	assert.equal(doneCount(u, STAGES), 2);
	assert.equal(doneCount(u, STAGES.filter((s) => s.id !== "d1")), 1);
	assert.deepEqual(u.done, ["d1", "d3"]);
});
