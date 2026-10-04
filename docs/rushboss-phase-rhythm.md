# RushBoss Demo 的阶段切换节奏

公共 [`TouhouBossPhaseTimeline`](../packages/thlib/src/touhou/boss-phase-timeline.js) 管理固定帧时钟、准备事件和攻击启动。具体阶段使用的帧数与 Rush 弹幕自身的准备长度位于私有 [`boss-phase-timing.js`](../games/rushboss/src/boss-phase-timing.js)。原作 Boss 名称、具体攻击、阶段选择和剧情不进入 thlib。

本次对齐的是**符卡击破后进入新非符血组**的准备、血环出现与第一发弹幕的先后关系。普通非符转符卡继续使用同一组剩余血环；血环贴图采样的修复与血环是否归一化是两件独立的事。单卡练习仍使用独立满环。见 [血环说明](touhou-boss-hud.md) 和 [血量映射](rushboss-source-health.md)。

## 原作如何切换

只读参考根目录为 `D:/AIWorkspace/Touhou20Reconstruction`。

- `source_reconstruction/gameplay/enemy_damage.cpp:21–24` 在达到阶段阈值的伤害处理内直接选择并执行下一个脚本；没有统一的“符卡结算等待60帧”。结算文字与掉落可以继续显示，下一阶段的准备已经开始。
- `source_reconstruction/gameplay/enemy_opcode_state.cpp:40` 的 `ins_504` 只写移动范围，不能把参数当成等待时长；`:47` 的 `ins_511` 设置新血组，`:59` 的 `ins_515` 设置受伤保护。
- `source_reconstruction/gameplay/enemy_update.cpp:72–83` 先执行脚本及伤害，随后让保护计时减一。脚本等待不会冻结此计时。
- `source_reconstruction/hud_system/update.cpp:70–91` 在保护计时大于零时移除血环动画；保护结束后重新建立动画，并以每帧 `float32(0.025)` 增加显示比例。显示比例本身在临时隐藏时保留。不能为掩盖提前发弹而绕过这个隐藏条件。
- `source_reconstruction/ecl_vm/vm.cpp:179–219` 按脚本时间执行事件，`ins_23` 通过减少局部脚本时间产生等待。准备期仍有可见的聚能、移动和释放动作。

三面的 `Boss2` 是本次用户可见问题的直接对照：

| 从新脚本启动起的时间 | 原作动作 | `st03bs.ecl.txt` 来源 |
| --- | --- | --- |
| 0 | 设置120帧保护及新组 HP；结算上一张符卡；蓝色聚能开始 | 192–228 |
| 90 | 聚能释放，继续等30帧 | 229–232 |
| 120 | 绿色攻击聚能开始，等待60帧 | 238–240 |
| 180 | 释放攻击聚能，启动第一组弹幕 | 241–245；首个生成指令272 |

因此不存在“先放弹，过一会儿血环才出现”的阶段。旧 Demo 在结果后额外等待60帧，又让新非符的 Rush 局部弹幕时钟立即开始，导致约75帧的私有热身先结束，而公共120帧受伤保护仍在隐藏血环。

这里的0是脚本开始执行的帧。如果把该帧计为第一次 actor update，保护的120次递减后血环可见，对应偏移119；脚本的90＋30等待在偏移120结束。验证必须注明“帧偏移”还是“累计更新次数”，不要通过整体加减一帧掩盖不同的时间原点。`float32` 的40次 `.025` 累加略小于1，满血环需要第41次更新钳到1。

## 私有 Demo 映射

同一套公共规则可接受不同的原作脚本节奏，不能把所有 Boss 都固定为180帧首发。

| Demo 非符编号 | 原作来源 | 原作聚能起点 | 第一发生成帧 | 原 Rush 第一发（E/N/H/L） |
| --- | --- | --- | ---: | --- |
| Sunny 3 | st03 Boss2 | 0、120 | 180 | 80 / 80 / 80 / 80 |
| Sunny 5 | st03 Boss3 | 0、120 | 180 | 99 / 99 / 99 / 99 |
| Monstone 3 | st04 Boss2 | 0、120 | 180 | 81 / 80 / 79 / 78 |
| Monstone 5 | st04 Boss3 | 0、120 | 180 | 102 / 99 / 96 / 93 |
| Monstone 7 | 复用 st04 Boss3 | 0、120 | 180 | 82 / 81 / 80 / 79 |
| Artia 3 | st06 Boss2 | 0 | 120 | 75 / 75 / 75 / 75 |
| Artia 5 | st06 Boss3 | 120 | 240 | 86 / 86 / 86 / 86 |
| Artia 7 | st06 Boss4 | 0 | 120 | 80 / 80 / 80 / 80 |
| Artia 9 | st06 Boss5 | 120 | 240 | 81 / 81 / 81 / 81 |
| Artia 11 | 复用 st06 Boss5 | 120 | 240 | 80 / 80 / 80 / 80 |

