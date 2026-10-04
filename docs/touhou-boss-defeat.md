# Boss 击破与渐进消弹

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
