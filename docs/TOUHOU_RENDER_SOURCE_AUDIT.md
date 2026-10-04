# TH20 原作绘制调度与图层审计

本记录依据只读目录 `D:/AIWorkspace/Touhou20Reconstruction` 的重建源码和解码 ANM。它记录原作的渲染契约，不把当前 JS 图像之间的相等误写成原版 EXE 图像相等。

## 三种“层”必须分开

1. ANM VM 自身的 `layer`，由模板、帧零指令和后续脚本设置。
2. 全局 ANM 注册列表的 primary / secondary 与插入顺序。`sprite_renderer/dispatch.cpp:5` 将 secondary 的 29..36 映射为 46..53，将 26 映射为 45，其他层映射为 47；primary 46..53 反向映射为 29..36，45 映射为 26。`controller_callbacks.inc` 再把有效 layer 映射到回调优先级。
3. 拥有嵌入式 VM 的实体管理器绘制回调。该 VM 没有全局 ANM 注册，不能用它自己的 layer 查询调度优先级。

同优先级的全局 ANM 先 primary 后 secondary；各列表保持真实注册顺序。`pool.cpp:78` 的 front 注册会插入列表头。attached child 的 opcode 500 使用 flags 0，可能注册到 primary，即使父 VM 是 secondary；不应直接继承父 VM 的 secondary。

`named_spawn.cpp:19` 在模板复制后、帧零执行前安装初始 layer 覆盖。随后帧零 `ins_304` 可以再次覆盖该值。它不同于 `set_animation_layer`：初始 named spawn 的 layer < 24 写入 mode 1，不能用帧零结束之后的 `vm.layer = ...` 代替。

## 原作 scheduler 表

源码为 `sprite_renderer/controller_callbacks.inc:2` 和 `platform_window/graphics_callbacks.cpp:173`。数值优先级递增执行；有效层不是优先级，不能按 layer 大小排序。

| 优先级 | 有效 ANM layer / 所属回调 | 画面内容与责任 |
|---|---|---|
| 1 | begin_draw | 选择首个离屏 surface，清空颜色与深度 |
| 3 / 6 | Stage background geometry / foreground | 场景几何和前景，stage_background/lifecycle.cpp:62 |
| 5 / 7 / 9 | 0 / 1 / 2 | 初始背景 ANM |
| 10 / 11 | 3 / 4 | 背景特效 |
| 12 | CardInf::draw | 生成符卡分数/取得记录文字；文字实际在 84 绘制 |
| 13 | 5 | SpellCardAttack 6、其双圈 4/5、开卡 13/7..12 |
| 14 | composite_mask | 首个 surface 的游戏区域 alpha 置 255，RGB 保留；选择第二个 surface |
| 15 | composite_first + layer 41 | 首个 surface 复制与 Boss 背景网格扭曲 |
| 16 / 18 / 20 / 21 / 22 | 6 / 7 / 8 / 9 / 10 | Boss 入场 99/108、敌机、消弹子动画等 |
| 23 | EnemyController::draw | 专属系统 overlay，不属于普通弹幕 |
| 24 | 11 | 游戏实体特效 |
| 25 / 26 | clear_first_depth / composite_second | 回到首个 surface，仅清深度，复制第二个 surface |
| 27 / 28 | 12 / 13 | 武器和实体特效 |
| 30 | Player::draw | 嵌入式自机本体 |
| 33 / 34 | 14 / 15 | 子机、武器与特效 |
| 35 | ItemInf::draw | 嵌入式道具本体与上边界指示 |
| 37 | 16 | 游戏特效 |
| 39 | LaserController::draw | 嵌入式激光、光源、端点 |
| 40 | 17 | 游戏特效，包括判定点 |
| 41 | BulletController::draw | 普通敌弹嵌入式本体，draw_group 0..5 |
| 43 / 46 | 18 / 19 | 游戏特效 |
| 47 / 48 | clear_second_depth / composite_third | 回到第二个 surface，仅清深度，复制首个 surface |
| 49 / 50 | 20 / 21 | 游戏区域的后期特效 |
| 52 / 58 | FrontInf::draw / draw_player | 生成 HUD 文字 / 玩家 feedback |
| 60 / 62 | 22 / 23 | Boss HP 环与标记，场内 overlay |
| 61 | TextRenderer layer 1 | 场内文字 |
| 63 | 45 | secondary layer 26 |
| 64 / 65 | 24 / 25 | 全屏特效 |
| 66 / 67 | restore_backbuffer / composite_final | 清黑真实 backbuffer，复制完成的离屏画面 |
| 68 / 69 / 72 | 27 / 28 / 26 | UI、独立捕获画面等 |
| 73 / 74 | 29 / 46 | primary / secondary UI 背景与装饰 |
| 75 | TextRenderer layer 3 | 分数、生命、Bomb、Power 等侧栏数字 |
| 76 / 77 | 30 / 47 | 倒计时数字与 secondary 对应层 |
| 78 / 79 | 31 / 48 | UI 与 secondary 对应层 |
| 80 / 81 / 82 / 83 | 49 / 32 / 50 / 33 | 游戏区域 UI；符卡名、信息条在 81 |
| 84 / 85 | TextRenderer layer 2 / 4 | 符卡 bonus、取得次数、倒计时小数 / 另一文字组 |
| 98 / 99 / 100 / 101 | 34 / 51 / 35 / 52 | 全屏 UI 与 secondary 对应层 |
| 102 | TextRenderer layer 0 | 默认文字 |
| 103 / 104 / 105 / 106 / 107 / 108 | 36 / 53 / 37 / 54 / 38 / 55 | 前景 UI、对白等 |
| 110 | end_draw | flush 和视口偏移复位 |

