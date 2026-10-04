# 原作式自机过场生命周期

`TouhouPlayer` 提供普通关卡交接期间的公共生命周期。结算和背景遮罩期间，自机本体都继续更新、响应移动输入并绘制；进入背景遮罩时调用 `finishStageVisibility()`，收起僚机并结束旧 Bomb。应用通过上下文关闭新射击和 Bomb，关卡内容及具体转场时刻仍由应用决定。

```js
// 遮罩开始，调用一次。重复调用不会重新启动退场动画。
player.finishStageVisibility();

// 遮罩期间每个固定帧调用一次；仍提供输入与正常自机上下文。
// 关闭新射击和 Bomb，不再推进旧 Boss、敌弹及关卡脚本。
player.updateStageVisibility(inputMask, transitionContext);

// 放入同一公共绘制队列；应用正常更新、绘制 detached bank roots。
player.drawStageVisibility(queue, view);

// 沿用同一自机实例进入下一关时：
player.resetForStage();
// 随后恢复 player.update(input, context) / player.draw(queue, view)。
```

`updateStageVisibility(inputMask, context)` 与 `drawStageVisibility(draw, view)` 分别委托普通 `update`、`draw`；也可以始终调用普通方法。同一帧只更新一次。应用暂停时也暂停自机更新。

| 接口 | 行为 |
| --- | --- |
| `finishStageVisibility(): this` | 向现存僚机及满火力动画递归发送中断 3，退休当前 Bomb，保留自机本体 VM、坐标和所有资源数值。 |
| `updateStageVisibility(inputMask = 0, context = {}): this` | 正常推进自机移动、计时、本体 ANM、已有自机弹与附属效果，并执行僚机收拢。新射击和 Bomb 的门控由上下文提供。detached roots 仍由应用的银行更新负责。 |
| `drawStageVisibility(draw, view): void` | 正常绘制本体、自机弹和附属动画，包含僚机尚未结束的退场动画。 |
| `restoreStageVisibility(): this` | 退出过场模式，向原僚机 ANM 递归发送中断 2，恢复其原始出现动画。不会清空自机弹。 |
| `resetForStage(): this` | 供遮罩完成后复用同一自机。清除旧自机弹、激光组和判定点，恢复活动状态与源阶段初始化参数，刷新火力表现及位置历史。 |

过场本身不冻结自机，也不隐藏本体。`finishStageVisibility()` 对应原 `entity_flags` 的位 1：僚机以本体当前位置为目标收拢，而非保持原武器阵型；灵梦 `pl00` 的 37/38 号僚机动画、魔理沙 `pl01` 的 32/33 号动画接收中断 3，在 20 帧内按原 mode4 插值收缩至零。收拢计时超过 29 帧后，僚机退出活动状态并接收中断 1，尚存的 ANM 仍可完成尾部。公共方法不会替调用方暂停整个旧关卡；应用应只推进仍需保留的自机和动画，并通过上下文关掉新射击、Bomb 及旧敌人的交互。

`resetForStage()` 保留位置、角色、火力、残机、Bomb 库存、碎片、分数、点值、收取计数、擦弹与死亡记录，也保留 SHT、资源银行和 RNG 的对象身份。它把状态设为 1，自机与焦点计时归零，射击两计时设为 -1、射击门限归零；恢复移动速度、3 单位判定半径、道具收集默认参数及 8 帧决死窗口。与源码一样，它不清除剩余无敌计时和玩家记录中的判定百分比。游戏区边界保持消费者的配置。

应用若选择新建下一关的战斗对象，可在遮罩完成后携带同一局玩家的记录与位置，再释放旧战斗资源；无需在已退休的旧对象上调用 `resetForStage()`。公共自机不决定下一关、创建新 Boss 或持有版本专属内容。

新建对象继承记录时，应先 `setPosition()`，再 `setPower()` 刷新僚机，确保僚机从继承后的坐标生成。公共本体绘制与原 `draw_player` 一样，在提交前写入自机当前坐标；即使本帧刚切换关卡、尚未执行新自机的第一次更新，也不会闪回默认出生位置。绘制不会额外推进模拟帧。

僚机的活动状态只控制其游戏逻辑；仍存活的 ANM 继续更新和绘制。已经收拢 30 帧后单独调用 `restoreStageVisibility()`，原动画仍能消费中断 2；该方法不代替 `resetForStage()` 或 `refreshPower()` 重建活动僚机。死亡与决死状态没有普通移动更新时，僚机 ANM 也仍会各推进一次，完成各自的退场指令。

源码依据：

- `player_entity/stage_reset.cpp`：`finish_stage_visibility` 的僚机中断 3、`restore_stage_visibility` 的中断 2，以及 `reset_for_stage` 的状态与参数重置。
- `player_entity/owner.cpp::clear_shots`：清理现存自机弹，重置射击计时及计数。
- `gameplay/gameplay.cpp` 的 scene 12 保留分支仅禁用 Pause、弹幕控制器和 Replay 的部分回调。这里的枚举名 `Owner::player_primary` 容易误导：`entry_adapter.cpp` 将它映射到 `game_session::primary_owner()`，而 `bullet_system/controller.cpp` 明确由弹幕控制器写入该槽；真正的自机是 `context.objects_04[0]`，其回调没有在这个分支停用。旧版文档据此声称“隐藏自机本体”是错误的。
- `player_entity/initialize.cpp`：自机更新和绘制分别注册在优先级 29 与 30；`initialize_adapter.cpp::draw_player` 不检查上述僚机收拢标志。原反编译 `004f8af0.c` 也只在死亡状态 2 时跳过本体绘制。
- `replay_system/lifecycle.cpp::disable_callbacks` 只停用附加更新和绘制，保留输入更新；`frame.cpp::update_recording` 继续更新玩家输入。因此普通游玩中的换关不是冻结方向输入。原反编译 `00509dd0.c` 同样没有禁用 `update_node`。
- `player_entity/movement.cpp` 与 `option_frame.cpp`：收拢时仍读取方向输入、移动本体，并把僚机目标设为本体位置；计时超过 29 帧才退休僚机。
- `gameplay/entry_adapter.cpp` 的 `fn_00477fd0` 和 `bomb_system/controller.cpp`：遮罩清理会退休旧 Bomb，而非继续造成伤害。
- 原 `pl00.anm` 37/38 和 `pl01.anm` 32/33：保留源出现/收缩动画、纹理及图层。

本页结论来自原作重建源码与对应反编译调用链的交叉核对；没有运行原作可执行文件，也不把普通单元测试视作原作整局逐帧一致性的证明。

## 本轮验证（2026-10-05）

- 全部 713 项 Node 测试通过，无跳过；公共过场测试覆盖本体持续更新与绘制、移动、旧自机弹、僚机收拢/退休/恢复，以及交接首帧绘制坐标。
- `tools/verify-rushboss-stage-flow.mjs` 的六个换关节点分别在 V8、QuickJS 捕获；两后端的快照和 PNG 字节一致。已检查覆盖开始、中途、全黑交接和新关揭幕完成的实际画面，自机持续可见且继承最新位置。
- 报告：`reports/rushboss/stage-player-continuity/report.json`。测试关闭攻击并控制战后对白结束，保留实际公共渲染器与 Rush 背景；不是原作 framebuffer 对比。
- Rush 回放修订号升至 11；旧回放不能沿用错误的过渡期冻结规则继续播放。
