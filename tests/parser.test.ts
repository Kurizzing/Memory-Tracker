import { test } from "node:test";
import assert from "node:assert/strict";
import { findStudyHeadings, findStudyItems, insertCodeblock, renameHeadingLines, renameStudyItem, setDoneMarks } from "../src/parser";
import { reconcileFile } from "../src/reconcile";
import type { Unit } from "../src/types";

const NOTE = [
	"---",
	"title: x",
	"---",
	"# 2026-11-07",
	"## 복습",
	"## 학습",
	"### 한국사",
	"",
	"* 최태성 심화강의 14, 15, 16강",
	"\t* 세부 메모 (하위 목록은 제외)",
	"",
	"### 영어",
	"",
	"* 어휘끝 day5",
	"- [x] 천일문 day5",
	"*",
	"```",
	"* 코드 안 목록",
	"```",
	"### 수학",
	"1. 정석 1단원",
	"### 과학",
	"내용 없음",
	"## 운동",
	"### 턱걸이",
	"- 3세트",
].join("\n");

const P = "## 학습";

test("과목 헤더는 부모 바로 아래 단계만", () => {
	assert.deepEqual(
		findStudyHeadings(NOTE, P).map((h) => h.text),
		["한국사", "영어", "수학", "과학"],
	);
});

test("과목 아래 최상위 목록이 각각 공부 항목, 목록이 없으면 과목 헤더 자체", () => {
	const items = findStudyItems(NOTE, P);
	assert.deepEqual(
		items.map((i) => [i.category, i.text, i.kind]),
		[
			["한국사", "최태성 심화강의 14, 15, 16강", "item"],
			["영어", "어휘끝 day5", "item"],
			["영어", "천일문 day5", "item"],
			["수학", "정석 1단원", "item"],
			["과학", "과학", "heading"],
		],
	);
	assert.equal(items[0].line, 8);
	assert.deepEqual(
		items.map((i) => i.order),
		[0, 1, 2, 3, 4],
	);
});

test("부모 헤더가 없으면 빈 목록", () => {
	assert.deepEqual(findStudyItems(NOTE, "## 없음"), []);
});

test("항목 이름 변경: 마커와 체크박스 유지", () => {
	const out = renameStudyItem(NOTE, P, { category: "영어", text: "천일문 day5", kind: "item" }, "천일문 day5~6")!;
	assert.ok(out.includes("\n- [x] 천일문 day5~6\n"));
	const out2 = renameStudyItem(NOTE, P, { category: "과학", text: "과학", kind: "heading" }, "물리")!;
	assert.ok(out2.includes("\n### 물리\n"));
	assert.equal(renameStudyItem(NOTE, P, { category: "영어", text: "없음", kind: "item" }, "x"), null);
});

test("✅ 표시: 붙이기/지우기, 항목 인식은 그대로", () => {
	const eng = { category: "영어", text: "어휘끝 day5", kind: "item" as const };
	const one = setDoneMarks(NOTE, P, eng, 1)!;
	assert.ok(one.includes("\n* 어휘끝 day5 ✅\n"));
	const two = setDoneMarks(one, P, eng, 2)!;
	assert.ok(two.includes("\n* 어휘끝 day5 ✅✅\n"));
	assert.deepEqual(
		findStudyItems(two, P).map((i) => i.text),
		findStudyItems(NOTE, P).map((i) => i.text),
	);
	assert.equal(setDoneMarks(two, P, eng, 2), null);
	assert.equal(setDoneMarks(two, P, eng, 0), NOTE);

	// 체크박스 항목 / 과목 헤더 항목
	const chk = setDoneMarks(NOTE, P, { category: "영어", text: "천일문 day5", kind: "item" }, 1)!;
	assert.ok(chk.includes("\n- [x] 천일문 day5 ✅\n"));
	const head = setDoneMarks(NOTE, P, { category: "과학", text: "과학", kind: "heading" }, 1)!;
	assert.ok(head.includes("\n### 과학 ✅\n"));
	assert.equal(findStudyItems(head, P).find((i) => i.kind === "heading")!.category, "과학");

	// 이름 변경 시 표시 유지
	assert.ok(renameStudyItem(two, P, eng, "어휘끝 day6")!.includes("\n* 어휘끝 day6 ✅✅\n"));
});

test("부모 헤더 일괄 변경 (CRLF 유지)", () => {
	const crlf = NOTE.replace(/\n/g, "\r\n");
	const out = renameHeadingLines(crlf, P, "## 공부")!;
	assert.ok(out.includes("\r\n## 공부\r\n"));
	assert.equal(findStudyItems(out, "## 공부").length, 5);
});

test("코드블록 삽입은 한 번만", () => {
	const once = insertCodeblock(NOTE, "## 복습", "memory-tracker")!;
	assert.ok(once.includes("## 복습\n```memory-tracker\n```\n## 학습"));
	assert.equal(insertCodeblock(once, "## 복습", "memory-tracker"), null);
	assert.equal(insertCodeblock(NOTE, "## 없음", "memory-tracker"), null);
});

test("reconcile: 생성 → 항목 이름 변경 감지 → 과목 이름 변경 → 사라짐/복구", () => {
	const units: Unit[] = [];
	reconcileFile(units, "a.md", "2026-11-07", findStudyItems(NOTE, P));
	assert.equal(units.length, 5);
	const eng = units.find((u) => u.text === "어휘끝 day5")!;
	eng.done = ["d1"];

	// 항목 하나만 직접 고침 → 기록 이어받음
	let note = NOTE.replace("* 어휘끝 day5", "* 어휘끝 day5~6");
	reconcileFile(units, "a.md", "2026-11-07", findStudyItems(note, P));
	assert.equal(units.length, 5);
	assert.equal(eng.text, "어휘끝 day5~6");
	assert.deepEqual(eng.done, ["d1"]);

	// 과목 헤더 이름을 바꿔도 항목 기록 유지
	note = note.replace("### 영어", "### English");
	reconcileFile(units, "a.md", "2026-11-07", findStudyItems(note, P));
	assert.equal(units.length, 5);
	assert.equal(eng.category, "English");
	assert.deepEqual(eng.done, ["d1"]);

	// 부모 헤더가 사라지면 missing, 다시 생기면 복구
	reconcileFile(units, "a.md", "2026-11-07", []);
	assert.ok(units.every((u) => u.missing));
	reconcileFile(units, "a.md", "2026-11-07", findStudyItems(note, P));
	assert.ok(units.every((u) => !u.missing));
	assert.deepEqual(eng.done, ["d1"]);
});
