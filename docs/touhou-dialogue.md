# 公共对话与文本表面

`@ts-stg/thlib/touhou` 的 `TouhouDialogue` 接收业务提供的步骤，管理原始 `front` 对话框、`text20/21` 表面动画、自机淡入与说话状态，以及推进和跳过。它不依赖 RushBoss、具体 Boss 立绘或具体作品的台词。

```js
import {TouhouDialogue} from '@ts-stg/thlib/touhou';
const dialogue = new TouhouDialogue({
  resources, character: 0, codePage: 936,
  steps: [
    {speaker: 'left', text: '对话文本', coldFrames: 30, autoFrames: 500,
     portraits: {left: {present: true, emotion: 'NOTICE'}}},
    {speaker: 'right', text: '另一位角色的回复', coldFrames: 2},
    {terminal: true},
  ],
  speakerNames: {right: '角色名字'},
  onComplete() { /* 在应用下一次更新中切换场景 */ },
});
// 每帧一次：dialogue.update(inputMask); dialogue.draw(draw, view);
// 离开场景：dialogue.dispose();
```

框的 `270 + type` 根脚本和 `166 + type` 中段沿用原始缩放变量、8 帧展开、5 帧退场；文字沿用 `text20` 的 8 帧透明度和 9 帧横向展开。默认整行出现，符合该源实现；`charsPerFrame` 可额外启用逐字显示。字节宽度经过注入的编码器，换行不拆开汉字。公共默认 CP932，简体中文业务明确使用 CP936，并使用对应 GDI 字符集。`resources.writeAnimationText` 提供原始左对齐、font4、描边半径倍率与纹理局部上传；既有符卡居中字图接口仍保持原样。

位置参数 `x/y` 是原作消息指令 28 将 MSG 坐标乘 2 后的 ANM 坐标。默认取 `st01m0` 的左 `(116,240)`、右 `(360,240)`，因此框根的原始参数为 `(232,480)`、`(720,480)`；可注入逐句位置与 `boxStyle`。整段对白是全屏 UI，不继承游戏区的 `x/y` 偏移。`draw(draw, {x:336,y:24,scale:1.5,screenScale:1})` 会使用 `{x:0,y:0,scale:1,screenScale:1.5}` 绘制，对应 640×480 源屏幕放大到 960×720。

原始身体 PNG 把魔石直接画进角色和手部，不能通过停掉另一个 ANM 节点去除。导入器保留真正的身体脚本 `pl00:62`、`pl01:73`，把四种石头身体 sprite 统一换成无魔石原画的 UV 裁片；干净 PNG 原样复制，裁片用单一倍率还原源身体画框，不拉伸图像。原始独立表情脚本 `64/75`、18 张表情图、表情覆盖位置、淡入、明暗、说话与退出动作全部保留。`manifest.transformations` 记录原身体/干净图哈希、UV 映射与差异；`tools/import-touhou-common-assets.mjs --check` 可核对重新导入的一致性。这个换肤仍存在原画差异，尤其魔理沙从握石改为张手，不能宣称原作身体像素完全一致。没有公共 Boss 图像时，默认在对话框显示调用方提供的名字。

`TOUHOU_DIALOGUE_PORTRAITS` 记录经过源 ANM 模式 2（位置与尺寸乘 0.5）后的全屏坐标：灵梦身体 249×349，初始 `(-48,138)`、不说话 `(-32,138)`、说话 `(0,130)`；魔理沙身体 309×389，相应为 `(-48,98)`、`(-32,98)`、`(0,90)`。`pl00:64` 的头像保持相对身体 `(36,15.5)`，`pl01:75` 为 `(23.5,62)`。说话/不说话切换使用原 15 帧插值与颜色，进场淡入 15 帧，退出 30 帧；身体和头像分别参加原层 35/36 的排序。

`TouhouDialogue` 创建并持有独立的 `front`、`text` 和自机 bank，避免与游戏或另一段对话共享可变文本表面。上层每帧只调用一次 `update(mask)` 和 `draw(draw, view)`，退出时调用 `dispose()`；它不释放传入的 `resources`。`complete` 标记完成，`snapshot()` 提供当前页、冷却与行文字。完成回调与步骤事件同步执行，应用应记录场景切换请求，在当前更新结束后执行清理。

