# 原作通用 Boss 演出预置体

公共入口是 `@ts-stg/thlib/touhou` 的 `TouhouBossPresentation`。`TouhouGame` 的 `bossPresentation` 使用同一类，`enterBoss`、`setBoss` 与 `beginSpell` 自动接入它。具体 Boss 图像、攻击脚本、立绘和符卡背景由应用提供。

预置体采用 `Touhou20Reconstruction` 的公共机制和原始 ANM。它没有采用 TouhouRushBoss 的 HLSL 扭曲、512 段圆环、120 条带或宋体标题。

| 内容 | 原作来源 | 公共实现 |
| --- | --- | --- |
| Boss 出场法阵与红色气场 | `st01bs` 至 `st07bs` 中重复的 `effect` 99、108 | 原始三维法阵 ANM 和完整子粒子树，随 Boss 移动 |
| 道中 Boss 配置 | 道中 Boss 公共出场配置 `effect` 99 | `profile: 'midboss'` |
| 背景扭曲 | `enemy_shot_adapter.cpp` 分配、`enemy_mesh.cpp` 更新 | 17×17 网格，初始半径 16，每帧增长 2；Boss 半径 160、颜色 `0xf00f80`，道中半径 128、颜色 `0x8080ff` |
| 开卡双圈 | `card_system/start.cpp`，`effect` 6 → 4、5 | 两个原始 32 段圆环；保留 UV、旋转、插值、80 帧前奏和按符卡时长收缩 |
| SpellCardAttack | `effect` 13 → 7–12 | 原作的 10 条斜带与 4 个环形条带，140 帧生命周期 |
| 血条、分段标记、指示器 | `hud_system/update.cpp`，`front` 100、374–377 | 血条每帧按 binary32 的 0.025 填充，保留距离淡化和阶段标记 |
| 倒计时 | `ascii_960` 2、3、239–248 与原字体 | 百分秒、符卡/非符卡状态切换、低时间闪烁和警告音 |
| 符卡名和 Bonus/History | `text` 22/23、`ascii_960` 0/1、原作位图文字流程 | 注入 `banks.text.environment.createNameAnimation`，使用公共资源适配器；标题动画不在 Demo 中重写 |

```js
import { TouhouBossPresentation } from '@ts-stg/thlib/touhou';

const presentation = new TouhouBossPresentation({ banks, player, font });
presentation.enter(boss);
presentation.setEffects({ aura: true, distortion: true });
presentation.beginSpell({ boss, id: 1, name: '霊符「夢想封印」', duration: 1800 });

// 每个模拟帧一次；paused: true 保持全部动画和随机数不变。
presentation.update({ remainingFrames: 1799 });

// 背景先绘入调用方拥有的 renderTarget；先绘制未变形的背景，再叠加扭曲。
presentation.drawDistortion(draw, renderTarget);
presentation.draw(renderQueue); // 与自机/敌机一起按原始 ANM 优先级排序。
```

默认逻辑坐标为 `x: -192..192, y: 0..448`，960×720 输出下游戏视图原点 `(336,24)`、比例 `1.5`。`view`、`screenView`、`distortion` 的视图偏移以及 `auraView` 均可配置。三维法阵保留原作 416×480 投影相机，再映射至指定游戏视口，使其中心跟随同一 Boss；不会直接固定在整个窗口中心。

嵌入已有游戏时，`spellState` 可以同步应用自己的 Bonus、收取状态、经过帧数和记录，`remainingFrames` 控制计时显示。预置体不选择攻击、不改变 Boss HP、不推进应用的符卡列表。已有 `TouhouSpell` 和 `TouhouBossHud` 可以作为 `spell`、`hud` 传入，默认由外层更新；`TouhouGame` 通过这个方式避免一帧执行两次。

`setEffects({aura,distortion})` 独立开关法阵和背景扭曲，省略的字段保持当前状态。`startCombat/stopCombat`、入场、开卡和收卡均不覆盖它们；重复开启保留同一动画和扭曲时钟。游戏可在飞入时开启，破卡后保留到飞离结束，或显式提前关闭。新绑定 Boss 默认关闭效果，`clearBoss/destroy` 会释放效果。

`finishSpell` 保留原退出动画。前后两张符卡连续开始时，上一张标题继续执行退出动画直至原脚本自行销毁。`destroy` 只销毁预置体拥有的动画，不销毁共享 bank，也不清除自机/Bomb 的动画。

符卡标题及 Bonus/History 标签属于原作 layer32，由 `dispatch.cpp` 选择 viewport5；`pool_platform.cpp`、`platform_window/viewports.cpp` 和 `quad.cpp` 将场地中心/顶边偏移加到最终顶点。公共实现仅对这些 info ANM 加偏移，原作 layer30 倒计时和单独绘制的数值保持全屏坐标。可用 `spellOptions.presentation.infoView` 明确覆盖这个映射。

同属 layer32 的动画保留原作注册顺序：`ascii_960` 0 的符卡名底板、`text` 22 的文字、`ascii_960` 1 的 Bonus/History 底板。`spellContext.createNameAnimation` 每次调用必须新建一个 ANM 实例，不能返回先前注册的实例；可缓存字图像素，公共 `TouhouTextRenderer` 正是缓存字图后为每张符卡新建标题动画。只调整 `info` 数组顺序不会改变跨 bank 的注册顺序。

