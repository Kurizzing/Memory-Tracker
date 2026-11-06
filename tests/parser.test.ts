import { test } from "node:test";
import assert from "node:assert/strict";
import { findStudyHeadings, insertCodeblock, renameHeadingLines, renameStudyHeading } from "../src/parser";
import { reconcileFile } from "../src/reconcile";
import type { Unit } from "../src/types";

const NOTE = [
	"---",
	"title: x",
	"---",
	"# 2026-11-07",
	"## 복습",
	"## 공부",
	"### 스택",
	"- 내용",
	"#### 세부",
	"### 큐",
	"```",
	"### 코드 안 헤더",
	"```",
	"## 운동",
	"### 턱걸이",
].join("\n");

test("부모 헤더 바로 아래 단계만 공부 단위", () => {
	const hs = findStudyHeadings(NOTE, "## 공부");
	assert.deepEqual(
		hs.map((h) => h.text),
		["스택", "큐"],
	);
	assert.equal(hs[0].line, 6);
});

test("부모 헤더가 없으면 빈 목록", () => {
	assert.deepEqual(findStudyHeadings(NOTE, "## 없음"), []);
});

test("공부 단위 이름 변경", () => {
	const out = renameStudyHeading(NOTE, "## 공부", "스택", "스택과 큐")!;
	assert.deepEqual(
		findStudyHeadings(out, "## 공부").map((h) => h.text),
		["스택과 큐", "큐"],
	);
	assert.equal(renameStudyHeading(NOTE, "## 공부", "없음", "x"), null);
});

test("부모 헤더 일괄 변경 (CRLF 유지)", () => {
	const crlf = NOTE.replace(/\n/g, "\r\n");
	const out = renameHeadingLines(crlf, "## 공부", "## 학습")!;
	assert.ok(out.includes("\r\n## 학습\r\n"));
	assert.equal(findStudyHeadings(out, "## 학습").length, 2);
});

test("코드블록 삽입은 한 번만", () => {
	const once = insertCodeblock(NOTE, "## 복습", "memory-tracker")!;
	assert.ok(once.includes("## 복습\n```memory-tracker\n```\n## 공부"));
	assert.equal(insertCodeblock(once, "## 복습", "memory-tracker"), null);
	assert.equal(insertCodeblock(NOTE, "## 없음", "memory-tracker"), null);
});

test("reconcile: 생성 → 이름 변경 감지 → 사라짐/복구", () => {
	const units: Unit[] = [];
	reconcileFile(units, "a.md", "2026-11-07", findStudyHeadings(NOTE, "## 공부"));
	assert.equal(units.length, 2);
	units[0].done = ["d1"];

	// 헤더 하나만 이름 변경 → 기록 이어받음
	const renamed = NOTE.replace("### 스택", "### 스택 구현");
	reconcileFile(units, "a.md", "2026-11-07", findStudyHeadings(renamed, "## 공부"));
	assert.equal(units.length, 2);
	assert.equal(units[0].heading, "스택 구현");
	assert.deepEqual(units[0].done, ["d1"]);

	// 부모 헤더가 사라지면 missing, 다시 생기면 복구
	reconcileFile(units, "a.md", "2026-11-07", []);
	assert.ok(units.every((u) => u.missing));
	reconcileFile(units, "a.md", "2026-11-07", findStudyHeadings(renamed, "## 공부"));
	assert.ok(units.every((u) => !u.missing));
	assert.deepEqual(units[0].done, ["d1"]);
});