六面的 `Boss2/Boss4` 在90＋30准备后直接生成弹幕，血环开始恢复的同时攻击即可开始，不应额外强制等待血环填满。`Boss3/Boss5` 则先有120帧移动、锦上京专属剧情，再开始90＋30准备。本 Demo 保留这120帧移动时间，只使用 Rush 自己的对话，省略锦上京剧情；240是**省略这段剧情等待后的映射值**，不是原作完整剧情的固定总耗时。

完整源行记录在配置中，包括聚能 ANM、音效、攻击协程调用与首个弹体生成指令。此处“第一发”指创建弹体或激光，并不等同于弹雾结束或判定开启。

## 接入约定

`TouhouBossPhaseTimeline` 构造和 `reset()` 将 `frame` 设为0，并同步派发第0帧 cue。回调第二参是当前 owner，无需捕获一个还没完成赋值的变量。`update()` 每次恰好推进一帧，事件依帧排序；同帧事件保留配置顺序，每个事件只派发一次。

公共时钟不拥有 HP、伤害保护、倒计时、生成器或 ANM。使用者在准备期间继续更新玩家、世界、保护计时、HUD 和聚能，只按 `patternReady` 决定是否推进所提供的弹幕脚本。

`patternLeadIn` 是弹幕脚本自身已有的准备长度，不是额外的等待。本 Demo 对每种难度实测首发，使用 `patternLeadIn = firstEmission - 1`：

```js
const timing = rushBossPhaseTiming(boss, number, difficulty, { practice });
const clock = new TouhouBossPhaseTimeline({ ...timing, onCue });
// 每帧先 clock.update()；首次 patternReady 时 patternFrame = 1。
// phase.update 接收 patternFrame，不接收阶段总时钟。
```

例如 Sunny 第二非符的旧第一发为第80次局部更新。把局部脚本从阶段偏移101开始运行，第180帧便产生第一发；不会在准备期偷偷快进脚本、丢弃生成的弹幕或消耗额外随机数。世界中的生成器仍按正常生命周期运行，不能为了门控整个阶段而一起冻结世界。

这10个非符的 `init` 均只初始化状态、移动目标及旧聚能，没有创建提前发弹的 actor。旧 `maple` 聚能可能出现在 `init`（Monstone 3/5/7、Artia 3/11）或局部脚本第一帧；映射准备期应由公共 cue 替代，所以抑制条件必须在调用 `phase.init` 之前就建立。

charge cue 的 `options` 可直接交给公共 `beginCharge()`。该 owner 自己在 `releaseFrame` 创建释放 ANM；release cue 只派发对应的音效，不重复创建动画。原作68→79使用蓝色聚能、品红释放、90帧；72→89使用绿色聚能、黄色释放、60帧。

聚能的可选 `clock` 绑定 `timeline.frame - cue.frame`，创建当帧也更新演出时不会把释放提前一帧。每阶段记录其聚能对象，阶段结束时调用 `stop()` 取消未来释放，已经生成的 ANM 正常退场；停止后的聚能不再读取旧阶段时钟，允许上层替换或重置阶段。

阶段总时钟与弹幕局部时钟分开。准备等待通常计入阶段时限，不能等第一发才开始倒计时。Artia 5/9/11 的映射来源额外在120帧移动及剧情后执行 `ins_513/514` 重置时限，私有配置以 `source.phaseClockStartFrame: 120` 标出此区别；这个具体脚本事实不变成公共库中的 Boss 特判。Demo 时限数值仍沿用当前内容配置，这份文档不声称复现完整 ECL VM。

练习进入单卡跳过普通 `BossN` 包装，因此本配置返回 `null`。普通非符→符卡也不添加这套新非符准备或重设保护计时，符卡即刻从共用血环段界继续。独立尾卡、连续符卡和各卡内部的重复攻击不属于这10个非符包装，不从此表推断它们的时间。

## 验证范围

- [`touhou-boss-phase-timeline.test.js`](../tests/touhou-boss-phase-timeline.test.js)：门控边界、第0帧回调、同帧次序、reset、重复派发及非法时间。
- [`rushboss-phase-timing-source.test.js`](../tests/rushboss-phase-timing-source.test.js)：10阶段四难度数据、练习跳过规则及本地只读 ECL 的逐行来源。
- 接入后的场景验证应同时观察新阶段首帧、保护结束、血环首次可见与实际首个生成弹体；只检查时钟对象或只把 HUD 提前显示，不能证明节奏正确。
- [`rushboss-phase-rhythm.test.js`](../tests/rushboss-phase-rhythm.test.js)：40组实际首发、真实伤害批次切换、血环恢复、提前击破时聚能退场和 revision6 跨阶段录像。
- [`verify-rushboss-phase-rhythm.mjs`](../tools/verify-rushboss-phase-rhythm.mjs)：9个原生关键帧场景，保留下一非符真实弹幕，检查两个后端的状态和图像一致。

这些检查是源码对照和本引擎行为验证；没有运行原作可执行文件，不构成原作全过程逐像素一致的声明。
