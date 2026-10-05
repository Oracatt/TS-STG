# Boss 击破事件与可组合的后续流程

Boss 的 HP 归零不是“必定死亡”的信号。原作 `enemy_damage.cpp` 的 `phase_script` 先切换脚本，由新脚本决定补血进入下一阶段、保留身体、对话、撤退或爆炸。公共 `TouhouGame` 现在同样先停止该 Boss 的旧 `onUpdate`、移动与接触伤害，保留身体动画，再派发一次事件；不会自动结算、掉落、消弹或反色。

可在 `enterBoss(boss, {onDefeated})` 配置本次遭遇，也可用 `new TouhouGame({onBossDefeated})` 配置全局处理器。回调参数为 `{game, boss, source}`。重复 `enterBoss(boss)` 或 `beginSpell({boss})` 不会重置处理器；`onDefeated:null` 显式关闭全局处理器。没有处理器时，通过 `onEvent('bossdefeated', event)` 通知关卡，并继续保留身体。

```js
// 选择完整的关底击破预设：渐进消弹、结算、掉落、爆炸反色。
game.enterBoss(boss, {
  onDefeated: ({game, boss, source}) => game.beginBossDefeat(boss, {source}),
});

// 另一种编排：先结算并保留身体，交给自己的对话控制器。
let pendingDialogueBoss = null;
game.enterBoss(boss, {
  onDefeated: ({game, boss}) => {
    game.spell.capture(game.context);
    game.stopBossCombat();
    pendingDialogueBoss = boss; // 关卡自己启动、更新对话。
  },
});
// 对话结束后，可选择飞走；也可以继续剧情、直接移除或开启新阶段。
game.beginBossEscape(pendingDialogueBoss, {target: {x:192, y:-32}});

// 同一个 Boss 进入新阶段：新血量、攻击内容由关卡提供。
boss.prepareNormalHealth(3000);
boss.onUpdate = nextAttack;
game.resumeBoss(boss);
game.startBossCombat();
```

上面的三段是不同处理方式的例子，不是必须依次执行的固定流程。回调应同步执行；需要等待帧数、对话结束或其他条件时，在关卡的固定帧更新中编排，或组合公共 `TaskRunner`。不要依赖真实时间定时器。

`holdBoss()` 也可以主动挂起身体；`isBossHeld()` 查询是否挂起；`resumeBoss()` 恢复挂起前的伤害/接触标志，正在爆炸或撤退时返回 `false`。`removeBoss()` 是无特效移除，不结算、不掉落，并取消其未完成的退场预设。`setBoss(null)` 仅解绑 Boss 身份/演出，不等同于恢复或移除身体。普通敌人的死亡流程保持独立。

**兼容性变化**：此前登记 Boss 后会在 HP 归零自动爆炸。现在必须显式选择 `beginBossDefeat()`，上面的第一个处理器可以保留旧行为。

## 静默撤退预设

`TouhouBossEscape` 是独立的移动 owner，不依赖资源。默认移动来自 `default.ecl.txt:22–57`：60 帧、缓动 4（outQuad）、目标 `(-224,-80)`；可自定义 `target`、`duration`、`easing`。它不发出反色、音效或任何战斗结算。

`game.beginBossEscape(boss, options)` 将移动预设与身体生命周期组合：停止该身体的旧攻击、解绑 HUD/法阵/扭曲，继续绘制身体，结束时移除并发出 `bossescape` 事件。结算符卡、清弹、道具、等待时间和对话都由调用方明确安排；它不是全套道中击破脚本。重复调用返回同一个正在进行的 owner；离场前 `removeBoss()` 或销毁场景会取消移动，不再报告成功撤退。

具体原作例子：一面 `st01mbs.ecl.txt:176–211`、二面 `st02mbs.ecl.txt:196–232` 的击破分支会结算、掉落、消弹、生成 script58 碎片，停留 120 帧，再用 60 帧飞到 `(192,-32)`，不生成 script25 反色圈。它们的超时分支、公共 `BossEscapeNoDead`、练习用 `BossEscapeSpell` 的清弹/扭曲时序也不同，不能合并成一种“所有 Boss 撤退规则”。需要这类完整演出时，在关卡组合公共结算、消弹、特效与撤退接口。

