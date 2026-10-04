# RushBoss Demo 的原作血量配置

运行时配置位于 [`games/rushboss/src/boss-health-profile.js`](../games/rushboss/src/boss-health-profile.js)。这里只配置 Demo 的具体阶段耐久；thlib 继续提供通用整数伤害规则和按实际 HP 分组的血环，不携带任何具体 Boss 的平衡数据。

这是一份 **以 TH20 普通流程 ECL 血量为依据的 Demo 映射**，不是 RushBoss 原始 HP，也不表示两部作品具有同样的攻击难度。Sunny 对应三面完整顺序，Monstone 主要对应四面，Artia 主要对应六面。Rush 的弹幕、阶段数量和时限不变，因此对两者阶段数量不等的部分明确选择复用来源，没有使用统一倍率。也没有使用 Rush `lifeBar.min/max` 作为血条显示权重。

## 血量与伤害的来源

本地只读参考根目录为 `D:/AIWorkspace/Touhou20Reconstruction`。`source_reconstruction/gameplay/enemy_opcode_state.cpp:47` 的 `511` 设置整组初始及最大 HP；`:50` 的 `514` 设置切换阈值和时限；`:78` 的 `527` 把阈值除以整组最大 HP，发布血环段界。因此拆成两个 Demo 阶段时，**非符 HP = 整组 HP − 符卡阈值，符卡 HP = 阈值**，不能把整组血量再次完整赋给非符。

`source_reconstruction/gameplay/enemy_damage_helpers.cpp:4–12` 中，普通伤害直接扣 HP，符卡伤害先扣七倍整数累积量，再除以 7 得到显示 HP。公共 [`TouhouHealth`](../packages/thlib/src/touhou/damage.js) 和 [`RushPlayerAdapter.beginPhase`](../games/rushboss/src/player-adapter.js) 已沿用这条规则。这次不改伤害公式。

旧 Sunny 第一非符是 450 HP，第一符卡是 1000 HP。忽略命中率、ECL 指定的保护计时和每帧伤害上限，以原始伤害量比较，前者只有后者约 `450 / (1000 × 7) = 6.43%` 的耐久，非符会过早结束。现在该组来自 `st03bs` 的 `23000 / 3000`：非符 20000，符卡 3000，分别约需 20000 和 21000 原始伤害量。公共默认共用血环中的符卡段是 `3000 / 23000 ≈ 13.04%`，此时符卡本身仍是完整的 3000 HP。竖屏 Demo 使用默认 `spellRing:'shared'`，非符到达分段处后，符卡从该剩余弧段继续，不重新填满整圈。整数截断可能使死亡边界相差最多 6 原始伤害量；上述比较不承诺实际击破时间。

原作共用血环的来源同时核对了 `enemy_damage.cpp:35–47` 的击破切换、`:49–65` 的超时切换及 `enemy_opcode_state.cpp:63–73` 的开卡路径：三者都不写最大 HP。`hud_system/update.cpp:70–74` 一直以当前 HP 除以该最大 HP。公共 `TouhouBossPhasePlan` 和竖屏 Demo 均采用默认 `spellRing:'shared'` 保留此行为。`full` 仅作为显式可选显示 API 保留，Demo 不启用。见 [`touhou-boss-hud.md`](touhou-boss-hud.md)。

2026-10-04 再次独立核对了实际绘制：`front.anm`374调用 `ins_602`，
`sprite_renderer/anm_vm.cpp:361–368`直接用该弧角生成开口环；375/376只是内外细轮廓。
开卡没有另一层“补满圈”绘制。原作普通流程保留残弧、单卡练习归一化为满圈。
Demo 的 `full` 由公共规划器移除符卡分隔标记，并以 `animateFill:false` 立即显示实际
血量比例；不等待逐帧填充。它仅改变 HUD，不修改逻辑 HP、伤害、保护期、胜负或回放版本。

## 新血组的受伤保护

此前 Demo 漏接了原作 ECL515。现在 `boss-health-profile.js` 同时记录每次显式
设置保护的源行、帧数与进入当前阶段前已经等待的帧数。普通非符接符卡不重设保护；
不能给所有符卡虚构统一的开场无敌。

