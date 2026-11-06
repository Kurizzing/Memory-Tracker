import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type MemoryTrackerPlugin from "./main";
import { parseHeadingLine } from "./parser";
import { newId, unitLabel } from "./reconcile";
import { MODE_LABEL, stageLabel } from "./schedule";
import { DEFAULT_STAGES, Mode, StageDef } from "./types";

const WEEKDAYS = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];

export class MemoryTrackerSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: MemoryTrackerPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		const s = this.plugin.settings;
		const save = async (rescan = false) => {
			await this.plugin.saveAll();
			if (rescan) await this.plugin.scanAll();
			this.plugin.notify();
		};
		containerEl.empty();

		// ---- 추적 ----
		new Setting(containerEl).setName("추적").setHeading();

		new Setting(containerEl)
			.setName("추적 시작일")
			.setDesc("이 날짜(YYYY-MM-DD) 이후의 데일리 노트만 추적해요.")
			.addText((t) =>
				t.setValue(s.startDate).onChange(async (v) => {
					if (!/^\d{4}-\d{2}-\d{2}$/.test(v.trim())) return;
					s.startDate = v.trim();
					await save(true);
				}),
			);

		const daily = this.plugin.dailyConfig();
		new Setting(containerEl)
			.setName("데일리 노트 폴더")
			.setDesc(`비워두면 코어 데일리 노트 설정을 따라요. (현재: "${daily.folder}")`)
			.addText((t) =>
				t.setValue(s.dailyFolder).onChange(async (v) => {
					s.dailyFolder = v.trim();
					await save(true);
				}),
			);
		new Setting(containerEl)
			.setName("데일리 노트 형식")
			.setDesc(`비워두면 코어 데일리 노트 설정을 따라요. (현재: "${daily.format}")`)
			.addText((t) =>
				t.setValue(s.dailyFormat).onChange(async (v) => {
					s.dailyFormat = v.trim();
					await save(true);
				}),
			);

		// 부모 헤더: 입력 후 버튼으로 적용 (입력 도중에 추적이 흔들리지 않도록)
		let pending = s.parentHeading;
		new Setting(containerEl)
			.setName("공부 부모 헤더")
			.setDesc(`이 헤더 바로 아래 단계의 헤더들이 공부 단위예요. 현재: "${s.parentHeading}"`)
			.addText((t) => t.setValue(s.parentHeading).onChange((v) => (pending = v.trim())))
			.addButton((b) =>
				b
					.setButtonText("기존 노트에 적용")
					.setTooltip("추적 시작일 이후 데일리 노트의 헤더 이름도 함께 바꿔요")
					.onClick(async () => {
						if (!this.validHeading(pending)) return;
						const n = await this.plugin.changeParentHeading(pending, true);
						new Notice(`부모 헤더 변경 완료 (노트 ${n}개 수정)`);
						this.display();
					}),
			)
			.addButton((b) =>
				b
					.setButtonText("설정만 변경")
					.setTooltip("노트는 그대로 두고 설정만 바꿔요")
					.onClick(async () => {
						if (!this.validHeading(pending)) return;
						await this.plugin.changeParentHeading(pending, false);
						new Notice("부모 헤더 설정 변경 완료");
						this.display();
					}),
			);

		// ---- 일정 ----
		new Setting(containerEl).setName("일정").setHeading();

		new Setting(containerEl)
			.setName("복습일 요일")
			.setDesc("아래 복습 주기의 \"N번째 복습일\" 단계가 이 요일에 떠요.")
			.addDropdown((d) => {
				WEEKDAYS.forEach((w, i) => d.addOption(String(i), w));
				d.setValue(String(s.reviewWeekday)).onChange(async (v) => {
					s.reviewWeekday = Number(v);
					await save();
				});
			});

		this.displayStages(containerEl, save);

		new Setting(containerEl)
			.setName("같은 날 겹치는 단계 합치기")
			.setDesc("예: 수요일 공부 → 다음 날과 복습일이 같은 날. 켜면 한 항목으로 보여주고(전체 인출 우선), 체크하면 함께 완료돼요.")
			.addToggle((t) =>
				t.setValue(s.mergeSameDay).onChange(async (v) => {
					s.mergeSameDay = v;
					await save();
				}),
			);

		new Setting(containerEl)
			.setName("밀린 복습 표시")
			.setDesc("오늘 목록 맨 위에 아직 하지 않은 지난 복습을 보여줘요.")
			.addToggle((t) =>
				t.setValue(s.showOverdue).onChange(async (v) => {
					s.showOverdue = v;
					await save();
				}),
			);

		// ---- 표시 ----
		new Setting(containerEl).setName("표시").setHeading();

		new Setting(containerEl)
			.setName("노트에 ✅ 표시")
			.setDesc("복습을 체크하면 공부한 날 노트의 해당 항목 끝에 ✅를 붙이고, 해제하면 지워요. 완료한 단계 수만큼 붙어요.")
			.addToggle((t) =>
				t.setValue(s.markInNote).onChange(async (v) => {
					s.markInNote = v;
					await save();
				}),
			);

		new Setting(containerEl).setName("사이드바 뷰 사용").addToggle((t) =>
			t.setValue(s.enableSidebar).onChange(async (v) => {
				s.enableSidebar = v;
				await save();
				this.plugin.applySidebarSetting();
			}),
		);

		new Setting(containerEl)
			.setName("코드블록 사용")
			.setDesc("데일리 노트를 열면 아래 헤더 바로 밑에 ```memory-tracker``` 블록을 자동으로 넣어요. 헤더가 없으면 아무것도 하지 않아요.")
			.addToggle((t) =>
				t.setValue(s.enableCodeblock).onChange(async (v) => {
					s.enableCodeblock = v;
					await save();
				}),
			);

		new Setting(containerEl)
			.setName("코드블록 헤더")
			.setDesc('예: "## 복습"')
			.addText((t) =>
				t.setValue(s.codeblockHeading).onChange(async (v) => {
					if (!parseHeadingLine(v)) return;
					s.codeblockHeading = v.trim();
					await save();
				}),
			);

		// ---- 추적 금지 목록 ----
		new Setting(containerEl).setName("추적 금지 목록").setHeading();
		const ignored = this.plugin.units.filter((u) => u.ignored).sort((a, b) => (a.date < b.date ? 1 : -1));
		if (!ignored.length) containerEl.createDiv({ cls: "setting-item-description", text: "추적 금지한 항목이 없어요." });
		for (const u of ignored) {
			new Setting(containerEl)
				.setName(unitLabel(u))
				.setDesc(`${u.date} · ${u.path}${u.missing ? " (노트에서 사라짐)" : ""}`)
				.addButton((b) => b.setButtonText("이름 변경").onClick(() => this.plugin.promptRename(u, () => this.display())))
				.addButton((b) =>
					b.setButtonText("해제").onClick(async () => {
						await this.plugin.setIgnored(u, false);
						this.display();
					}),
				);
		}
	}

	/** 복습 주기 목록: 기준(N일 후 / N번째 복습일) + 값 + 방식, 추가/삭제/순서 변경 */
	private displayStages(containerEl: HTMLElement, save: () => Promise<void>) {
		const s = this.plugin.settings;
		const wd = WEEKDAYS[s.reviewWeekday];
		new Setting(containerEl)
			.setName("복습 주기")
			.setDesc(
				`"N일 후"는 공부한 날로부터 N일 뒤, "N번째 복습일"은 공부한 날 이후 N번째 ${wd}이에요 (1 = 이번주, 2 = 전주 내용). 단계를 지워도 완료 기록은 남아서 다시 추가하면 이어져요.`,
			)
			.addButton((b) =>
				b.setButtonText("기본값으로").onClick(async () => {
					s.stages = DEFAULT_STAGES.map((st) => ({ ...st }));
					await save();
					this.display();
				}),
			)
			.addButton((b) =>
				b
					.setButtonText("단계 추가")
					.setCta()
					.onClick(async () => {
						s.stages.push({ id: newId(), type: "days", value: 7, mode: "full" });
						await save();
						this.display();
					}),
			);

		s.stages.forEach((st, i) => {
			const row = new Setting(containerEl).setClass("mt-stage-row");
			const title = () => `${i + 1}. ${stageLabel(st)} · ${MODE_LABEL[st.mode]}`;
			row.setName(title());
			row.addDropdown((d) =>
				d
					.addOption("days", "N일 후")
					.addOption("review", "N번째 복습일")
					.setValue(st.type)
					.onChange(async (v) => {
						st.type = v as StageDef["type"];
						row.setName(title());
						await save();
					}),
			);
			row.addText((t) => {
				t.inputEl.type = "number";
				t.inputEl.min = "1";
				t.inputEl.style.width = "4.5em";
				t.setValue(String(st.value)).onChange(async (v) => {
					const n = Math.floor(Number(v));
					if (!Number.isFinite(n) || n < 1) return;
					st.value = n;
					row.setName(title());
					await save();
				});
			});
			row.addDropdown((d) =>
				d
					.addOption("flow", "흐름 인출")
					.addOption("full", "전체 인출")
					.setValue(st.mode)
					.onChange(async (v) => {
						st.mode = v as Mode;
						row.setName(title());
						await save();
					}),
			);
			row.addExtraButton((b) =>
				b
					.setIcon("arrow-up")
					.setTooltip("위로")
					.setDisabled(i === 0)
					.onClick(async () => {
						if (i === 0) return;
						[s.stages[i - 1], s.stages[i]] = [s.stages[i], s.stages[i - 1]];
						await save();
						this.display();
					}),
			);
			row.addExtraButton((b) =>
				b
					.setIcon("arrow-down")
					.setTooltip("아래로")
					.setDisabled(i === s.stages.length - 1)
					.onClick(async () => {
						if (i === s.stages.length - 1) return;
						[s.stages[i + 1], s.stages[i]] = [s.stages[i], s.stages[i + 1]];
						await save();
						this.display();
					}),
			);
			row.addExtraButton((b) =>
				b
					.setIcon("trash")
					.setTooltip("삭제")
					.onClick(async () => {
						if (s.stages.length <= 1) {
							new Notice("복습 단계는 최소 1개 있어야 해요");
							return;
						}
						s.stages.splice(i, 1);
						await save();
						this.display();
					}),
			);
		});
	}

	private validHeading(v: string): boolean {
		if (parseHeadingLine(v)) return true;
		new Notice('헤더 형식이 아니에요. 예: "## 공부"');
		return false;
	}
}
