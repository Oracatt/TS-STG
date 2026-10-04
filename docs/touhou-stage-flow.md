# 关卡结算与下一关过渡

普通关卡之间使用 `TouhouStageClear` 和 `TouhouStageTransition`。标题进入游戏的四片斜向遮罩仍属于 `TouhouSceneTransition`；原作正常换关采用背景层的黑色淡入、淡出。

战后对白开始退出后，原 MSG 在下一帧执行指令 21 创建结算页；对白立绘和文本继续执行自身退场。在公共对话里用 `exit:'afterBoss'` 与 `onExitHandoff` 创建 `TouhouStageClear`，无需等待 `onComplete`。

结算 owner 在创建时生成公共 `front:111` 的 STAGE CLEAR 动画，并通过 `onAward(bonus, owner)` 一次性报告奖励。显示第 120 帧起接受新按下的射击或确认键，第 300 帧自动结束；按下结束时立即移除面板，触发 `onDismiss`，再等待 10 帧触发 `onComplete`。构造时传入 `initialMask`，可以防止上一句对白的按键被再次识别为新确认。

```js
const clear = new TouhouStageClear({
  bank: banks.front, font, bonus: stage.clearBonus,
  rows: [{ label: 'Graze', value: player.graze }],
  initialMask: inputMask,
  onAward(points) { addScore(points); },
  onDismiss() { fadeCurrentMusic(2); },
  onComplete() { beginNextStageTransition(); },
});
// 每模拟帧更新，暂停时停止：
clear.update(inputMask);
clear.draw(draw);
```

`bonus` 是业务提供的显示分数，默认 0；`rows` 与 `drawSummary` 可替换结算内容。原作 TH20 的四色魔石等级和专属奖励公式没有进入公共默认规则。STAGE CLEAR 字样保留原 ANM 111 的尺寸、位置和 20 帧等待、20 帧淡入；默认英文奖励行是可替换的通用布局，不声称与专属魔石统计文字一致。只做确定性流程测试时可省略 bank/font。

结算面板显示期间玩家仍可移动，现有自机弹继续更新，但不生成新射击。结算完成后收起僚机、结束旧 Bomb，自机本体继续移动和绘制，在覆盖阶段继续绘制旧背景。公共背景过渡默认前 30 帧升高黑色透明度，完全覆盖时调用 `onCovered`；此时切换关卡、清理临时实体、恢复僚机及阶段状态并启动下一关 BGM。之后 30 帧逐渐揭示新背景，期间新关卡继续更新。

```js
const transition = new TouhouStageTransition({
  onCovered() { activateNextStage(); },
  onComplete() { transitionFinished(); },
});
transition.update();
// queue 为 TouhouRenderQueue。透明层按原优先级 10 进入背景 pass：
transition.draw(queue);
```

这个透明层必须放在玩家、敌人和 HUD 之前。传入 `TouhouRenderQueue` 时自动使用源优先级 10；自机本体的原绘制优先级是 30。直接传 `DrawList` 时由调用方把 `draw()` 放在背景绘制之后、游戏实体之前，并使用自己的背景视口裁剪。不要把它追加在整个应用最后，否则会遮住原作中继续可见的自机、边框与 HUD。

换关应保留分数、残机、Bomb 数量、Power、玩家位置和其他持久会话数据。开始覆盖时结束活跃 Bomb、旧关卡效果与道具；完全覆盖并激活下一关时清除自机弹、敌机弹、激光、道具和旧 Boss，恢复玩家的活动状态与基础碰撞/移动属性。玩家提供 `finishStageVisibility()`、`updateStageVisibility(inputMask, context)`、`drawStageVisibility()` 和 `resetForStage()` 封装僚机退场与恢复，同时保留本体的更新和绘制，见 [自机关卡交接](touhou-player-stage-visibility.md)。覆盖期间应用只推进自机及仍需保留的动画，并通过上下文关闭新射击和 Bomb；无需继续运行旧 Boss、敌弹或关卡脚本。曲目由业务注入；`onDismiss` 对应原作 2 秒 BGM 淡出请求，可使用 `TouhouMusicFade`；`onCovered` 对应下一关音乐启动。公共 owner 不读取文件、不创建关卡、不包含任何作品曲目。

源调用链：

- `hud_system/dialogue_script.cpp:71` 的 MSG 指令 21 创建 StageClear；`st01m0.msg.utf8.txt:165` 在立绘退场后 1 帧执行。
- `stage_clear/update.cpp:14`：创建面板、结算、120/300 帧输入门槛、退出后 10 帧换关。
- `stage_completion/completion.cpp:43`：普通关卡选择 scene 12 并递增关卡；练习、最终关和 Extra 使用自己的结算分支。
- `gameplay/gameplay.cpp:35`：保留旧背景与自机，禁用 Pause、弹幕控制器和 Replay 部分回调，清理旧关卡资源。`Owner::player_primary` 实际映射到弹幕控制器，不是真正自机所在的 `context.objects_04[0]`；旧文档据此推断“禁用玩家更新”有误。
- `player_entity/initialize.cpp:44`、`initialize_adapter.cpp:36`：本体更新与绘制是单独注册的回调，普通关卡交接不禁用它们；`replay_system/lifecycle.cpp:29` 的 disable 也保留用于更新输入的主回调。
- `gameplay/entry_adapter.cpp:66`、`:67`、`:68`：覆盖开始时清空道具、销毁活跃 Bomb owner、清理旧效果。
- `gameplay/activation.cpp:43` 与 `:53`、`gameplay/frame.cpp:27`：背景淡入 30 帧，在第 30 帧激活新关卡并开始新 BGM。
- `stage_background/draw.cpp:36`：新背景使用 30 帧 mode 3 淡出；`screen_effect/lifecycle.cpp:15`、`update.cpp:13` 使用 float32 插值与整数透明度。
- `player_entity/stage_reset.cpp:14`：清理自机弹并恢复临时属性，不重置当前位置。
- `player_entity/shot_controller_frame_adapter.cpp:17`、`shot_controller_frame.cpp:27`：结算期间停发自机弹并保留已有自机弹更新；`movement.cpp:21` 仍读取方向输入。

源程序在游戏计时第 30 帧激活新关卡，新背景绘制回调在自己的计时小于 30 时建立揭幕；两类回调之间可能相差一次调度。公共 owner 使用确定的 30 帧覆盖、30 帧揭幕，并不把原异步加载及多回调边界宣称为逐像素逐帧复刻。磁盘读取耗时不作为模拟帧写入重放；使用方若异步加载资源，应先完成加载再推进固定帧切换。`destroy()` 仅终止 owner，不派发完成事件。