| Demo | 重设保护的阶段（其余继承当前计时） |
| --- | --- |
| Sunny | 3、5：120帧；7：180−160＝20帧 |
| Monstone | 3、5、7：120帧；9：180−160＝20帧 |
| Artia | 3、5、7、9、11：120帧；12、13：160−160＝0帧 |

黑雾入口在召唤开始时设置120帧，出场和对话持续消耗这个计时，开始攻击时继承余量。
Demo 的直接飞入/单卡练习快捷入口跳过该召唤流程，默认不添加召唤计时；调用方可显式传
`damageProtectionFrames`。单卡练习也不执行普通流程各 BossN 的120/180帧包装。
这些映射保留当前 Demo 的攻击/入口调度，不表示完整执行原作 ECL 的所有等待指令。

`applyTouhouEnemyDamage` 复用原作 `enemy_damage.cpp:110` 的 record/apply 分支。
保护期间命中仍计分、计入 `damageTotal`，但 HP 和符卡七倍累计 HP 不变。
Demo 在当帧伤害结束后推进同一个 `TouhouTimer`，并将它交给 `TouhouBossHud`，
按原作隐藏保护中的血环。保护结束后，非符按源填充速度绘制，Demo 符卡立即显示自身
实际血量比例。独立回归检查最后一个保护帧、
第一个可扣血帧、同帧多次命中、普通和符卡 HP、正常与练习路径。

## 难度和练习模式

下列 HP 和 `514` 时限行均不受 `!E/!N/!H/!L` 限制，原作四个难度取值相同。因此 Demo 的 Easy、Normal、Hard、Lunatic 使用同一份 HP，现有分难度弹幕不变。

配置统一选原作 **普通流程**。`st03bs.ecl.txt:49` 单独进入第四张符卡的原作练习分支设置 5000，而普通流程 `Boss4` 在 `:513` 设置 3400。Sunny 最后一张在普通流程和本 Demo 符卡练习中均为 3400，以避免练习切换耐久。单卡练习的血环仍是该卡独立满环，实际 HP 和正常流程一致。六面最后一张必须读取 `BossCard7:1646` 实际开卡时的 12000，不能误取 `Boss7:736` 的过渡值 4500。

## 29 阶段对照

阶段从 1 开始编号。所有文件位于参考目录 `scripts/recovered/ecl/`，表内 `文件:行号` 指向实际设置 HP / 阈值的位置；具体结束时限行也记录在配置的 `source.timeLine` 中。秒数为 ECL 帧数除以 60。**Demo 时限保持 Rush 原值**，没有因更换 HP 自动延长。