## 普通弹、激光与武器所有权

- `bullet_system/controller.cpp:28` 的绘制优先级是 **41**。38 是更新优先级。`frame.cpp:36` 遍历六个 draw_group，直接绘制每颗弹的内嵌 `animation`。这些 VM 即使 ANM layer 为 0，也不能落到优先级 5。原作使用 `configure_animation_layer(...,12,view_index)` 设置绘制空间，但这并不把绘制回调改成 layer 12 的优先级 27。
- 大弹附属光晕由 `bullet_system/style.cpp` / 初始化中的 `spawn_named_animation(...,layer=-1)` 创建，属于全局 ANM。该子 VM 必须独立排队，不能随本体一起强制放到 41。
- `bullet_system/cancellation.cpp:20` 创建的消弹效果也是全局 ANM。典型 root 6/10/14/18/22 透明、layer 0，实际可见子动画 5/9/13/17/21 的模板 layer 为 **10 -> 22**。强制把整个消弹树放到 38 或 41 同样错误。
- `laser_system/controller.cpp:27,51` 的激光绘制回调为 **39**。嵌入式主光束、端点、光源由该管理器直接绘制。独立消弹效果仍按自身全局 ANM layer 处理。
- `player_entity/initialize.cpp:45` 与 `initialize_adapter.cpp:36` 仅将自机本体放到 **30**。`firing.cpp:65` / `firing_adapter.cpp:20` 的自机武器由 `spawn_named_animation(...,-1)` 全局注册；focus 效果也是全局 ANM。不能把整个 Player.draw 强制放到 30。
- `player_entity/power.cpp:44` 子机本体以初始 layer 14 创建，须在帧零前设置；满 Power 附加效果用 layer -1、front flags 2 创建。
- `item_system/state.cpp:26` 的普通道具为 **35**。第二个 19 回调在 frame.cpp:50 的 layer 0 分支不提交普通道具。

## 符卡双圈与 Boss 入场双圈是两组动画

`card_system/start.cpp:38,46` 创建 effect 6 和 13。`scripts/recovered/anm/effect.anm.txt:116,143,167,289` 中 4/5/6/13 均为 layer **5 -> 13**，在 14 捕获边界之前。它们应进入背景捕获，被优先级 15 的 Boss 扭曲网格影响。

Boss 出场 / 常驻 aura 则是 ECL st01bs:28、29 的 effect **99 / 108**。99 与 108 的可见孩子 105 / 107 在 `effect.anm.txt:2198,2331,2384` 为 layer **6 -> 16**，位于原作 Boss 扭曲网格之后；孩子 106 的 frame0 layer 为 **3 -> 10**，单独进入背景捕获。108 root 本身是透明控制 VM，不能因为它的 root layer 0 就把整棵树提前到背景，也不能把所有孩子统一移到 16。

因此“符卡双圈应扭曲”成立，“把 Boss 所有 aura 都移动到扭曲前”不成立。也不能把子弹、敌机、自机和 HUD 捕进同一个 Boss 扭曲纹理。

## 符卡名与数字文字

`card_system/start.cpp:29..31` 创建 ascii_960:0、text:22 和 ascii_960:1。三者均为 layer **32 -> 81**。`dispatch.cpp:26` 选 viewport 5，其游戏区域原点为中心 / 顶边，即 960×720 时 `(336,24)`，裁剪矩形 `(48,24,576,672)`。

三者还必须保持上述跨bank注册顺序。`sprite_renderer/pool.cpp:80` 的普通注册在全局动画列表末尾追加；文字先创建、底板后创建，即使layer和回调81正确，仍会让底板覆盖文字。公共 `TouhouSpell.begin` 现在先创建ascii底板0，再调用创建全新text22的名字工厂，最后创建ascii底板1。字图缓存不复用已注册VM。只检查关闭文字后的像素变化不足以发现半透明底板的压暗，须核查实际同层提交顺序及旧顺序对照。

`text.anm.txt:script22` 使用 mode 2 的 1280 单位文字精灵，不是随便画的一条 font label。保持原作进入、停留、退出和靠近玩家时透明度中断。

`card_system/draw.cpp:12` 将 TextRenderer layer 设置为 2；`text_renderer/text.cpp:49` 对应绘制优先级 **84**。默认 ASCII font 的 102 只对应文字层 0。符卡 bonus / 捕获次数必须显式使用 84。侧栏数字对应层 3 -> 75，倒计时小数同为层 2 -> 84。