`drawPortrait(draw, step, dialogue, view)` 接收全屏视图。返回 `false` 保留公共自机身体与独立表情树，返回 `void` 替换它。业务右侧图像可以读 `dialogue.portraitState('right')` 的源坐标、颜色、透明度及层，再注入自己的身体/表情素材；只负责绘制，不推进动画。右侧通用运动来自 `st01enm:12/10` 的演出规则：220×360 画框，初始 `(296,128)`、不说话 `(280,128)`、说话 `(248,120)`；具体 Boss 身份和图像不进入 thlib。私有图像应保持原始宽高比，源对白立绘可超出游戏区，仍受屏幕边界限制。

`playerPortrait: {x,y,height}` 可调整公共自机的布局；`x/y` 是说话状态下身体在 640×480 源屏幕上的左上锚点，默认灵梦 `{x:0,y:130,height:349}`，魔理沙 `{x:0,y:90,height:389}`。自定义高度时，身体、独立表情、入退场和说话位移统一缩放；颜色、透明度与时间线不变。Demo 默认使用源参数，旧的 `{-280,172,260}` 手动缩小布局已移除。

每个步骤可设置 `coldFrames`、`autoFrames`、`terminal` 和有序的 `events`。`onEvent(event, step, dialogue)` 接收这些事件，具体出现哪个敌人、播放什么音乐由业务处理。`startDelayFrames` 控制整段开始等待；默认确认键为 `Keys.SHOOT | Keys.CONFIRM`，跳过键为 `Keys.FOCUS`。`skipMask` 与 `skipHoldFrames` 可以改写跳过策略，公共默认长按 20 帧。逐字模式中，第一次推进补全当前页文字，下一次才换页。默认每页最多两行，可通过 `maxLineBytes` 控制编码后的换行宽度。

战后对话可使用 `entrance: 'afterBoss'`。公共预置 `TOUHOU_DIALOGUE_ENTRANCE_PRESETS.afterBoss` 来自 `st01m0`、`st03m0`、`st04m0.msg` 的 `entry 1`：第 0 帧创建立绘并开始原 ANM 淡入，第 4 帧进入说话状态，第 34 帧创建首句与对话框，第 38 帧允许推进。立绘使用自己的 15 帧淡入，文字使用原 8 帧淡入；这些动画持续运行，不是在首句出现前冻结画面。MSG 对象本身的时钟由 `hud_system/dialogue_constructor.cpp:27–28` 置零，`dialogue_script.cpp:42–68` 执行这些定时命令，没有额外的 50 帧空等。

```js
const dialogue = new TouhouDialogue({
  resources, steps, entrance: 'afterBoss',
  onEvent(event, step, owner) { /* 事件仍只执行一次 */ },
});
// 可自定义时序；四项必须是非负、非递减的整数，可以相等。
// entrance: {portraitFrame: 0, speakerFrame: 4, textFrame: 34, inputFrame: 38}
```

入口配置仅作用于第一步，以 `inputFrame` 接管第一步的 `coldFrames`，因此不会在第 38 帧之后再叠加业务冷却。之后步骤和自动推进时长仍使用调用方的数据。第一步的 `portrait`、`emotion` 事件随立绘阶段执行，`active` 随说话阶段执行，`text` 及其他事件随文字阶段执行；同一阶段保持原事件顺序。自定义事件可声明 `entranceStage: 'portraits' | 'speaker' | 'text'`，选择需要的阶段。载荷与回调参数保持原样。没有步骤时立即完成，不凭空播放入口。`snapshot().entrance` 提供 `frame`、`portraits`、`speaker`、`text`、`inputReady`；没有入口配置时，不增加该字段。

默认 `entrance: null` 继续即时显示，兼容原有调用。显式设置的 `startDelayFrames` 是入口时序开始前的附加等待，不会由预置自动移除。竖屏 Demo 在战后明确使用 `entrance: 'afterBoss', startDelayFrames: 0`，保留 Rush 的台词、人物与表情，替换其额外的 50 帧开场等待；历史宽屏调用与导入数据仍保留旧时序。战前调用也不受这项可选预置影响。

