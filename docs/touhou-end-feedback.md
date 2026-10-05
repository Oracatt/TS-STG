# 通用死亡与结算反馈

这些实现属于 `@ts-stg/thlib/touhou`，不依赖 RushBoss 的角色、关卡或图片。资源取自本机 TH20 重建数据；这里的源码对应关系与验收不表示已经运行原版程序逐像素比对。

## Boss 死亡

`TouhouBossDeath` / `TouhouBossPresentation.beginDeath()` 默认采用源 `default.ecl` 的 BossDead 流程：死亡开始请求音效5，等待60帧，再创建 `effect:25` 和 `effect:57`、请求音效5并触发30帧震动。

- 25是自机死亡 `effect:21` 使用的同一反色动画：原 ANM 的0、5、25帧生成时序、缩放和淡出保留，layer21 对应绘制优先级50。混合因子是 `oneMinusDstColor / oneMinusSrcColor`，不是覆盖一张白色闪光图。
- 57保留原120个散射粒子。动画根最长存活192帧，不跟着 Boss 对象销毁。
- 音效5是 `se_enep01.wav`。`TouhouScreenShake` 保留原 mode1 的独立双轴随机方向、30帧线性12→0幅度；合成器接收 `cameraOffset`，右侧固定 HUD 不震动。
- 普通敌人仍使用自己的死亡脚本和音效。`TouhouGame` 对 `enterBoss()` 登记的 Boss 只派发一次击破事件并保留身体，由 `onDefeated` / `onBossDefeated` 回调选择后续。只有显式调用爆炸预设才生成反色；也可撤退、接对话、继续阶段或执行自定义编排，见 [Boss 击破事件](touhou-boss-defeat.md)。

```js
// 默认包含60帧等待；业务在爆发时移除自己的 Boss。
presentation.beginDeath({
  follow: boss,
  onBurst() { boss.alive = false; }
});

// 每帧仍调用 presentation.update() 和 presentation.draw(queue)。
compositor.draw(draw, queue, {
  cameraOffset: presentation.cameraOffset,
  drawBackground,
  drawDistortion
});
```

若业务已经完成死亡等待，可传 `delayFrames: 0`。Rush Demo保留原阶段的60帧等待，在终点调用此方式，因此不会重复等待；中间符卡结束不触发死亡。结算和后续对话等待 `hasDeathEffects` 与 HUD 提示完成，期间仍可移动和收取掉落物。

## 收卡、失败与残机

`TouhouHud.notice(type, value, {spell})` 使用原有两组独立提示槽，保留源脚本的覆盖和销毁行为。`TouhouGame` 已自动接线；自定义应用需将符卡/道具上下文的 `hudNotice` 接到自己的 HUD。

| 事件 | 原动画 | 音效规则 |
| --- | --- | --- |
| 符卡收取 | `front:49`，`ascii_960:4..13`奖励数字和分隔符，`front:84`用时标签 | 46，`se_cardget.wav` |
| 符卡失败结算 | `front:50`，`front:84`用时标签 | 普通符卡超时播放69，`se_fault.wav`；失误后击破不额外播放此声音 |
| 残机增加 | `front:53` Extend | 17，`se_extend.wav`，另保留道具拾取音37 |

失误/使用 Bomb 使符卡失去收取资格，不会立刻结束符卡或弹出结束提示。残机道具和第三个残机碎片都经过公共 `TouhouItems`；满残机时拾取完整残机仍保留原作的音效和提示。收卡和残机提示可同时存在。

创建 HUD 时传入 `textBank: banks.ascii_960` 才能显示原奖励数字。`value` 是显示分数，不是 HUD 内部的十分之一记分单位。向 `TouhouApplication` 传入 `clock: () => seconds` 后，应用会在每次 update 完成时自动提交 `postFrame`；直接使用游戏对象的消费者也可显式调用 `postFrame(seconds)`。用时提示分别显示模拟帧时间和原编码的实际用时；无有效时钟数据时保留原999.99哨兵值。两个原生 Demo 入口已注入实际时钟，Rush 回放保存并读取录制时的编码用时，不使用观看回放时的计时结果。

失败标题与用时面板的组合有一处明确的可读性修正：源 `front:50` 将64单位高的标题以中心锚点放在 `y=256`，`front:84` 则以顶部锚点从同一个 `y=256` 开始；直接组合时两张四边形重叠半个标题高度。原 `notifications.cpp` 以及反编译 `004b90e0.c` 都没有给失败标题添加偏移，因此不能把此重叠归因于遗漏某个原参数，也不宣称已验证原版实际画面。公共 HUD 将失败标题实例上移自身高度的一半（32个 ANM 单位，在960窗口为24像素），使标题底边与时间标签顶边相接。导入的 ANM 和纹理、透明度时间线、成功标题、奖励数字以及 `draw.cpp` 的用时数字 `(224,144)` / `(224,160)` 均保留。此修正在 thlib 内统一生效，业务不需要调整 UI 坐标。

