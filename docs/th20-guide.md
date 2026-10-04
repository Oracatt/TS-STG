# 锦上京业务应用接入

实现位于 `games/touhou20/src/`，应用入口从自己的 `./src/index.js` 导入。它是私有业务应用，不属于 thlib，也不再提供 `@ts-stg/thlib/th20` 子入口。资源位于同应用的 `assets/`，导入清单中的路径相对工作区根目录。当前具体数值基线是锦上京重建源码；东方其他作品的版本差异不能用这份数据自动替代。

通用单精度算术、按键重复、图层队列、网格和径向扭曲由 `@ts-stg/thlib` 提供。这里的薄适配器明确传入原作坐标、时序、优先级和颜色约定；ANM/SHT 编号、字体映射、HUD/菜单布局、角色参数、原作随机数与计时细则仍留在本应用。具体 Boss 和魔石继续排除。

## 数据与坐标

导入工具生成 `anm/*.json`、`shots/pl00.json`、`shots/pl01.json`、`bullet-styles.json` 和 `audio/manifest.json`。动画文件引用本机原始纹理路径。每份数据记录来源或哈希，代码不嵌入原游戏执行文件。

原作场地坐标 x 为 −192..192，y 为 0..448，角度用弧度、速度用每帧单位。默认 960×720 窗口中，场地位于 (48,24)，大小 576×672。`TH20_GAME_VIEW` 把 (0,0) 映射到 (336,24)。HUD 的混合缩放由 ANM VM 处理，不能再统一缩放一遍。

每帧调用一次 `update(inputMask)`，再把 `render()` 返回的通用绘制命令交给宿主。输入位定义见架构文档。暂停期间只更新暂停控制器，战场和随机数序列冻结。

## 随机数与动画所有权

用两个 `Th20RNG` 实例分别表示玩法随机数和视觉随机数。`AnmBank` 的 `rng`、擦弹效果、弹幕消失动画共用视觉序列；自机、发射阵列和道具共用玩法序列。`Th20Game` 接受 `rng`、`visualRng`。原作的文件载入顺序也会影响随机数消耗；可复现的完整项目应固定它。

每个对象更新自己拥有的 VM。组合场景只额外更新银行中的 detached VM；不要再对同一组银行调用整库 `update()`，否则动画会前进两次。`Th20RenderQueue` 用于跨对象、跨资源文件合并动画层次。资源缓存和卸载由平台适配器负责。

## 组合场景

`Th20Game` 接受：

- `banks`：front、bullet、enemy、effect、ascii_960 及所选角色 pl00/pl01 的 `AnmBank`。
- `font`：使用原作 ascii_960 的 `Th20BitmapFont`。
- `sht` 与 `styles`：所选角色射击表和 50 类弹型表。
- `stage(game, frame)`：使用方编写的纯 JS 时间轴。
- `renderBackground(draw, game)`、可选 `renderTarget`：背景绘制和扭曲的通用目标纹理。
- `onSound`、`onEvent`、`onExit`、`onRestart`：平台和页面衔接。
- `spellOptions`、`spellContext`、`gameOverOptions`、`session`：符卡记录、通用失败流程与持久化适配。

使用 `spawnEnemy()` 创建小怪；通过 `enemy.onUpdate` 和 `Th20Motion` 控制行为。它不会自动执行 ECL 或选择某个原作关卡。敌机的动画/掉落/死亡特效可以由调用方配置。

`game.bullets.emit()` 支持源代码里的 13 种发射排列以及已实现的扩展运动指令。未知指令显式失败。`game.lasers` 的 `spawnStraight`、`spawnInfinite`、`spawnCurve` 分别创建移动直线、展开/维持/收束直线、曲线激光；不是把曲线简化为直线碰撞。

道具默认启用：火力、点、残机/Bomb、两种碎片和满火力。魔石类型 9..13 拒绝创建；原作消弹请求魔石时跳过，不擅自换算成点数。

## 通用 Boss 与符卡边界

`beginSpell({ id, name, duration, boss, background, portrait })` 连接使用方提供的敌机和动画；具体 Boss/攻击脚本由项目编写。可调用 `spell.capture()`、`spell.timeout()`、`spell.fail()`，也可以让组合场景处理计时结束或所关联敌机被击破。耐久符卡超时收取、普通符卡超时失败、前 60 帧决死/Bomb 的区别均由 `Th20Spell` 控制。

`Th20Health` 保留原作符卡生命的七倍整数余数。`Th20DamageAccumulator` 先合并每帧同目标伤害，再执行火力上限、计分、复活衰减及符卡抑制，不能逐发先除 30 再相加。当前碰撞和伤害区域所有权的适用边界见状态文档。

`postFrame(nowSeconds)` 接受显式平台时钟用于原作符卡时间编码；确定性仿真帧数与墙钟计时分开保存。录像适配器可提供 `readSpellTime`、`writeSpellTime`。

符卡名的动态文字通过 `spellContext.createNameAnimation(name, options)` 注入。缺少它时仍可执行符卡规则、光环和数字，但不产生标题字图；当前示例未把这个接口等同于原作 GDI 文字还原。

## 菜单和保存

`Th20TitleMenu` 有原作主菜单、难度、角色选择状态；可定制 labels、excluded 和回调。锦上京石头选择页不在范围内，角色选择后直接进入项目场景。

`Th20Pause` 和 `Th20GameOver` 使用原作 front 动画和等待帧数。Continue 恢复原作资源并保留死亡状态，继续到自然复活帧。排名表、名字输入、存储由 `gameOverOptions` 注入；缺少 Replay/Manual/Options 页面时对应入口禁用，不展示无效的假页面。

`@ts-stg/thlib` 的通用回放录制格式可用于自定义项目；它不是锦上京原生 replay 文件格式。原作还原示例目前不提供完整的原生录像保存/选择 UI。