`tests/touhou-game-boss-outcome.test.js` 覆盖自定义结局、同帧阶段恢复、取消和重入；`node tools/verify-touhou-boss-outcome.mjs` 用公共资源分别截取持留、飞离、撤退完成和显式爆炸，对比 V8 / QuickJS 状态与图像。这里的源码核对和后端一致性不代表运行了原作程序进行逐像素比对。

## 关底爆炸与渐进消弹预设

`TouhouBossDefeat` 是不依赖图像资源的公共机制。它管理最终击破后的漂移、渐进消弹和爆炸时点；`TouhouBossDeath` 独立管理反色、粒子与震屏的视觉寿命。普通敌人不使用这套 Boss 流程。

默认行为以 `Touhou20Reconstruction/scripts/recovered/ecl/default.ecl.txt` 的 `BossDead2`、`Ecl_EtBreak2_ni` 和一面 `BossDead` 为依据：

| 相对击破帧 | 行为 |
| --- | --- |
| 0 | 消耗一次有种子的随机方向，以 0.4 速度开始漂移；在原击破坐标清除半径 16 内弹幕；播放音效 5。 |
| 1–59 | 固定中心的清弹波每帧增大 6；Boss 位置继续漂移；波面外弹幕继续正常运动。 |
| 60 | 清弹波抵达半径 376；全场补清；停止机制 owner；回调结算、掉落、退场并启动爆炸视觉。 |

圆波由 `TouhouBulletClearWave` 执行，其中心不会跟随移动的 Boss。圆波调用携带 `nearby: true, dropMode: 0, check: true`：普通弹忽略保护并保留自身消除种类，激光遵守保护并按圆形分段消除；清弹不产生道具。最终 `clearAll` 应无条件清除剩余弹幕和激光，同时保留已生成的消除动画。

```js
import { TouhouBossDefeat } from '@ts-stg/thlib/touhou';

const defeat = new TouhouBossDefeat({
  x: boss.x, y: boss.y, rng: gameplayRng,
  cancelCircle: context.cancelNearbyCircle,
  clearAll: () => context.cancelAllProjectiles(),
  sound: (id, x) => audio.request(id, x),
  onMove: position => Object.assign(boss, position),
  onBurst: owner => {
    settleSpell();
    dropBossRewards(owner.position);
    boss.alive = false;
    presentation.beginDeath({ ...owner.position, delayFrames: 0 });
  },
});
// 每个固定模拟帧调用一次；暂停期间不调用。
defeat.update();
```

`cancelCircle` 和 `clearAll` 是必需的宿主适配回调。漂移方向默认由公共 `TouhouRNG` 的 signed-unit 公式采样；调用方可提供自己的同语义 RNG 或显式 `angle`。显式角度不消耗随机数。`delayFrames` 与 `speed` 可配置；`destroy()` 只终止流程，不清弹、不报告击破。

等待期间必须继续更新玩家、已有弹幕和符卡。原作在第 60 帧执行 ECL523，因此不能在击破当帧提前结算或冻结收卡结果；等待期间中弹、使用 Bomb 仍按公共符卡机制影响奖励。

对话属于舞台编排，不能等待 `TouhouBossDeath.alive` 变为 false。一、三、四、六面的 `MainBoss` 脚本均在 Boss 退场后等待 60 帧启动战后对话；反色与粒子可同时继续播放。业务层可选不同对话间隔，公共击破 owner 不包含具体关卡或台词。

源文件定位：`default.ecl.txt:2`、`:239`，`st01bs.ecl.txt:909`；`gameplay/enemy_shot_adapter.cpp:47`、`enemy_spawn.cpp:27`、`enemy_reads.cpp:57`；`card_system/finish.cpp:14`。对话等待见 `st01.ecl.txt:1174`、`st03.ecl.txt:1696`、`st04.ecl.txt:681`、`st06.ecl.txt:423`。