## UI 图集采样边缘

成功、失败标题左边的细黑线是相邻图块串色：源 `front` 图集0中 sprite39 为 `(512,192,512,64)`，sprite40 为 `(512,772,320,64)`；它们左侧 `x=511` 的64行全为不透明 HUD 框，而自身左边缘透明。线性采样读到左邻像素时会引入这条线。不能用去除所有黑色像素来修复，否则会损坏原文字描边。

公共素材导入器统一重排 `front`、`ascii_960`、`title` 的1066个静态 UI 精灵（34张图集），而非仅修正两个提示。每个原矩形的完整 RGBA 原样复制；普通四边形四周留两像素自身边缘延展，透明边缘保持透明，不再接触其他图块。精灵 ID、尺寸、锚点、缩放、旋转、ANM 字节码与时间线不变，只重映射纹理坐标和纹理尺寸。暂停、菜单、对话框、数字和字体共享这条管线。

循环纹理必须保留循环轴的完整周期，不能统一做四边留白。`front` 图集7/9是原本横向循环的32像素宽条带，保留完整宽度及横向循环，只隔离纵向边缘。导入器还检查 ANM `600/601/602` 程序生成圆环所依赖的纹理：血环 `front/lifebar` 的 V 坐标以整张纹理高度为周期，因此保留源高度32、`y:0` 和 `paddingY:0`。环条的 X 方向留两像素，复制源纹理按 wrap 规则取得的相邻像素，并记录 `edgeSampling:'source'`，不使用自身边缘延展：例如 sprite183 的右邻 `x=8` 含 alpha71 的红色，参与原来的线性采样。普通 UI 和分段标记仍延展自身边缘，sprite185 继续采用 `paddingY:2`。此前把这张32×32纹理扩成32×64会让半个周期采到空白，即使 HUD 比例为1也会缺半圈。修复在素材导入层保留正确周期与源边缘采样，不改变通用渲染器或原作重复 UV 的语义。动态文字和捕获画面不重排；未经审计的 UV 滚动/循环用法仍须审计后才能导入。

`manifest.transformations` 和每张纹理的 `spriteMappings` 保存原矩形、新坐标、留边、源/输出哈希与相邻像素审计。初次重排的扫描记录有634个精灵存在不透明外邻像素差异（front88、ascii532、title14）；这是旧扫描的**潜在边缘采样差异**，不能称为634处可见缺陷，也不能代替后续导入的当前统计。测试逐行对照全部原图 RGBA 与自身留边，另验证提示左邻透明、循环条带正反向四周期和动画几何。源素材不写入、不生成或重画任何图像。

初次重排时，`tools/verify-touhou-ui-atlas.mjs` 使用实际引擎分别在 V8 与 QuickJS 下运行 UI、字体、循环条带三个场景；对应 PNG 哈希一致，并已人工检查图像。历史结果见 `reports/touhou-ui-atlas/native-report.json`，不包含此次血环周期修复的验收。这些检查覆盖本引擎的渲染结果，不等同于原版程序逐像素验收。该次重排统计的所有 UI 纹理同时加载理论 RGBA 容量由约37.00 MiB增至68.51 MiB；纹理按需加载，公共纹理总数90张，当前尺寸和容量以最新导入清单为准。

## 源证据与验收入口

原工程只读参考：`default.ecl` / 各关 `BossDead`、`effect.anm`、`screen_effect/{update,environment}.cpp`、`hud_system/notifications.cpp:12`、`hud_system/draw.cpp:39`、`item_system/rewards.cpp:57`、`item_system/frame.cpp`、`card_system/finish.cpp:21`。

完整死亡源路径和相机分类见 [Boss死亡源码审计](touhou-boss-death.md)。公共行为测试见 `tests/touhou-hud-notices.test.js`、`tests/touhou-application-clock.test.js` 和死亡相关测试；其中提示布局逐帧检查0至170帧的成功/失败标题、奖励数字和两行时间的边界，同时锁定源内部坐标和时间线。Demo连接、实际时间与回放测试见 `tests/rushboss-end-feedback.test.js`。`tools/verify-rushboss-end-feedback.mjs` 使用实际引擎、原资源和静音的真实音效加载/播放，逐场检查提示、反色像素、普通敌人对照及动画尾部，并比较 V8/QuickJS。