Boss 自身名字是另一套 UI：`hud_system/update.cpp:43` 根据关卡定义选择 `front:150+index` 的预烘焙名称图。`front.anm.txt:5884` 的 150 及后续名称脚本使用 **layer 22 -> 60**、mode 2、位移 `(-376,0)`；60 帧后淡入 20 帧，靠近自机时用 2/3 中断调整透明度。具体 Boss 名字图属于业务素材，Rush 的 Sunny / Monstone / Artia 可提供自定义字体名称，绘制顺序仍应为 60。font 的 `drawPriority` 只有提交到队列时才生效，直接提交到最终 DrawList 末尾不会重新排序。

## 跨场景业务背景的所有权

Rush 的非符皮肤使用结局底图 `ebg00:1`。`ebg00.anm.txt:26,39` 与当前私有解码文件确认 root 1 和 child 0 的 layer 都为 **30 -> 76**，这是结局场景中的层，不能直接搬进游戏全局 ANM 队列。这样会让一张不透明结局背景在普通子弹 41、自机 30 之后才绘制，直接遮住游戏。

将这张素材注入 gameplay 时，业务适配器必须以“关卡背景绘制回调”的所有权在 **3** 提交整棵背景树，只借用图片和动画；没有改变通用 ANM layer 映射表。原本就是游戏符卡皮肤的 st01 / st02 / st03 的 root layer 4 -> 11 则仍按全局 ANM 图层逐 VM 入队。关卡背景与原生符卡背景不能用同一种无条件 `bank.draw(queue)` 处理。

## 视口与裁剪

`sprite_renderer/dispatch.cpp:18..26`、`pool_platform.cpp:10`、`platform_window/viewports.cpp` 定义：

- ANM 0..2：不改变当前相机，通常全屏 / 离屏背景。
- ANM 3..19：camera 0，原生投影视口 416×480。960×720 下源视口 `(272,120,416,480)`；映射至显示画面后游戏边框附近的扩展区域为 `(24,0,624,720)`。不要无条件用 576×672 裁掉投影 aura 的边缘。
- ANM 20..23：camera 1，实际游戏区域 `(48,24,576,672)`。
- ANM 24..25：camera 4，全屏。
- ANM 26..31、34..36、45..48、51..53：camera 2，全屏。
- ANM 32..33、49..50：viewport 5，游戏区域 `(48,24,576,672)`，中心 / 顶边原点 `(336,24)`。
- deferred text 84 的 draw2 显式选 camera 2，全屏，不继承紧前的符卡名游戏区域裁剪。75 与 85 同样全屏。

投影 VM 本身需要原始相机与当前映射；以上扩展区域是当前 2D 显示桥接时的裁剪关系，不是把 source 的 416×480 原生视口误写成 624×720。

## 离屏复制与当前平台的边界

原作使用 `resource_019c` / `resource_01a0` 交替复制。`render_surfaces.cpp:20..29` 在 960 宽度绑定 surface scripts `[1,8,5,11,14]`。`text.anm.txt` 的这些 surface scripts 使用 ANM blend 3（RGB source ONE / destination ZERO），因此它们是颜色复制，而不是普通 source-alpha 叠加。

原作关键过程：

1. 首个 surface 捕获场景和优先级 <= 13 的 ANM。
2. 14 保留 RGB、将游戏区域 alpha 置 255；切到第二个 surface 并清色。`graphics_callbacks.cpp:49..58` 中 RGB 为 ZERO/ONE、alpha 为 ONE/ZERO，四个顶点颜色均是 `0xff000000`。
3. 15 复制首个 surface，然后绘制 layer 41 的 Boss 网格。`render_mesh.cpp:31..38` 中 surface_mode 0 的 17×17 网格使用该层，根隐藏，仅条带可见。
4. 16..24 前景绘制在第二个 surface。
5. 25 仅清首个 surface 深度，26 把第二个 surface 复制回去；27..46 继续绘制玩家、道具、激光、敌弹等。
6. 47 仅清第二个 surface 深度，48 复制首个 surface；49..65 继续绘制场内 overlay。
7. 66 清黑真实 backbuffer，67 复制离屏结果；68+ 的 UI 随后绘制。

单张 960×720 纹理可以表达正确的图层前后顺序和 Boss 捕获边界；在相同坐标、不透明颜色、无目标 alpha 依赖的条件下，取消中间 ONE/ZERO 复制不会改变 RGB 运算。但这 **不是完整像素等价证明**：原作 unscaled 416×480 pass 经 surface 5 的 1.5 倍采样，源 / 目标纹理格式、采样和舍入可能不同。渲染 blend 7 使用 DESTALPHA / INVDESTALPHA，14 的 alpha 重置也有意义。启用这些模式或复刻原始 surface 翻转中断时，应使用真正的多 surface 管线。

本轮修复应先保证：业务背景只提交一次、低层特效被捕获而不被覆盖、内嵌敌弹 41 与激光 39 在背景之后、spell 双圈 13 被 warp15 捕获、符卡名 81 在侧栏背景 73/74 之后且使用 viewport5、文字 84 按其实际文字回调绘制。不能以一张背景不透明 blit 覆盖此前已提交的低层实体。
