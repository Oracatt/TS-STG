# 回放播放控制

`ReplayPlaybackController` 是不依赖原生宿主、Node 或浏览器的 thlib 公共组件。
默认按住 `Keys.FAST_FORWARD`（原生宿主的左右 Ctrl）时，每次宿主更新运行 8 个完整模拟帧；
松开立即恢复 1 帧。这参考本地 TH20 `frame.cpp` 的 8 次更新调度，未宣称所有东方作品倍率相同。
它不增大 `dt`、跳过录制帧或合并模拟更新。Shift 仍为 `Keys.FOCUS`，默认不控制播放速度。

```ts
import { Keys, ReplayPlaybackController } from '@ts-stg/thlib';

const playbackControl = new ReplayPlaybackController();
// 可指定不同播放按键及正整数倍率：
// new ReplayPlaybackController({ fastForwardMask: Keys.FOCUS, fastForwardSteps: 2 });

function updateReplay(liveMask: number): void {
  const scene = app.scene;
  const page = app.page;
  playbackControl.update(liveMask, () => scene.updateReplay(), {
    paused: scene.paused,
    shouldContinue: () => app.scene === scene && app.page === page &&
      !scene.paused && !scene.replayDone,
  });
}
```

`scene.updateReplay()` 必须从 `ReplayPlayer.next()` 取得录制输入，独立完成一个模拟帧及其检查点校验。
控制器只使用当前真实按键决定执行次数；不得把 `liveMask` 传给录制模拟。
普通游戏与菜单不调用此播放循环，保持通常的更新时钟。渲染在批次结束后运行一次。

`update(liveMask, step, { paused?, shouldContinue? })` 返回已执行帧数。
暂停时返回 0，不调用 `step` 或 `shouldContinue`。
`shouldContinue` 在每个子帧前重新检查；场景替换、退出、暂停或播放结束后停止剩余子帧。
如果单帧内可能暂停，回调还应检查当前暂停状态。
更新或生命周期回调抛出的异常立即传播，当前批次不再消费输入。

结束检查应以消费者完成通知后的 `replayDone` / 已移除的 playback owner 为准，
不要仅以 `ReplayPlayer.finished` 为准：播放最后一条录制输入后，通常还需执行一次
`next() === null` 分支，才会显示回放结束页。这样可只触发一次结束通知，
也不会让快进批次的剩余子帧推进新页面。

`Keys.FAST_FORWARD = 2048` 是实时播放控制位，其他输入位值不变。
`ReplayRecorder.record()` 排除这一位，`ReplayPlayer` 继续拒绝包含它或其他未知位的版本 1 输入。
普通游戏更新也应在构造模拟输入前剔除实时播放位，例如
`simulationMask = liveMask & ~Keys.FAST_FORWARD`，避免消费者的输入快照受按住 Ctrl 影响。
回放格式、物理更新及录制帧时间没有变化，因此这一播放功能无需修改格式或游戏机制版本。

嵌入的弹幕 ANM 位置、朝向和缩放由 `TouhouBulletField` 的更新、生成、换型及取消逻辑同步，
绘制不写回这些 owner 字段。模拟快照及下一帧 ANM 更新因此不依赖渲染次数。
激光的主体、端点、源点 ANM，以及道具的主体和屏外箭头也在模拟时钟同步，
保证后续生成的独立 ANM 子特效不依赖上一次是否绘制。
这项修复改变了早期实现中包含上一渲染帧位置的快照；使用该旧快照校验的游戏应增加自己的
`replayVersion`，保留旧录像及其原修订标记，避免把不同确定性快照语义冒充同一版本。

`TouhouSpell({playback: true, records, fallbackRecords})` 会复制传入的历史记录，
并在这份私有副本上更新挑战次数和收取次数，供回放 HUD 使用。游戏应把录制开始时的记录
存入录像配置，再传给回放实例；不要传入播放当天的新成绩，也不要另行手动增加计数。
普通游戏仍直接更新调用方提供的记录。回放不会修改传入的存档记录，绘制 HUD 也不会创建记录。