退场也由公共对话持有。`exit: 'beforeBoss'` 对应原作战前 MSG：最后一句推进后，同帧向双方立绘身体、独立表情和根动画递归发送 interrupt 1，随后等待 30 帧再调用 `onComplete`。这 30 帧内 `active`、`alive` 为真，`exiting` 为真；继续调用 `update()` 和 `draw()`，立绘按原 ANM 滑出、变暗和淡出，确认键和跳过键不能提前结束尾动画。剧情步骤中的终止事件仍在退场开始时按原顺序执行一次，不会因延迟完成而重放。

`exit: 'afterBoss'` 对应战后 MSG：同样开始退场，在第 1 帧调用 `onExitHandoff(dialogue)`，第 31 帧才调用 `onComplete`。原作这两个时点分别是 MSG21 创建 Stage Clear 场景和 MSG0 结束对话对象，因此结算画面可以与仍在退场的立绘共存。`onExitHandoff` 应启动下一项演出并继续持有对话，不能直接 `dispose()` 或冻结对话更新。公共预置不创建具体结算页、不切换业务关卡。

```js
const dialogue = new TouhouDialogue({
  resources, steps,
  entrance: 'afterBoss', exit: 'afterBoss',
  onExitHandoff() { stageClear.begin(); }, // 对话退场第 1 帧
  onComplete() { dialogueDone = true; },  // 第 31 帧才可释放这段对话
});
// 自定义交接和完成时点：
// exit: {handoffFrame: 5, completeFrame: 40}
```

`TOUHOU_DIALOGUE_EXIT_PRESETS` 保存上述两套时序；`TouhouDialogueExitTiming` 接受非负整数 `completeFrame` 和可选 `handoffFrame`，交接不能晚于完成。`snapshot().exit` 提供 `frame`、`handedOff`。未设置 `exit` 时保持旧的即时完成行为；空对白直接完成，不产生假的退场或交接。`finish()` 主动发起配置的退场，也可中断尚未结束的入口；入口里尚未执行的说话和文字事件随之取消。`dispose()` 则用于立即放弃并释放资源，不触发尚未到达的交接或完成回调。

具体依据是 `st01m0.msg`：战前在 @192 执行 4/5/6/10，@222 执行 0；战后在 @86 执行同一组退场指令，@87 执行 21，@117 执行 0。`hud_system/dialogue_script.cpp` 的 4/5 使用待执行的递归 interrupt 1，`enemy_opcode_state.cpp` 的 519 等待对话对象退出。`pl00:62/64`、`pl01:73/75` 与通用右侧立绘使用 30 帧位移/透明度和 20 帧变暗。`dialogue_text.cpp::clear_dialogue_text(false)` 将四个字图表面写为空白，再发送 text20/21 的 8 帧退出，并请求删除气泡树；这条 MSG 路径没有请求气泡本身的 5 帧可选淡出。公共退场按该调用关系实现，没有额外套一层全屏淡黑。`tests/touhou-dialogue-exit.test.js` 对双方立绘及文字退出动画逐帧与源 ANM 比较。

`wrapTouhouDialogue(text, encode, {codePage:936,maxBytes:40})` 也可单独使用。`encode` 必须返回对应代码页的 `Uint8Array`；系统字体与纹理服务由宿主注入，库不会读取原生全局。

```js
const bank = resources.createBank('text');
const vm = bank.create(20);
resources.writeAnimationText(vm, '业务文字', {
  font: 4, codePage: 936, align: 'left', outline: true, outlineScale: 0.6
});
// 应用持有这个 bank，负责 update、draw 和退出时 dispose。
```

`TouhouTextRenderer` 可用于独立的自定义 bank：传入 `{host,bank}` 后使用 `writeAnimationText` 或 `createNameAnimation`。虚拟机必须属于该 renderer 的 bank；左右对齐仅支持 `left` 和 `center`。传入 `createNameAnimation(name,{codePage:936})` 则保留符卡名原有居中、描边和动画流程。

源代码仓库提供 `tools/verify-touhou-text.mjs` 的 12 组真实 GDI 字图比较，以及公共 ANM 的创建、更新和绘制审计。这些验证针对源字图与动画实现；业务对话内容、局部布局和头像换肤仍需应用单独验证。工具和具体游戏剧情不属于 SDK 发布文件。