`spellOptions.viewIndex` 是原作 `card_system/lifecycle.cpp` 的游戏会话视口编号，**不是自机编号**。单场地游戏中，灵梦、魔理沙都应保持默认 `0`，由 `card_system/start.cpp` 的 `22 + view_index` 选中 `text:22`。中文只需在名字工厂传 `codePage:936`，不要据自机改脚本或另画固定位置文字。`text:23` 在当前原始表中是 layer34 的静态模板，不能作为魔理沙的符卡标题皮肤。

`text:22` 的原始标题表面为 768×40，右上锚点；raw 位置从 `(384,768)` 移到 `(384,0)`，其缩放在30帧内从4收至1，60帧开始上移。花纹底板从 `(384,784)` 移到 `(384,16)`，缩放在60帧内从2收至1；这两个原始轨迹并非每帧完全相同。两者使用同一 `infoView` 和 layer32 队列，保留进入时的缩放/位移、稳定后的16 raw单位差与退出动画；无需延迟名字到右上角才显示。队列统一负责游戏区域裁切，不应给标题单独加不同的屏幕坐标或裁切矩形。

Bonus/History 数值继承 `text_renderer/text.cpp` 构造器的 `align_x=1,align_y=1`（左/上对齐）；`card_system/draw.cpp` 只切换字体和绘制层。默认坐标 `(266,37)`、`(360,37)` 是数值起点，不是右边界；这样数字接在标签后面，失败时的 `$` 同样遵循左对齐。


攻击聚能使用 `presentation.beginCharge({x,y,color:'green',releaseColor:'yellow'})`，默认 effect72 收缩圈/62 汇聚粒子，60 帧后接 effect89 扩张圈/77 释放粒子；七种颜色保留原64..76和79..91脚本。每个动画出生时采样位置，已出生的粒子不会被移动中的Boss拖动。可配置 `repeatCount`、`repeatInterval`、`releaseFrame`、`release` 和后续出生点 `follow`；`stop()` 停止后续出生，`destroy()` 立即释放全部动画。Rush仅提供24帧重复间隔和其释放时间。此前误用的 effect151..192 / opcode508 EffChargePoint属于另一类入场效果，已经从攻击聚能路径移除。


验证包含原始未筛选 ANM 与公共素材包的完整命令流、圆环/粒子树和状态一致性：Boss、道中 Boss、移动后的视口三个配置，各检查 11 个时间点，覆盖开卡、结束和紧接的下一张卡。`tools/verify-touhou-boss-graphics.mjs` 可进一步捕获实际 QuickJS/GPU 的同场景像素，包含独立棋盘背景上的扭曲对照。此验证比较移植实现使用两份素材的输出，不运行原游戏可执行文件，也不把它称为原游戏逐像素证明。

本次核对的只读源文件 SHA-256：

| 文件 | SHA-256 |
| --- | --- |
| `source_reconstruction/card_system/start.cpp` | `eb4ea1db7396c22a32495474b5517908d114fb7f834827ccb6280e67197b09c4` |
| `source_reconstruction/gameplay/enemy_mesh.cpp` | `0c4958d4ddc742b933f18fc0bbdfdb1d0588ee5f3e7d66789cc6fd2f1a63eadc` |
| `source_reconstruction/hud_system/update.cpp` | `c065089a57201792459783c1f74400278b062a10befc3f9e367f41ee8ca7c338` |
| `scripts/recovered/anm/effect.anm.txt` | `daa1810279f3d297e701a2fba2a25cc471fe93f354ad0e561991ee28b44f3107` |
| `scripts/recovered/ecl/st01bs.ecl.txt` | `426db57cd87c3d63c2b024a7a695dbd8aa81d81de12ed8d4312556e18f14c86f` |
| `scripts/recovered/ecl/st01mbs.ecl.txt` | `f3b7e7b66ed89a329661d4a7279442cae52fe154bb987c747ec6013b81f7049a` |
| `source_reconstruction/sprite_renderer/dispatch.cpp` | `fa2bc1d7dec5611540d223af646c192428979eaeef2329d0c9411bfccb87a644` |
| `source_reconstruction/sprite_renderer/pool_platform.cpp` | `7170cb4c6fa3d38ca158ce88037c294a0b815f0faf052d287b0e95309b8ed2f9` |
| `source_reconstruction/platform_window/viewports.cpp` | `f6ac8ea145bc0f806e239b2253bc86d2e3f0c772df174af090935bcabaef63e8` |
| `source_reconstruction/sprite_renderer/quad.cpp` | `d289679e56201b5751593728af8f39373f6f4b17bf84d2a9e34ee947d8d02af4` |
| `scripts/recovered/ecl/default.ecl.txt` | `8ce44d667b1617df25b991cea1099935d592f250934cb76a9f5dd845ce9492b4` |
| `source_reconstruction/text_renderer/text.cpp` | `a259942981d8e060d92254ba38a541f0def392de4487765eaf2a4cdc3b3b8101` |
