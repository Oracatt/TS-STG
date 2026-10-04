# 符卡接续与最终退场时序

以只读 `Touhou20Reconstruction` 的 ECL、MSG 与消弹实现为依据。Rush Demo 提供 Boss、弹幕轨迹、台词和美术；清弹、结算、死亡视觉及对话入场由公共 thlib 执行。

## 独立符卡

旧阶段结束后，独立符卡包装先建立下一血组、设置完整保护，并用90帧归位；到第160帧才启动新符卡名、计时、开卡特效和攻击初始化。玩家、道具与上一张符卡的结果提示持续运行。普通非符转配对符卡保持立即进入和共用血环，练习直接选卡跳过通关路径的准备包装。

具体阶段映射、源行号与帧边界见 [独立符卡准备](rushboss-phase-entry.md)。公共 `TouhouBossPhaseTimeline` 执行时钟，具体 Boss 与阶段编号仅保留在 Demo。

## 最终击破

击破帧为0；每秒60个固定模拟帧。

| 帧 | 行为 |
| --- | --- |
| 0 | Boss 停止攻击、开始漂移；固定击破点产生半径16的消弹波。 |
| 1–59 | 半径每帧增加6；未被波面触及的弹幕继续运动；符卡继续计时，仍可因中弹或 Bomb 失去奖励。 |
| 60 | 全场补清，保留消除动画；结算符卡、掉落、移除 Boss 并启动反色爆炸。 |
| 120 | 舞台开始战后对话，立即创建双方立绘；不等待死亡粒子和奖励提示结束。 |
| 124 | 第一位发言者进入说话状态。 |
| 154 | 创建首句文本和气泡，沿用公共 ANM 淡入。 |
| 158 | 开放首句对话输入。 |

第120帧来自 `MainBoss` 在 Boss 槽移除后等待60帧；后续0/4/34/38来自战后 MSG 入口。原导入 Rush 数据中的额外50帧整段空等不再用于竖屏 Demo 的战后入口。台词、表情、私有立绘继续使用 Rush 内容。

`TouhouBossDefeat` 管理漂移、消弹和爆炸时点，`TouhouBulletClearWave` 管理扩大圆波，`TouhouBossDeath` 管理可独立存活的反色和粒子；`TouhouGame.beginBossDefeat()` 也组合这套流程。舞台决定何时开启对话。详见 [公共击破接口](touhou-boss-defeat.md) 和 [公共对话](touhou-dialogue.md)。

单卡练习成功走同一套60帧击破流程。超时按 `BossEscapeSpell` 立即失败结算，然后用60帧飞离；不播放击破反色，也不凭空执行全场击破消弹。结果页会暂停世界，因此会等待尚在播放的结果反馈结束后再进入。

## 核对与验证

- 独立符卡：`st01bs.ecl.txt:420–456`；实际 Demo 映射见 `boss-phase-entry.js`。
- 击破：`default.ecl.txt` 的 `BossDead2`、`Ecl_EtBreak2_ni`；`st01bs.ecl.txt:909–926`。
- 战后等待：`st01.ecl.txt:1174–1186`、`st03.ecl.txt:1696–1708`。
- 立绘与首句：`st01m0.msg.utf8.txt:97` 的 entry1；`st03m0` 和 `st04m0` 同入口时点。
- 单卡超时：`default.ecl.txt:43–61`，`enemy_opcode_state.cpp:51–56`。

`tests/rushboss-ending-timeline.test.js` 覆盖伤害阶段触发、准备保护、逐步消弹、等待期间 Miss、练习及对话边界；公共 owner 另有独立测试。

`tools/verify-rushboss-ending-timeline.mjs` 在真实竖屏应用中检查上述边界，并输出 V8、QuickJS 状态和截图至 `reports/rushboss/ending-timeline/`。为固定击破时点，测试禁用该场景的私有攻击脚本并布置可控弹幕；保留公共渲染、真实 Rush 立绘和台词。报告包含源码哈希。验证不运行原作可执行文件，也不宣称与原作逐像素一致。

这些模拟时序变化将竖屏录像版本提升至7，旧录像不会在不同规则下继续回放。