| Demo 阶段 | 类型 | 旧 HP | 新 HP | 原作参考 HP / 阈值行 | 原作时限 / Demo 时限（秒） |
| --- | --- | ---: | ---: | --- | ---: |
| Sunny 1 | 非符 | 450 | 20000 | st03bs Boss1，20 / 63，23000−3000 | 40 / 40 |
| Sunny 2 | 符卡 1 | 1000 | 3000 | st03bs BossCard1，63 | 35 / 40 |
| Sunny 3 | 非符 | 480 | 20000 | st03bs Boss2，193 / 225，23200−3200 | 35 / 42 |
| Sunny 4 | 符卡 2 | 950 | 3200 | st03bs BossCard2，225 | 40 / 41 |
| Sunny 5 | 非符 | 460 | 19800 | st03bs Boss3，345 / 377，23200−3400 | 35 / 40 |
| Sunny 6 | 符卡 3 | 1250 | 3400 | st03bs BossCard3，377 | 45 / 46 |
| Sunny 7 | 符卡 4 | 1500 | 3400 | st03bs Boss4 → BossCard4，513 | 45 / 60 |
| Monstone 1 | 非符 | 420 | 20000 | st04bs Boss1，20 / 63，22800−2800 | 40 / 36 |
| Monstone 2 | 符卡 5 | 950 | 2800 | st04bs BossCard1，63 | 40 / 40 |
| Monstone 3 | 非符 | 490 | 20000 | st04bs Boss2，165 / 197，22800−2800 | 35 / 39 |
| Monstone 4 | 符卡 6 | 760 | 2800 | st04bs BossCard2，197 | 45 / 44 |
| Monstone 5 | 非符 | 540 | 20300 | st04bs Boss3，304 / 336，22800−2500 | 35 / 45 |
| Monstone 6 | 符卡 7 | 1100 | 2500 | st04bs BossCard3，336 | 45 / 48 |
| Monstone 7 | 非符（额外复用） | 560 | 20300 | st04bs Boss3，304 / 336 | 35 / 44 |
| Monstone 8 | 符卡 8（生存） | 1500 | 3200 | st05bs BossCard3，384 / 416，阈值 3200 | 55 / 40 |
| Monstone 9 | 符卡 9 | 1300 | 4300 | st04bs Boss4 → BossCard4，434 | 55 / 55 |
| Artia 1 | 非符 | 450 | 18000 | st06bs Boss1，20 / 82，21900−3900 | 50 / 40 |
| Artia 2 | 符卡 10 | 1300 | 3900 | st06bs BossCard1，82 | 55 / 48 |
| Artia 3 | 非符 | 500 | 18000 | st06bs Boss2，157 / 189，21900−3900 | 50 / 40 |
| Artia 4 | 符卡 11 | 1000 | 3900 | st06bs BossCard2，189 | 60 / 36 |
| Artia 5 | 非符 | 600 | 16000 | st06bs Boss3，267 / 306，20000−4000 | 60 / 45 |
| Artia 6 | 符卡 12 | 1050 | 4000 | st06bs BossCard3，306 | 65 / 39 |
| Artia 7 | 非符 | 745 | 16000 | st06bs Boss4，449 / 481，20000−4000 | 60 / 53 |
| Artia 8 | 符卡 13 | 1150 | 4000 | st06bs BossCard4，481 | 70 / 44 |
| Artia 9 | 非符 | 700 | 13000 | st06bs Boss5，565 / 605，17000−4000 | 60 / 48 |
| Artia 10 | 符卡 14 | 1150 | 4000 | st06bs BossCard5，605 | 80 / 46 |
| Artia 11 | 非符（额外复用） | 520 | 13000 | st06bs Boss5，565 / 605 | 60 / 39 |
| Artia 12 | 符卡 15 | 1100 | 4500 | st06bs Boss6 → BossCard6，691 | 65 / 40 |
| Artia 13 | 符卡 16（生存） | 1500 | 12000 | st06bs BossCard7，1646 | 120 / 60 |

Monstone 的第 4 次非符和 Artia 的第 6 次非符在所选原作阶段序列中没有对应条目，分别复用该面的最后一个非符。Monstone 第 4 张符卡额外选用五面 `BossCard3` 阈值 3200。它和 Artia 最终卡继续执行 **Rush 自己的生存卡规则**，不能通过伤害结束，保持原倒计时；这些 HP 不表示把其原作参考卡的弹幕或胜负规则搬入 Demo。Artia 最终原作有内部阶段阈值，Demo 只引用总 HP，没有虚构原作内部阶段。

## 验证与来源指纹

`tests/rushboss-source-health.test.js` 检查 29 个 HP、13 次非符 / 16 张符卡、原时限和两张生存卡、四种难度及普通 / 练习初始化一致性、真实伤害路径的七分之一折算，以及阶段血环显示。若本地参考目录存在，还逐行校验 `511/514` 数值及 SHA-256；可用 `TOUHOU20_REFERENCE` 指定只读参考根目录。没有参考目录时，仅该来源文件校验用例跳过。

| ECL 文件 | SHA-256 |
| --- | --- |
| st03bs.ecl.txt | `76a3deabc8b36a276211a065ac066a5c9a1e4e99b7a8eed4edca05118f308833` |
| st04bs.ecl.txt | `506a971eb46718c80198e8c06015acd223a8e542c332af8a20a681cb08a6a4a7` |
| st05bs.ecl.txt | `e6d28972095acb0c97762e2a1806e4ce523b5ffd13a5678ba0a58530c222e93e` |
| st06bs.ecl.txt | `75fb5fa85bd91569f93e80c6ae70a9c41986c15e6cc28b4e866533e2d9e95adb` |
