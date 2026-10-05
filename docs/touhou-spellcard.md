# 公共符卡文档与时间轴

从 `@ts-stg/thlib/touhou`（也支持根入口、`/touhou/spellcard` 子路径）导入：

| 接口 | 用途 |
| --- | --- |
| `createTouhouSpellCard()` | 返回一份可编辑的默认文档 |
| `validateTouhouSpellCard(value)` | 严格校验并返回独立的规范化副本 |
| `parseTouhouSpellCard(text)` | JSON 文本解析与校验 |
| `serializeTouhouSpellCard(value)` | 校验并生成 JSON 文本 |
| `new TouhouSpellCardTimeline(document, context)` | 固定帧执行器，调用已有游戏 owner |

文档格式为 `ts-stg-spellcard`，版本为 `1`；包含 `id/name/duration/hp/seed/boss/events`。完整类型位于 `src/touhou/spellcard.d.ts`。支持弹幕发射、直线/无限激光、Boss 移动、聚能/释放、音效、消弹六种事件。这个数据接口不执行任意代码或表达式；用户可以在普通 JavaScript 模块中组合时间轴、编写额外逻辑并直接调用公共游戏接口。

时间为 60 Hz 整数帧，角度为弧度。发射窗口为 `[frame, frame+duration)`，`rotation` 是每次发射增加的角度；`charge.releaseFrame` 是从事件开始计算的释放延迟。`origin:'boss'` 每次取 Boss 当时位置并加偏移，`origin:'world'` 为绝对坐标。同帧按文档数组顺序执行；重叠的启用移动事件会被拒绝。随机源由文档的 uint32 `seed` 独立确定。

```js
import {parseTouhouSpellCard, TouhouSpellCardTimeline} from '@ts-stg/thlib/touhou';

const card = parseTouhouSpellCard(host.readText('spells/example.spellcard.json'));
// game/boss 已由当前游戏阶段创建，通常以 card.hp、card.boss 初始化。
game.beginSpell({id: 0, name: card.name, duration: card.duration, boss});
const timeline = new TouhouSpellCardTimeline(card, {
  boss, player: game.player, bullets: game.bullets, lasers: game.lasers,
  presentation: game.bossPresentation, sound: game.context.sound,
  clear() {
    for (const b of game.bullets.bullets) game.bullets.cancel(b, 0);
    for (const l of game.lasers.lasers) game.lasers.erase(l);
  },
});
// 在阶段 update 中，每逻辑帧一次：
timeline.update();
// 离开阶段或提前击破时：
timeline.stop();
```

构造时间轴不会移动传入的 Boss。第一次 `update()` 执行第 0 帧并递增 `frame`，游戏仍负责更新弹幕、激光和演出实体，不要重复更新它们。达到文档时长后 `completed` 为 true、`alive` 为 false；`stop()` 的提前停止不会伪装为自然完成。`snapshot()` 返回文档 ID、当前帧和这两个状态。

`stop()` 只停止此时间轴后续工作及所属聚能，不负责全屏消弹、符卡结算、掉落、爆炸、逃离或下一阶段。自然完成也不删除已发出的弹幕及动画尾部。游戏应使用公共阶段流程、符卡和 Boss 机制组合这些行为。文档所需的 context 适配器缺失时，时间轴在事件处明确报错并停止。

校验拒绝未知版本/字段/事件、非法数值、重复 ID、越界帧、过量发射。限制为 36,000 帧、256 事件、单次 2,048 发、单帧总计 8,192 发；同时存活上限仍由使用方弹幕池配置决定。

可选的 SpellCardEditor 是独立的 JS 源码编辑与原生预览工具，已移除事件编排和可视化回写。模块导出 `spellCard` 元数据与 `createSpell(context)`；新建模板直接编写固定帧 JS 发弹逻辑，使用方也可以主动组合本页的公共时间轴。直接导入保存的 JavaScript 不需要 Node、Electron 或编辑器代码。编辑器不包含在默认 SDK 中；本页的公共数据 API 与旧 JSON 导入继续保留，与编辑器界面无关。
