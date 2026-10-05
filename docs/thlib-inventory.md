# thlib 当前完整库存

清点日期：2026-10-04；JS 库存更新至 2026-10-05。依据 `packages/thlib/src` 的实际 ESM 导出、源码和 `packages/thlib/assets` 的实际文件（包括被 Git 忽略的本机素材），不把 `games/` 的内容计入。

当前包为 `@ts-stg/thlib` 0.1.0，包含 92 个 JS 文件（含两个汇总入口）。包根入口有 242 个运行时导出；其中 `@ts-stg/thlib/touhou` 有 157 个，已包含在前者中，不能相加。另有 TypeScript 声明。此前机器清单保存在本机生成文件 `reports/thlib-inventory/2026-10-04.json`（不纳入 Git），该快照尚不含新增的 `clearTouhouBossPhase` 和公共撤退预设。

## 原作还原实现

以下 `Touhou*` 是两个 Demo 共用的公共实现；资源与数值参考本机东方锦上京重建源码。列入库存表示有实现或资源，不表示原作整局及所有分支已经逐帧、逐像素验收。

| 类别 | 当前包含的内容 | 主要入口 |
| --- | --- | --- |
| 应用框架 | 标题、难度、灵梦/魔理沙选择、游戏、暂停、失败/续关、重试、返回标题及资源生命周期；可注入关卡、页面与皮肤 | `TouhouApplication`、`TouhouGame` |
| 主菜单与选择 | 原菜单按钮动画、选中/确认/返回时间线、难度与标准角色选择、可自定义标签/入口/位置/动画；练习列表分页、确认闪烁和返回等待 | `TouhouTitleMenu`、`TouhouButtons`、`TouhouStageSelect` |
| 两名自机 | 灵梦、魔理沙的机体动画、高低速移动、子机与队形、火力、判定点、擦弹、八帧决死、死亡/复活和无敌状态；跨关保持机体、僚机退场/恢复、保留持久数据的临时状态重置 | `TouhouPlayer`、`TOUHOU_PLAYER_DATA` |
| 自机武器 | 两名角色标准射击数据、普通/低速发射、子机攻击、追踪/直线/激光相关命中行为、命中特效；灵梦72行、魔理沙32行标准发射记录，基础射击 pattern 0..14 | `TouhouShot`、`fireTouhouPattern`、`getTouhouPlayerData` |
| Bomb | 灵梦与魔理沙完整公共 Bomb 动画树、时序、伤害区域、消弹及结束清理 | `TouhouReimuBomb`、`TouhouMarisaBomb`、`applyTouhouDamage` |
| 敌弹 | 50行原始类型表，每行16个配色映射；原判定半径、2000槽池、生成/运动/转向/加速/消除/碰撞/擦弹和动画；独立可复用的8/15/25帧出生雾、静默回收及命中/消弹呈现 | `TouhouBulletField`、`TouhouBulletPresentation`、`TOUHOU_BULLET_STYLES`、`touhouBulletCommand` |
| 发射阵列 | 整数模式0..12的13种原始发射算法，自机狙/固定扇形、圆周、错开半步、随机角/速度、交错行、椭圆及正弦调速 | `touhouShotTrajectory`、`TouhouRandom`、`touhouStyle` |
| 激光 | 移动直线、展开直线、曲线轨迹，宽度/端点判定、重复擦弹及源变色、消除与分段；完整曲线出生缓冲与外部轨迹同步；16色公共发射点动画 | `TouhouLaserField`（含 `updateDrivenCurve`）、`createTouhouLaserOrigin`、`touhouCurveSample` |
| 普通敌人 | 运动计算、转向/方向动画、接触判定、受伤/死亡、掉落；7张敌机图集、272个动画脚本，包含姿态/辅助动画；25个完整五脚本源族默认支持方向行为 | `TouhouEnemy`、`TouhouMotion`、`touhouEnemyDeathScript` |
| 道具 | 小P、点符、大P、残机碎片、残机、Bomb碎片、Bomb、满火力；原type15普通点生成计数、敌机/Boss局部奖励散布、飘落、吸附、上方回收、强制回收、得分/碎片/库存事件 | `TouhouItems`、`TouhouItemType` |
| 伤害与生命 | 同帧伤害汇总、攻击上限、衰减、区域伤害及符卡七倍生命余数计算 | `TouhouDamageAccumulator`、`TouhouHealth` |
| 符卡规则 | 开始、失败、超时、收取、耐久卡、前60帧规则、奖励衰减、动画结束、记录和时间编码 | `TouhouSpell` |
| Boss公共演出 | 800颗原作黑雾/加色粒子的101帧出场、可选直接飞入；99/108常驻气场，开卡双圈6→4/5、Spell Card Attack 13、背景扭曲、符卡名、奖励/记录文字与倒计时；七色攻击收束/释放圈与粒子；死亡等待、反色25、散射57与震动 | `TouhouBossPresentation`、`TouhouBossEntrance`、`TouhouBossCharge`、`TouhouBossDeath`、`TouhouScreenShake` |
| Boss HUD | 名字及未来符卡星标、共用血环的非符/符卡分段、可覆盖分组/比例的阶段规划、倒计时、位置指针及Boss面板 | `TouhouBossHud`、`TouhouBossPhasePlan` |
| Boss 阶段交接与结局 | HP 归零通知关卡，自定义持留对话、恢复下一阶段或移除；可组合普通阶段消弹、渐进消弹爆炸与静默飞离预设，结算/掉落由调用方选择 | `TouhouGame` 的 `onBossDefeated` / `onDefeated`、`clearTouhouBossPhase`、`TouhouBossDefeat`、`TouhouBossEscape`、`TouhouBulletClearWave` |
| 游戏HUD | 公共游戏边框、分数/高分、难度、火力、残机/Bomb及碎片；收卡奖励数字与时间、失败提示、Extend及独立提示槽 | `TouhouHud` |
| 暂停与结算 | 暂停菜单、返回/重试、抓屏缩放和噪声；失败/续关、成绩、可注入十名排名和姓名输入 | `TouhouPause`、`TouhouPauseCapture`、`TouhouGameOver` |
| 对话 | 公共对话框、文字换行与分页、确认/跳过、计时、事件、说话人明暗、自机表情与整身皮肤、可注入另一侧头像/台词；可选战后首句 0/4/34/38 帧入口、战前 30 帧退场、战后第 1 帧交接与第 31 帧退场完成 | `TouhouDialogue`、`wrapTouhouDialogue` |
| 关卡结算与过渡 | 公共 STAGE CLEAR 动画、120/300 帧确认门槛、10 帧退出；注入奖励/统计行；背景层 30 帧盖黑及 30 帧揭幕、完全覆盖时交接关卡 | `TouhouStageClear`、`TouhouStageTransition` |
| 公共特效 | effect:0..192全部193个脚本：擦弹、死亡、命中、粒子、光圈、光带、蓄力、符卡宣言等；42个入场EffChargePoint入口及50帧200粒子生命周期，与攻击收束/释放预置分别使用 | `TouhouGrazeEffects`、`TouhouShortLine`、`TouhouConvergingParticles` |
| 预置体目录 | 两自机、50行弹型、272个敌机动画、193个效果动画和所有保留bank脚本；支持创建自机/敌人/弹幕池/效果 | `createTouhouPrefabCatalog` |
| ANM | ANM v8解码、151个已支持操作码、动画VM、预初始化、父子/独立动画、中断、插值、变换、颜色、图层、精灵/网格/投影/billboard绘制 | `AnmBank`、`AnmInstance`、`decodeAnm`、`drawAnm` |
| 游戏合成 | 原作ANM与实体绘制优先级、稳定队列、两张目标纹理分步捕获与复制、扩展相机和裁剪、扭曲前alpha处理、玩法/HUD叠加 | `TouhouRenderQueue`、`TouhouGameplayCompositor` |
| 背景动态 | 17×17 Boss径向扭曲、阶段网格扭曲、标题64×48波动网格；图像和阶段相机由业务注入 | `TouhouEnemyDistortion`、`TouhouStageDistortion`、`TouhouTitleBackground` |
| 字体与动态文字 | 公共位图字库、分组分数、符卡字图、描边/裁切/alpha；CP932默认及显式中文CP936适配 | `TouhouBitmapFont`、`TouhouTextRenderer` |
| 音乐切换提示 | 原340帧延迟/滑入/淡出时间线、公共动态文字及独立纹理生命周期；曲名和音乐由业务提供 | `TouhouMusicCaption` |
| 音乐淡出 | 固定帧衰减、原百分比音量换算及可注入音量/停止回调；默认 2 秒，不包含曲目 | `TouhouMusicFade`、`touhouMusicVolume` |
| 音频与资源 | 音效请求、音量/声像、停止与提交；10个bank、标准射击数据、纹理/动态表面/声音加载与释放、可注入平台适配器 | `TouhouAudio`、`createTouhouResources` |
| 原作数值工具 | 原作计时器/RNG、binary32运算、角度、几何、矩阵和相机/投影工具 | `TouhouTimer`、`TouhouRNG`、`touhou/math`、`anm-projection` |

`TouhouEffectPreset` 当前只有两个具名别名：`SPELL_DOUBLE_CIRCLES = 6`、`SPELL_CARD_ATTACK = 13`。其余效果可通过 `effect:编号` 创建，不能把所有193个脚本说成193种独立特效。敌机272个脚本也不是272个独立敌人种类。

## 轻量通用模板与工具

这些是同一包中可单独使用的通用接口。`createPlayerCharacter` 的灵梦/魔理沙原型与上面的 `TouhouPlayer` 原作还原实现是两套接口；两个还原Demo使用后者。

| 类别 | 当前包含的内容 | 主要入口 |
| --- | --- | --- |
| 世界与实体 | 固定帧更新、分组、生成/销毁、待生成队列、空间哈希和查询、稳定绘制顺序 | `World`、`Entity`、`SpatialHash` |
| 输入与任务 | 键位bit mask、按下/释放/持续状态、按键重复、生成器任务与逐帧等待 | `Keys`、`Input`、`RepeatingInput`、`TaskRunner`、`wait` |
| 敌弹与判定 | 普通弹实体、速度/角度/延迟/加速等行为；圆、旋转胶囊及旋转矩形判定 | `Bullet` |
| 标准弹型 | 26个不可变几何预置，8/16/32/64逻辑尺寸及判定半径/长度/宽度；几何与图片/配色分离 | `StandardBulletPresets`、`getBulletPreset`、`bulletIntersectsCircle` |
| 发射模板 | 圆环、扇形、自机狙、螺旋、随机、椭圆、线列 | `Patterns.ring/fan/aimed/spiral/random/ellipse/line` |
| 激光 | 分段激光、判定、活动阶段与擦弹 | `Laser` |
| 自机与武器 | 可配置高低速、命中/决死/复活、射击与武器生命周期，散射/追踪/激光原型 | `Player`、`PlayerShot`、`Weapon`、`createPlayerCharacter` |
| Bomb与几何 | 圆球/光束Bomb原型、追随、自定义成长、伤害/消弹和胶囊区域判定 | `Bomb`、`createOrbBomb`、`createBeamBomb`、`beamIntersectsCircle`、`beamIntersectsEntity` |
| 敌人/Boss/道具 | 敌人血量/伤害/掉落、Boss多阶段/移动/超时/收卡、资源和碎片道具 | `Enemy`、`Boss`、`Item`、`ItemTypes`、`spawnDrops` |
| 特效与自机绘制 | 圈/火花/浮字、爆散；图集驱动的武器/Bomb/道具/判定点/死亡效果分层绘制 | `Effect`、`Effects`、`PlayerPresentation` |
| 关卡与会话 | 生成器关卡时间线、Boss/对话、通关；标题、游戏、暂停、练习、续关/结算等原型流程 | `Stage`、`Dialogue`、`Game`、`Menu`、`DEFAULT_RULES` |
| 回放与保存 | TS-STG自定义输入RLE格式、检查点、状态hash、回放和同步存储适配 | `ReplayRecorder`、`ReplayPlayer`、`SaveStore`、`stateHash` |
| 图集与动画 | 图集元数据、命名精灵/clip、逐帧动画、缓动、简易投影相机 | `SpriteAtlas`、`SpriteClip`、`SpriteAnimation`、`Easing`、`tween`、`Camera3D` |
| 绘制命令与图层 | 图形/文字/精灵/区域精灵、四边形、2D/3D网格、shader、混合/alpha/sampler、目标纹理、裁剪和排序命令 | `DrawList`、`LayeredDrawQueue` |
| 网格与透视效果 | 可变网格、径向扭曲、透视精灵、纹理圆环、矩阵/四元数 | `GridMesh`、`RadialDistortion`、`PerspectiveCamera`、`PerspectiveSprite`、`TexturedRing` |
| 数学与资源 | 种子RNG、角度/距离/几何/插值、binary32工具、颜色，以及平台注入的纹理/音频/字体缓存与JSON读写 | `RNG`、`Easings`、`f32*`、`rgba`、`withAlpha`、`Resources` |

26个轻量几何名为：`pellet`、`orb`、`ring`、`rice`、`kunai`、`needle`、`amulet`、`star`、`capsule`、`oval-ring`、`glow`、`orb-medium`、`heart-ring`、`knife`、`oval`、`star-large`、`ring-medium`、`orb-large`、`lightning`、`diamond`、`droplet`、`orb-patterned`、`flame`、`linked`、`micro-orb`、`heart`。这套通用几何不是50行原始类型表；部分几何名称需要使用方提供对应图像。

## 当前公共素材

整个 `assets/` 实际有120张PNG、57个WAV、19个JSON与5个说明文件，共201个文件。PNG按SHA-256去重为98种，WAV为57种；`reference-common` 有22张PNG与主包重复，数量不能解释为完全不重复的原始美术作品。

| 素材包 | 当前库存 | 内容 |
| --- | --- | --- |
| `touhou-common` | 10个ANM bank、1342个动画脚本、2256个sprite、94张PNG、51个原始SE文件、两份标准射击数据 | 两自机/子机/武器/Bomb、敌弹/激光、小怪、道具、完整公共效果、HUD/暂停/结算/对话框、菜单/难度/标准选人、场景转场/NowLoading、位图字库与动态文字表面 |
| `reference-common` | 23张PNG、612个源sprite、924个命名sprite地址/别名、9个动画clip | 无ANM依赖的弹型、直线/流动激光、消弹、Bomb球/光束/外壳、判定点/死亡环/花瓣/魔法阵/气场/轨迹/波纹/水花/蓄力 |
| `spell-common` | 3张PNG、7个命名sprite，无clip | 纹理圆环/光带、气场与蓄力材料；保留旧视觉材料供自定义，不是默认原作Boss演出的替代实现 |
| `audio` | 6个自制WAV | `shot`、`graze`、`pickup`、`bomb`、`hit`、`select`，独立于原始51个SE |

`touhou-common` 另含灵梦、魔理沙各9张无魔石表情图及其运动脚本；默认对话恢复原身体与表情动画，用干净原画的等比例UV裁片替换带魔石的身体图；原尺寸、锚点及说话切换保持源ANM，绘图差异另有记录。原作图片/声音拥有独立来源与权利说明，不属于代码MIT许可；此库存是本机开发资源清单。

主包音频有69个已定义sound ID、52条文件登记，对应51个实际WAV（`se_cardget.wav`重复登记一次），包含普通符卡超时使用的69号 `se_fault.wav`。公共音频队列有聚合/声像/音量/播放/停止实现，目前没有使用清单的cooldown/retained字段。

对话表情键为 `NOTICE`、`NOTICE2`、`HAPPY`、`ANGRY`、`ANGRY2`、`SWEAT`、`DISAPPOINT`、`PUZZLED`、`SURPRISE`、`LOSE`；`ANGRY2`与`ANGRY`共用图，故每名角色为9张表情图。两个bank各自的射击profile只保留标准profile 0，其中基础发射pattern索引为0..14。

## 目前不包含或尚未完整接入

- 锦上京魔石、魔石武器分支、魔石道具/UI，以及具体Boss本体、立绘、身份、招式和关卡编排。
- 任一作品的完整道中、具体符卡设计、关卡背景、标题Logo/专属插画、BGM及台词；这些属于业务层。现有背景扭曲是通用效果，背景图片不随之进入库。
- 原作Replay二进制兼容，以及原作Replay、Player Data、Music Room、Option、Manual等页面的完整业务实现。菜单标签/回调和通用TS-STG回放接口已经存在，不等于这些原作页面全部完成。
- 完整ECL/STD脚本执行器、全部特殊弹幕/激光/所有权指令。未支持分支明确报错；特殊ANM相机与几何分支也有边界。
- 原敌弹扩展指令13、24、27、外部敌人ANM弹型、曲线激光type2及敌人相对/随机激光角度分支；附着特效descriptor目前只支持1。以上均没有静默替代实现。
- 其他系统字体/平台下的原作字图一致性、原作D3D与当前GPU后端的全部采样/深度/像素覆盖一致性，以及原作整局端到端逐帧/逐像素一致验收。
- V8、QuickJS、窗口、GPU渲染器及音频设备实现属于底层引擎，不计入thlib库存；thlib通过注入接口使用它们。

下方附录直接由本次实际文件生成：所有JS模块的运行时导出、各bank所有动画ID、50行源弹型数据和每个素材文件。数字范围为包含两端的连续ID，不省略范围内任何条目。

<!-- inventory-appendix -->

## ANM bank 与全部保留动画ID

| bank | 脚本 | sprite | PNG | 动态表面 | 所有保留script ID |
| --- | ---: | ---: | ---: | ---: | --- |
| pl00 | 29 | 42 | 13 | 0 | 0..5、7..8、37..38、46..62、64、66 |
| pl01 | 30 | 48 | 14 | 0 | 0..5、7、10、12..13、32..33、51..65、73、75、77 |
| bullet | 320 | 612 | 10 | 0 | 0..122、137..333 |
| effect | 193 | 71 | 12 | 0 | 0..192 |
| enemy | 272 | 346 | 7 | 0 | 0..271 |
| ascii_960 | 18 | 915 | 8 | 0 | 0..17 |
| front | 330 | 127 | 10 | 0 | 0、2..12、20..84、100..102、111、113..149、166..377 |
| text | 94 | 65 | 0 | 4 | 0..93 |
| title | 44 | 28 | 18 | 0 | 0、2..3、6..9、12、15..21、31、34..59、134..135 |
| screenswitch | 12 | 2 | 2 | 0 | 0..11 |

## 50行原始敌弹类型

以下type为 `bullet:0..49` 预置ID，script为弹型表中原始动画索引。半径按实际JSON binary32值列出，不是轻量几何模板的默认半径。

| type | script | 配色表项数 | 判定半径 | 绘制组 | 子脚本 | 消弹类型 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 37 | 16 | 2.4000000953674316 | 5 | 114 | 6 |
| 1 | 38 | 16 | 2.4000000953674316 | 5 | 114 | 6 |
| 2 | 39 | 16 | 2.4000000953674316 | 5 | 114 | 6 |
| 3 | 40 | 16 | 2 | 5 | 114 | 6 |
| 4 | 41 | 16 | 4 | 3 | 0 | 6 |
| 5 | 42 | 16 | 4 | 3 | 0 | 6 |
| 6 | 43 | 16 | 4 | 3 | 0 | 6 |
| 7 | 44 | 16 | 4 | 3 | 0 | 6 |
| 8 | 45 | 16 | 2.4000000953674316 | 4 | 0 | 6 |
| 9 | 46 | 16 | 2.4000000953674316 | 4 | 0 | 6 |
| 10 | 47 | 16 | 2.4000000953674316 | 4 | 0 | 6 |
| 11 | 48 | 16 | 2.799999952316284 | 3 | 0 | 6 |
| 12 | 49 | 16 | 2.4000000953674316 | 4 | 0 | 6 |
| 13 | 50 | 16 | 2.4000000953674316 | 4 | 0 | 6 |
| 14 | 51 | 16 | 2.4000000953674316 | 4 | 0 | 6 |
| 15 | 52 | 16 | 2.4000000953674316 | 4 | 0 | 6 |
| 16 | 53 | 16 | 4 | 3 | 0 | 6 |
| 17 | 54 | 16 | 4 | 3 | 0 | 0 |
| 18 | 74 | 16 | 8.5 | 1 | 0 | 6 |
| 19 | 75 | 16 | 8.5 | 1 | 0 | 6 |
| 20 | 76 | 16 | 6 | 2 | 0 | 6 |
| 21 | 77 | 16 | 6 | 2 | 0 | 6 |
| 22 | 78 | 16 | 7 | 2 | 0 | 6 |
| 23 | 79 | 16 | 7 | 1 | 0 | 6 |
| 24 | 80 | 16 | 7 | 1 | 0 | 6 |
| 25 | 110 | 16 | 6 | 2 | 0 | 7 |
| 26 | 111 | 16 | 6 | 2 | 0 | 8 |
| 27 | 112 | 16 | 4 | 2 | 0 | 9 |
| 28 | 113 | 16 | 4 | 2 | 0 | 10 |
| 29 | 83 | 16 | 10 | 1 | 0 | 6 |
| 30 | 81 | 16 | 7 | 1 | 0 | 6 |
| 31 | 84 | 16 | 4 | 3 | 0 | 6 |
| 32 | 82 | 16 | 14 | 0 | 0 | 6 |
| 33 | 318 | 16 | 12 | 2 | 0 | 6 |
| 34 | 109 | 16 | 2.4000000953674316 | 5 | 0 | 6 |
| 35 | 55 | 16 | 3.200000047683716 | 4 | 0 | 6 |
| 36 | 56 | 16 | 3.200000047683716 | 4 | 0 | 6 |
| 37 | 57 | 16 | 4 | 3 | 0 | 6 |
| 38 | 161 | 16 | 4 | 2 | 0 | 6 |
| 39 | 320 | 16 | 4 | 3 | 0 | 6 |
| 40 | 321 | 16 | 4 | 3 | 0 | 6 |
| 41 | 322 | 16 | 4 | 3 | 0 | 6 |
| 42 | 323 | 16 | 4 | 3 | 0 | 6 |
| 43 | 324 | 16 | 5 | 2 | 0 | 6 |
| 44 | 329 | 16 | 10 | 1 | 0 | 6 |
| 45 | 330 | 16 | 10 | 1 | 0 | 6 |
| 46 | 331 | 16 | 28 | 0 | 0 | 6 |
| 47 | 332 | 16 | 28 | 0 | 0 | 6 |
| 48 | 325 | 16 | 7 | 2 | 0 | 6 |
| 49 | 326 | 16 | 7 | 2 | 0 | 6 |

## 全部JS模块与实际运行时导出

| 模块 | 运行时导出 |
| --- | --- |
| [animation.js](../packages/thlib/src/animation.js) | `Camera3D`、`Easing`、`SpriteAnimation`、`tween` |
| [bomb-geometry.js](../packages/thlib/src/bomb-geometry.js) | `beamIntersectsCircle`、`beamIntersectsEntity` |
| [boss.js](../packages/thlib/src/boss.js) | `Boss` |
| [bullet-presets.js](../packages/thlib/src/bullet-presets.js) | `StandardBulletPresets`、`bulletIntersectsCircle`、`getBulletPreset` |
| [bullets.js](../packages/thlib/src/bullets.js) | `Bullet` |
| [effects.js](../packages/thlib/src/effects.js) | `Effect`、`Effects` |
| [enemy.js](../packages/thlib/src/enemy.js) | `Enemy` |
| [float32.js](../packages/thlib/src/float32.js) | `f32`、`f32Add`、`f32Atan2`、`f32Cos`、`f32Div`、`f32Mul`、`f32Sin`、`f32Sqrt`、`f32Sub` |
| [game.js](../packages/thlib/src/game.js) | `DEFAULT_RULES`、`Game` |
| [grid-mesh.js](../packages/thlib/src/grid-mesh.js) | `GridMesh`、`argbToRgba` |
| [index.js](../packages/thlib/src/index.js) | `AnmBank`、`AnmInstance`、`AnmInterpolation`、`Bomb`、`Boss`、`Bullet`、`Camera3D`、`DEFAULT_RULES`、`Dialogue`、`DrawList`、`Easing`、`Easings`、`Effect`、`Effects`、`Enemy`、`Entity`、`Game`、`GridMesh`、`Input`、`Item`、`ItemTypes`、`Keys`、`Laser`、`LayeredDrawQueue`、`Menu`、`Patterns`、`PerspectiveCamera`、`PerspectiveSprite`、`Player`、`PlayerPresentation`、`PlayerShot`、`RNG`、`RadialDistortion`、`RepeatingInput`、`ReplayPlayer`、`ReplayRecorder`、`Resources`、`SUPPORTED_ANM_OPCODES`、`SUPPORTED_TOUHOU_BULLET_COMMANDS`、`SaveStore`、`SpatialHash`、`SpriteAnimation`、`SpriteAtlas`、`SpriteClip`、`Stage`、`StandardBulletPresets`、`TAU`、`TOUHOU_BOSS_CHARGE_PRESETS`、`TOUHOU_BOSS_DEATH_PRESET`、`TOUHOU_BOSS_DEFEAT_PRESET`、`TOUHOU_BOSS_ESCAPE_PRESET`、`TOUHOU_BOSS_ENTRANCE_PRESETS`、`TOUHOU_BOSS_PROFILES`、`TOUHOU_BOSS_SCREEN_VIEW`、`TOUHOU_BOSS_VIEW`、`TOUHOU_BULLET_CLEAR_WAVE_PRESET`、`TOUHOU_BULLET_PRESETS`、`TOUHOU_BULLET_STYLES`、`TOUHOU_DIALOGUE_ENTRANCE_PRESETS`、`TOUHOU_DIALOGUE_EXIT_PRESETS`、`TOUHOU_DIALOGUE_EXPRESSIONS`、`TOUHOU_DIALOGUE_PORTRAITS`、`TOUHOU_DIALOGUE_PRESETS`、`TOUHOU_EFFECT_PRESETS`、`TOUHOU_ENEMY_PRESETS`、`TOUHOU_GAME_VIEW`、`TOUHOU_INITIAL_CREDITS`、`TOUHOU_LAYER_PRIORITIES`、`TOUHOU_MAIN_LABELS`、`TOUHOU_MUSIC_CAPTION_VIEW`、`TOUHOU_NAME_CHARACTERS`、`TOUHOU_OWNER_PRIORITIES`、`TOUHOU_PLAYER_DATA`、`TOUHOU_PLAYER_PRESETS`、`TOUHOU_RESOURCE_BANKS`、`TOUHOU_STAGE_CLEAR_PRESET`、`TOUHOU_STAGE_TRANSITION_PRESET`、`TOUHOU_VIEWPORT`、`TaskRunner`、`TexturedRing`、`TouhouApplication`、`TouhouAudio`、`TouhouBitmapFont`、`TouhouBossCharge`、`TouhouBossDeath`、`TouhouBossDefeat`、`TouhouBossEscape`、`TouhouBossEntrance`、`TouhouBossHud`、`TouhouBossPhasePlan`、`TouhouBossPhaseTimeline`、`TouhouBossPresentation`、`TouhouBulletBirth`、`TouhouBulletClearWave`、`TouhouBulletCollision`、`TouhouBulletField`、`TouhouBulletPresentation`、`TouhouButtons`、`TouhouConvergingParticles`、`TouhouDamageAccumulator`、`TouhouDialogue`、`TouhouEffectPreset`、`TouhouEnemy`、`TouhouEnemyDistortion`、`TouhouGame`、`TouhouGameOver`、`TouhouGameplayCompositor`、`TouhouGrazeEffects`、`TouhouHealth`、`TouhouHud`、`TouhouItemType`、`TouhouItems`、`TouhouLaserField`、`TouhouMarisaBomb`、`TouhouMotion`、`TouhouMusicCaption`、`TouhouMusicFade`、`TouhouPause`、`TouhouPauseCapture`、`TouhouPlayer`、`TouhouRNG`、`TouhouRandom`、`TouhouReimuBomb`、`TouhouRenderMesh`、`TouhouRenderQueue`、`TouhouSceneTransition`、`TouhouScreenShake`、`TouhouShortLine`、`TouhouShot`、`TouhouSpell`、`TouhouStageClear`、`TouhouStageDistortion`、`TouhouStageSelect`、`TouhouStageTransition`、`TouhouTextRenderer`、`TouhouTimer`、`TouhouTitleBackground`、`TouhouTitleMenu`、`UnsupportedAnmError`、`Weapon`、`World`、`angleTo`、`anmDrawPriority`、`anmEasing`、`anmSpriteVertices`、`applyPauseNoise`、`applyTouhouDamage`、`applyTouhouEnemyDamage`、`approachAngle`、`argbToRgba`、`beamIntersectsCircle`、`beamIntersectsEntity`、`bulletIntersectsCircle`、`cancelBombBeam`、`cancelTouhouLaser`、`circleIntersectsRect`、`circlesOverlap`、`clamp`、`configureTouhouBulletBirth`、`continueTouhouGame`、`copyPauseSurface`、`createBeamBomb`、`createOrbBomb`、`createPlayerCharacter`、`createTouhouAttachedEffect`、`createTouhouBossAuraView`、`createTouhouBulletAnimation`、`createTouhouBulletCancelAnimation`、`createTouhouCamera`、`createTouhouLaserCollisionState`、`createTouhouLaserOrigin`、`createTouhouPrefabCatalog`、`createTouhouResources`、`decodeAnm`、`distance`、`distanceSq`、`distanceToSegmentSq`、`drawAnm`、`drawTouhouBulletBody`、`effectiveAnmLayer`、`encodeTouhouSpellTime`、`eraseTouhouLaser`、`f32`、`f32Add`、`f32Atan2`、`f32Cos`、`f32Div`、`f32Mul`、`f32Sin`、`f32Sqrt`、`f32Sub`、`fireTouhouPattern`、`getBulletPreset`、`getTouhouLaserCollisionSegments`、`getTouhouPlayerData`、`identityMatrix`、`identityPresentationMatrix`、`insertTouhouHighScore`、`invalidTouhouSpellTime`、`lerp`、`mod`、`multiplyMatrix`、`multiplyPresentationMatrix`、`multiplyPresentationQuaternion`、`nextRawPauseRandom`、`normalizeAngle`、`outlineTouhouTextBitmap`、`presentationQuaternion`、`presentationWorldMatrix`、`projectedAnmBillboard`、`projectedAnmGeometry`、`projectedAnmWorld`、`quantizeTouhouSpellTime`、`rgba`、`rotationMatrix`、`spawnDrops`、`stateHash`、`titleShade`、`touhouBulletCommand`、`touhouBulletInCancelCircle`、`touhouBulletInCancelRectangle`、`touhouBulletIntersectsRectangle`、`touhouCircleCollision`、`touhouCurveSample`、`touhouEffectVolume`、`touhouEnemyDeathScript`、`touhouGlyphIndex`、`touhouGroupedScore`、`touhouLaserIntersectsCircle`、`touhouMenuStyle`、`touhouMusicVolume`、`touhouShotTrajectory`、`touhouSoundPan`、`touhouStyle`、`tween`、`updateTouhouBulletCollision`、`updateTouhouLaserCollision`、`validateTouhouShots`、`wait`、`withAlpha`、`wrapTouhouDialogue` |
| [input.js](../packages/thlib/src/input.js) | `Input`、`Keys` |
| [items.js](../packages/thlib/src/items.js) | `Item`、`ItemTypes`、`spawnDrops` |
| [lasers.js](../packages/thlib/src/lasers.js) | `Laser` |
| [layered-render.js](../packages/thlib/src/layered-render.js) | `LayeredDrawQueue` |
| [math.js](../packages/thlib/src/math.js) | `Easings`、`RNG`、`TAU`、`angleTo`、`approachAngle`、`circleIntersectsRect`、`circlesOverlap`、`clamp`、`distance`、`distanceSq`、`distanceToSegmentSq`、`lerp`、`mod`、`normalizeAngle` |
| [menu.js](../packages/thlib/src/menu.js) | `Menu` |
| [patterns.js](../packages/thlib/src/patterns.js) | `Patterns` |
| [player-characters.js](../packages/thlib/src/player-characters.js) | `createPlayerCharacter` |
| [player-presentation.js](../packages/thlib/src/player-presentation.js) | `PlayerPresentation` |
| [player.js](../packages/thlib/src/player.js) | `Bomb`、`Player`、`PlayerShot`、`Weapon`、`cancelBombBeam`、`createBeamBomb`、`createOrbBomb` |
| [radial-distortion.js](../packages/thlib/src/radial-distortion.js) | `RadialDistortion` |
| [render.js](../packages/thlib/src/render.js) | `DrawList`、`rgba`、`withAlpha` |
| [repeating-input.js](../packages/thlib/src/repeating-input.js) | `RepeatingInput` |
| [replay.js](../packages/thlib/src/replay.js) | `ReplayPlayer`、`ReplayRecorder`、`SaveStore`、`stateHash` |
| [resources.js](../packages/thlib/src/resources.js) | `Resources` |
| [spell-presentation.js](../packages/thlib/src/spell-presentation.js) | `PerspectiveCamera`、`PerspectiveSprite`、`TexturedRing`、`identityPresentationMatrix`、`multiplyPresentationMatrix`、`multiplyPresentationQuaternion`、`presentationQuaternion`、`presentationWorldMatrix` |
| [sprite-atlas.js](../packages/thlib/src/sprite-atlas.js) | `SpriteAtlas`、`SpriteClip` |
| [stage.js](../packages/thlib/src/stage.js) | `Dialogue`、`Stage` |
| [task.js](../packages/thlib/src/task.js) | `TaskRunner`、`wait` |
| [touhou/anm-interpolation.js](../packages/thlib/src/touhou/anm-interpolation.js) | `AnmInterpolation`、`anmEasing` |
| [touhou/anm-projection.js](../packages/thlib/src/touhou/anm-projection.js) | `createTouhouCamera`、`identityMatrix`、`multiplyMatrix`、`projectedAnmBillboard`、`projectedAnmGeometry`、`projectedAnmWorld`、`rotationMatrix` |
| [touhou/anm-render.js](../packages/thlib/src/touhou/anm-render.js) | `anmSpriteVertices`、`drawAnm` |
| [touhou/anm-vm.js](../packages/thlib/src/touhou/anm-vm.js) | `AnmBank`、`AnmInstance`、`SUPPORTED_ANM_OPCODES`、`UnsupportedAnmError` |
| [touhou/anm.js](../packages/thlib/src/touhou/anm.js) | `AnmBank`、`AnmInstance`、`SUPPORTED_ANM_OPCODES`、`UnsupportedAnmError`、`decodeAnm` |
| [touhou/application.js](../packages/thlib/src/touhou/application.js) | `TouhouApplication` |
| [touhou/audio.js](../packages/thlib/src/touhou/audio.js) | `TouhouAudio`、`touhouEffectVolume`、`touhouMusicVolume`、`touhouSoundPan` |
| [touhou/bombs.js](../packages/thlib/src/touhou/bombs.js) | `TouhouMarisaBomb`、`TouhouReimuBomb`、`applyTouhouDamage` |
| [touhou/boss-death.js](../packages/thlib/src/touhou/boss-death.js) | `TOUHOU_BOSS_DEATH_PRESET`、`TouhouBossDeath` |
| [touhou/boss-defeat.js](../packages/thlib/src/touhou/boss-defeat.js) | `TOUHOU_BOSS_DEFEAT_PRESET`、`TouhouBossDefeat` |
| [touhou/boss-escape.js](../packages/thlib/src/touhou/boss-escape.js) | `TOUHOU_BOSS_ESCAPE_PRESET`、`TouhouBossEscape`；`TouhouGame` 提供可编排的击破事件、身体持留/恢复/移除与撤退接入 |
| [touhou/boss-phase-clear.js](../packages/thlib/src/touhou/boss-phase-clear.js) | `clearTouhouBossPhase`：停止旧攻击、半径 640 消弹、清子敌、再次消弹的普通阶段交接 |
| [touhou/boss-entrance.js](../packages/thlib/src/touhou/boss-entrance.js) | `TOUHOU_BOSS_ENTRANCE_PRESETS`、`TouhouBossEntrance` |
| [touhou/boss-hud.js](../packages/thlib/src/touhou/boss-hud.js) | `TouhouBossHud` |
| [touhou/boss-phase-plan.js](../packages/thlib/src/touhou/boss-phase-plan.js) | `TouhouBossPhasePlan` |
| [touhou/boss-phase-timeline.js](../packages/thlib/src/touhou/boss-phase-timeline.js) | `TouhouBossPhaseTimeline` |
| [touhou/boss-presentation.js](../packages/thlib/src/touhou/boss-presentation.js) | `TOUHOU_BOSS_CHARGE_PRESETS`、`TOUHOU_BOSS_PROFILES`、`TOUHOU_BOSS_SCREEN_VIEW`、`TOUHOU_BOSS_VIEW`、`TouhouBossCharge`、`TouhouBossPresentation`、`createTouhouBossAuraView` |
| [touhou/bullet-clear-wave.js](../packages/thlib/src/touhou/bullet-clear-wave.js) | `TOUHOU_BULLET_CLEAR_WAVE_PRESET`、`TouhouBulletClearWave` |
| [touhou/bullet-collision.js](../packages/thlib/src/touhou/bullet-collision.js) | `TouhouBulletCollision`、`touhouBulletInCancelCircle`、`touhouBulletInCancelRectangle`、`touhouBulletIntersectsRectangle`、`touhouCircleCollision`、`updateTouhouBulletCollision` |
| [touhou/bullet-patterns.js](../packages/thlib/src/touhou/bullet-patterns.js) | `TouhouRandom`、`touhouShotTrajectory`、`touhouStyle` |
| [touhou/bullet-presentation.js](../packages/thlib/src/touhou/bullet-presentation.js) | `TouhouBulletBirth`、`TouhouBulletPresentation`、`configureTouhouBulletBirth`、`createTouhouBulletAnimation`、`createTouhouBulletCancelAnimation`、`drawTouhouBulletBody` |
| [touhou/bullet-style-data.js](../packages/thlib/src/touhou/bullet-style-data.js) | `TOUHOU_BULLET_STYLES` |
| [touhou/bullets.js](../packages/thlib/src/touhou/bullets.js) | `SUPPORTED_TOUHOU_BULLET_COMMANDS`、`TouhouBulletField`、`touhouBulletCommand` |
| [touhou/converging-particles.js](../packages/thlib/src/touhou/converging-particles.js) | `TouhouConvergingParticles`、`createTouhouAttachedEffect` |
| [touhou/damage.js](../packages/thlib/src/touhou/damage.js) | `TouhouDamageAccumulator`、`TouhouHealth`、`applyTouhouEnemyDamage` |
| [touhou/dialogue.js](../packages/thlib/src/touhou/dialogue.js) | `TOUHOU_DIALOGUE_ENTRANCE_PRESETS`、`TOUHOU_DIALOGUE_EXIT_PRESETS`、`TOUHOU_DIALOGUE_EXPRESSIONS`、`TOUHOU_DIALOGUE_PORTRAITS`、`TOUHOU_DIALOGUE_PRESETS`、`TouhouDialogue`、`wrapTouhouDialogue` |
| [touhou/distortion.js](../packages/thlib/src/touhou/distortion.js) | `TouhouEnemyDistortion`、`TouhouRenderMesh`、`TouhouStageDistortion`、`argbToRgba` |
| [touhou/enemy.js](../packages/thlib/src/touhou/enemy.js) | `TouhouEnemy`、`TouhouMotion`、`touhouEnemyDeathScript` |
| [touhou/font.js](../packages/thlib/src/touhou/font.js) | `TouhouBitmapFont`、`touhouGlyphIndex`、`touhouGroupedScore` |
| [touhou/game-over.js](../packages/thlib/src/touhou/game-over.js) | `TOUHOU_INITIAL_CREDITS`、`TOUHOU_NAME_CHARACTERS`、`TouhouGameOver`、`continueTouhouGame`、`insertTouhouHighScore` |
| [touhou/game.js](../packages/thlib/src/touhou/game.js) | `TOUHOU_GAME_VIEW`、`TOUHOU_VIEWPORT`、`TouhouGame` |
| [touhou/gameplay-compositor.js](../packages/thlib/src/touhou/gameplay-compositor.js) | `TouhouGameplayCompositor` |
| [touhou/hud.js](../packages/thlib/src/touhou/hud.js) | `TouhouHud` |
| [touhou/index.js](../packages/thlib/src/touhou/index.js) | `AnmBank`、`AnmInstance`、`AnmInterpolation`、`SUPPORTED_ANM_OPCODES`、`SUPPORTED_TOUHOU_BULLET_COMMANDS`、`TOUHOU_BOSS_CHARGE_PRESETS`、`TOUHOU_BOSS_DEATH_PRESET`、`TOUHOU_BOSS_DEFEAT_PRESET`、`TOUHOU_BOSS_ESCAPE_PRESET`、`TOUHOU_BOSS_ENTRANCE_PRESETS`、`TOUHOU_BOSS_PROFILES`、`TOUHOU_BOSS_SCREEN_VIEW`、`TOUHOU_BOSS_VIEW`、`TOUHOU_BULLET_CLEAR_WAVE_PRESET`、`TOUHOU_BULLET_PRESETS`、`TOUHOU_BULLET_STYLES`、`TOUHOU_DIALOGUE_ENTRANCE_PRESETS`、`TOUHOU_DIALOGUE_EXIT_PRESETS`、`TOUHOU_DIALOGUE_EXPRESSIONS`、`TOUHOU_DIALOGUE_PORTRAITS`、`TOUHOU_DIALOGUE_PRESETS`、`TOUHOU_EFFECT_PRESETS`、`TOUHOU_ENEMY_PRESETS`、`TOUHOU_GAME_VIEW`、`TOUHOU_INITIAL_CREDITS`、`TOUHOU_LAYER_PRIORITIES`、`TOUHOU_MAIN_LABELS`、`TOUHOU_MUSIC_CAPTION_VIEW`、`TOUHOU_NAME_CHARACTERS`、`TOUHOU_OWNER_PRIORITIES`、`TOUHOU_PLAYER_DATA`、`TOUHOU_PLAYER_PRESETS`、`TOUHOU_RESOURCE_BANKS`、`TOUHOU_STAGE_CLEAR_PRESET`、`TOUHOU_STAGE_TRANSITION_PRESET`、`TOUHOU_VIEWPORT`、`TouhouApplication`、`TouhouAudio`、`TouhouBitmapFont`、`TouhouBossCharge`、`TouhouBossDeath`、`TouhouBossDefeat`、`TouhouBossEscape`、`TouhouBossEntrance`、`TouhouBossHud`、`TouhouBossPhasePlan`、`TouhouBossPhaseTimeline`、`TouhouBossPresentation`、`TouhouBulletBirth`、`TouhouBulletClearWave`、`TouhouBulletCollision`、`TouhouBulletField`、`TouhouBulletPresentation`、`TouhouButtons`、`TouhouConvergingParticles`、`TouhouDamageAccumulator`、`TouhouDialogue`、`TouhouEffectPreset`、`TouhouEnemy`、`TouhouEnemyDistortion`、`TouhouGame`、`TouhouGameOver`、`TouhouGameplayCompositor`、`TouhouGrazeEffects`、`TouhouHealth`、`TouhouHud`、`TouhouItemType`、`TouhouItems`、`TouhouLaserField`、`TouhouMarisaBomb`、`TouhouMotion`、`TouhouMusicCaption`、`TouhouMusicFade`、`TouhouPause`、`TouhouPauseCapture`、`TouhouPlayer`、`TouhouRNG`、`TouhouRandom`、`TouhouReimuBomb`、`TouhouRenderMesh`、`TouhouRenderQueue`、`TouhouSceneTransition`、`TouhouScreenShake`、`TouhouShortLine`、`TouhouShot`、`TouhouSpell`、`TouhouStageClear`、`TouhouStageDistortion`、`TouhouStageSelect`、`TouhouStageTransition`、`TouhouTextRenderer`、`TouhouTimer`、`TouhouTitleBackground`、`TouhouTitleMenu`、`UnsupportedAnmError`、`anmDrawPriority`、`anmEasing`、`anmSpriteVertices`、`applyPauseNoise`、`applyTouhouDamage`、`applyTouhouEnemyDamage`、`argbToRgba`、`cancelTouhouLaser`、`configureTouhouBulletBirth`、`continueTouhouGame`、`copyPauseSurface`、`createTouhouAttachedEffect`、`createTouhouBossAuraView`、`createTouhouBulletAnimation`、`createTouhouBulletCancelAnimation`、`createTouhouCamera`、`createTouhouLaserCollisionState`、`createTouhouLaserOrigin`、`createTouhouPrefabCatalog`、`createTouhouResources`、`decodeAnm`、`drawAnm`、`drawTouhouBulletBody`、`effectiveAnmLayer`、`encodeTouhouSpellTime`、`eraseTouhouLaser`、`fireTouhouPattern`、`getTouhouLaserCollisionSegments`、`getTouhouPlayerData`、`identityMatrix`、`insertTouhouHighScore`、`invalidTouhouSpellTime`、`multiplyMatrix`、`nextRawPauseRandom`、`outlineTouhouTextBitmap`、`projectedAnmBillboard`、`projectedAnmGeometry`、`projectedAnmWorld`、`quantizeTouhouSpellTime`、`rotationMatrix`、`titleShade`、`touhouBulletCommand`、`touhouBulletInCancelCircle`、`touhouBulletInCancelRectangle`、`touhouBulletIntersectsRectangle`、`touhouCircleCollision`、`touhouCurveSample`、`touhouEffectVolume`、`touhouEnemyDeathScript`、`touhouGlyphIndex`、`touhouGroupedScore`、`touhouLaserIntersectsCircle`、`touhouMenuStyle`、`touhouMusicVolume`、`touhouShotTrajectory`、`touhouSoundPan`、`touhouStyle`、`updateTouhouBulletCollision`、`updateTouhouLaserCollision`、`validateTouhouShots`、`wrapTouhouDialogue` |
| [touhou/items.js](../packages/thlib/src/touhou/items.js) | `TouhouItemType`、`TouhouItems` |
| [touhou/laser-cancellation.js](../packages/thlib/src/touhou/laser-cancellation.js) | `cancelTouhouLaser`、`eraseTouhouLaser` |
| [touhou/laser-collision.js](../packages/thlib/src/touhou/laser-collision.js) | `createTouhouLaserCollisionState`、`getTouhouLaserCollisionSegments`、`touhouLaserIntersectsCircle`、`updateTouhouLaserCollision` |
| [touhou/lasers.js](../packages/thlib/src/touhou/lasers.js) | `TouhouLaserField`、`createTouhouLaserOrigin`、`touhouCurveSample` |
| [touhou/math.js](../packages/thlib/src/touhou/math.js) | `PI`、`TouhouRNG`、`TouhouTimer`、`add`、`angleDifference`、`atan2`、`cos`、`div`、`f32`、`mul`、`polar`、`rectangleCircle`、`rotate`、`sin`、`snap`、`sqrt`、`sub`、`trunc32`、`wrapAngle` |
| [touhou/menu.js](../packages/thlib/src/touhou/menu.js) | `TOUHOU_MAIN_LABELS`、`TouhouButtons`、`TouhouTitleMenu`、`touhouMenuStyle` |
| [touhou/music-caption.js](../packages/thlib/src/touhou/music-caption.js) | `TOUHOU_MUSIC_CAPTION_VIEW`、`TouhouMusicCaption` |
| [touhou/music-fade.js](../packages/thlib/src/touhou/music-fade.js) | `TouhouMusicFade` |
| [touhou/pause-capture.js](../packages/thlib/src/touhou/pause-capture.js) | `TouhouPauseCapture`、`applyPauseNoise`、`copyPauseSurface`、`nextRawPauseRandom` |
| [touhou/pause.js](../packages/thlib/src/touhou/pause.js) | `TouhouPause` |
| [touhou/player-data.js](../packages/thlib/src/touhou/player-data.js) | `TOUHOU_PLAYER_DATA`、`getTouhouPlayerData` |
| [touhou/player.js](../packages/thlib/src/touhou/player.js) | `TouhouPlayer` |
| [touhou/prefabs.js](../packages/thlib/src/touhou/prefabs.js) | `TOUHOU_BULLET_PRESETS`、`TOUHOU_EFFECT_PRESETS`、`TOUHOU_ENEMY_PRESETS`、`TOUHOU_PLAYER_PRESETS`、`TouhouEffectPreset`、`createTouhouPrefabCatalog` |
| [touhou/render-order.js](../packages/thlib/src/touhou/render-order.js) | `TOUHOU_LAYER_PRIORITIES`、`TOUHOU_OWNER_PRIORITIES`、`anmDrawPriority`、`effectiveAnmLayer` |
| [touhou/render-queue.js](../packages/thlib/src/touhou/render-queue.js) | `TOUHOU_LAYER_PRIORITIES`、`TOUHOU_OWNER_PRIORITIES`、`TouhouRenderQueue`、`anmDrawPriority`、`effectiveAnmLayer` |
| [touhou/resources.js](../packages/thlib/src/touhou/resources.js) | `TOUHOU_RESOURCE_BANKS`、`createTouhouResources` |
| [touhou/scene-transition.js](../packages/thlib/src/touhou/scene-transition.js) | `TouhouSceneTransition` |
| [touhou/screen-shake.js](../packages/thlib/src/touhou/screen-shake.js) | `TouhouScreenShake` |
| [touhou/short-line.js](../packages/thlib/src/touhou/short-line.js) | `TouhouGrazeEffects`、`TouhouShortLine` |
| [touhou/shot-data.js](../packages/thlib/src/touhou/shot-data.js) | `validateTouhouShots` |
| [touhou/shots.js](../packages/thlib/src/touhou/shots.js) | `TouhouShot`、`fireTouhouPattern` |
| [touhou/spell.js](../packages/thlib/src/touhou/spell.js) | `TouhouSpell`、`encodeTouhouSpellTime`、`invalidTouhouSpellTime`、`quantizeTouhouSpellTime` |
| [touhou/stage-clear.js](../packages/thlib/src/touhou/stage-clear.js) | `TOUHOU_STAGE_CLEAR_PRESET`、`TouhouStageClear` |
| [touhou/stage-selection.js](../packages/thlib/src/touhou/stage-selection.js) | `TouhouStageSelect` |
| [touhou/stage-transition.js](../packages/thlib/src/touhou/stage-transition.js) | `TOUHOU_STAGE_TRANSITION_PRESET`、`TouhouStageTransition` |
| [touhou/text-renderer.js](../packages/thlib/src/touhou/text-renderer.js) | `TouhouTextRenderer`、`outlineTouhouTextBitmap` |
| [touhou/title-background.js](../packages/thlib/src/touhou/title-background.js) | `TouhouTitleBackground`、`titleShade` |
| [world.js](../packages/thlib/src/world.js) | `Entity`、`SpatialHash`、`World` |

## 全部实际素材文件

### assets根目录

- [README.md](../packages/thlib/assets/README.md)
- [TOUHOU-COMMON.md](../packages/thlib/assets/TOUHOU-COMMON.md)
- [manifest.json](../packages/thlib/assets/manifest.json)

### audio/

- [audio/bomb.wav](../packages/thlib/assets/audio/bomb.wav)
- [audio/graze.wav](../packages/thlib/assets/audio/graze.wav)
- [audio/hit.wav](../packages/thlib/assets/audio/hit.wav)
- [audio/pickup.wav](../packages/thlib/assets/audio/pickup.wav)
- [audio/select.wav](../packages/thlib/assets/audio/select.wav)
- [audio/shot.wav](../packages/thlib/assets/audio/shot.wav)

### reference-common/

- [reference-common/NOTICE.md](../packages/thlib/assets/reference-common/NOTICE.md)
- [reference-common/manifest.json](../packages/thlib/assets/reference-common/manifest.json)
- [reference-common/textures/bomb-beam-shell.png](../packages/thlib/assets/reference-common/textures/bomb-beam-shell.png)
- [reference-common/textures/bomb-beam.png](../packages/thlib/assets/reference-common/textures/bomb-beam.png)
- [reference-common/textures/bomb-orb.png](../packages/thlib/assets/reference-common/textures/bomb-orb.png)
- [reference-common/textures/bomb-radiant-orb.png](../packages/thlib/assets/reference-common/textures/bomb-radiant-orb.png)
- [reference-common/textures/bullet-cancel.png](../packages/thlib/assets/reference-common/textures/bullet-cancel.png)
- [reference-common/textures/bullet-large-orb.png](../packages/thlib/assets/reference-common/textures/bullet-large-orb.png)
- [reference-common/textures/bullet-medium.png](../packages/thlib/assets/reference-common/textures/bullet-medium.png)
- [reference-common/textures/bullet-note-lightning.png](../packages/thlib/assets/reference-common/textures/bullet-note-lightning.png)
- [reference-common/textures/bullet-patterned-orb.png](../packages/thlib/assets/reference-common/textures/bullet-patterned-orb.png)
- [reference-common/textures/bullet-small.png](../packages/thlib/assets/reference-common/textures/bullet-small.png)
- [reference-common/textures/effect-aura.png](../packages/thlib/assets/reference-common/textures/effect-aura.png)
- [reference-common/textures/effect-base.png](../packages/thlib/assets/reference-common/textures/effect-base.png)
- [reference-common/textures/effect-break-wave-round.png](../packages/thlib/assets/reference-common/textures/effect-break-wave-round.png)
- [reference-common/textures/effect-break-wave-wide.png](../packages/thlib/assets/reference-common/textures/effect-break-wave-wide.png)
- [reference-common/textures/effect-charge.png](../packages/thlib/assets/reference-common/textures/effect-charge.png)
- [reference-common/textures/effect-death-ring.png](../packages/thlib/assets/reference-common/textures/effect-death-ring.png)
- [reference-common/textures/effect-focus.png](../packages/thlib/assets/reference-common/textures/effect-focus.png)
- [reference-common/textures/effect-magic-circle.png](../packages/thlib/assets/reference-common/textures/effect-magic-circle.png)
- [reference-common/textures/effect-petals.png](../packages/thlib/assets/reference-common/textures/effect-petals.png)
- [reference-common/textures/effect-splash.png](../packages/thlib/assets/reference-common/textures/effect-splash.png)
- [reference-common/textures/effect-trail.png](../packages/thlib/assets/reference-common/textures/effect-trail.png)
- [reference-common/textures/laser-flowing.png](../packages/thlib/assets/reference-common/textures/laser-flowing.png)
- [reference-common/textures/laser-straight.png](../packages/thlib/assets/reference-common/textures/laser-straight.png)

### spell-common/

- [spell-common/NOTICE.md](../packages/thlib/assets/spell-common/NOTICE.md)
- [spell-common/manifest.json](../packages/thlib/assets/spell-common/manifest.json)
- [spell-common/textures/legacy-aura.png](../packages/thlib/assets/spell-common/textures/legacy-aura.png)
- [spell-common/textures/legacy-petals.png](../packages/thlib/assets/spell-common/textures/legacy-petals.png)
- [spell-common/textures/spell-line.png](../packages/thlib/assets/spell-common/textures/spell-line.png)

### touhou-common/

- [touhou-common/NOTICE.md](../packages/thlib/assets/touhou-common/NOTICE.md)
- [touhou-common/anm/ascii_960.json](../packages/thlib/assets/touhou-common/anm/ascii_960.json)
- [touhou-common/anm/bullet.json](../packages/thlib/assets/touhou-common/anm/bullet.json)
- [touhou-common/anm/effect.json](../packages/thlib/assets/touhou-common/anm/effect.json)
- [touhou-common/anm/enemy.json](../packages/thlib/assets/touhou-common/anm/enemy.json)
- [touhou-common/anm/front.json](../packages/thlib/assets/touhou-common/anm/front.json)
- [touhou-common/anm/pl00.json](../packages/thlib/assets/touhou-common/anm/pl00.json)
- [touhou-common/anm/pl01.json](../packages/thlib/assets/touhou-common/anm/pl01.json)
- [touhou-common/anm/screenswitch.json](../packages/thlib/assets/touhou-common/anm/screenswitch.json)
- [touhou-common/anm/text.json](../packages/thlib/assets/touhou-common/anm/text.json)
- [touhou-common/anm/title.json](../packages/thlib/assets/touhou-common/anm/title.json)
- [touhou-common/audio/manifest.json](../packages/thlib/assets/touhou-common/audio/manifest.json)
- [touhou-common/audio/se_bonus.wav](../packages/thlib/assets/touhou-common/audio/se_bonus.wav)
- [touhou-common/audio/se_bonus2.wav](../packages/thlib/assets/touhou-common/audio/se_bonus2.wav)
- [touhou-common/audio/se_bonus4.wav](../packages/thlib/assets/touhou-common/audio/se_bonus4.wav)
- [touhou-common/audio/se_boon00.wav](../packages/thlib/assets/touhou-common/audio/se_boon00.wav)
- [touhou-common/audio/se_boon01.wav](../packages/thlib/assets/touhou-common/audio/se_boon01.wav)
- [touhou-common/audio/se_cancel00.wav](../packages/thlib/assets/touhou-common/audio/se_cancel00.wav)
- [touhou-common/audio/se_cardget.wav](../packages/thlib/assets/touhou-common/audio/se_cardget.wav)
- [touhou-common/audio/se_cat00.wav](../packages/thlib/assets/touhou-common/audio/se_cat00.wav)
- [touhou-common/audio/se_ch00.wav](../packages/thlib/assets/touhou-common/audio/se_ch00.wav)
- [touhou-common/audio/se_ch01.wav](../packages/thlib/assets/touhou-common/audio/se_ch01.wav)
- [touhou-common/audio/se_ch02.wav](../packages/thlib/assets/touhou-common/audio/se_ch02.wav)
- [touhou-common/audio/se_ch03.wav](../packages/thlib/assets/touhou-common/audio/se_ch03.wav)
- [touhou-common/audio/se_damage00.wav](../packages/thlib/assets/touhou-common/audio/se_damage00.wav)
- [touhou-common/audio/se_damage01.wav](../packages/thlib/assets/touhou-common/audio/se_damage01.wav)
- [touhou-common/audio/se_don00.wav](../packages/thlib/assets/touhou-common/audio/se_don00.wav)
- [touhou-common/audio/se_enep00.wav](../packages/thlib/assets/touhou-common/audio/se_enep00.wav)
- [touhou-common/audio/se_enep01.wav](../packages/thlib/assets/touhou-common/audio/se_enep01.wav)
- [touhou-common/audio/se_enep02.wav](../packages/thlib/assets/touhou-common/audio/se_enep02.wav)
- [touhou-common/audio/se_etbreak.wav](../packages/thlib/assets/touhou-common/audio/se_etbreak.wav)
- [touhou-common/audio/se_extend.wav](../packages/thlib/assets/touhou-common/audio/se_extend.wav)
- [touhou-common/audio/se_extend2.wav](../packages/thlib/assets/touhou-common/audio/se_extend2.wav)
- [touhou-common/audio/se_fault.wav](../packages/thlib/assets/touhou-common/audio/se_fault.wav)
- [touhou-common/audio/se_graze.wav](../packages/thlib/assets/touhou-common/audio/se_graze.wav)
- [touhou-common/audio/se_gun00.wav](../packages/thlib/assets/touhou-common/audio/se_gun00.wav)
- [touhou-common/audio/se_invalid.wav](../packages/thlib/assets/touhou-common/audio/se_invalid.wav)
- [touhou-common/audio/se_item00.wav](../packages/thlib/assets/touhou-common/audio/se_item00.wav)
- [touhou-common/audio/se_kira00.wav](../packages/thlib/assets/touhou-common/audio/se_kira00.wav)
- [touhou-common/audio/se_kira01.wav](../packages/thlib/assets/touhou-common/audio/se_kira01.wav)
- [touhou-common/audio/se_kira02.wav](../packages/thlib/assets/touhou-common/audio/se_kira02.wav)
- [touhou-common/audio/se_lazer00.wav](../packages/thlib/assets/touhou-common/audio/se_lazer00.wav)
- [touhou-common/audio/se_lazer01.wav](../packages/thlib/assets/touhou-common/audio/se_lazer01.wav)
- [touhou-common/audio/se_lazer02.wav](../packages/thlib/assets/touhou-common/audio/se_lazer02.wav)
- [touhou-common/audio/se_nep00.wav](../packages/thlib/assets/touhou-common/audio/se_nep00.wav)
- [touhou-common/audio/se_nodamage.wav](../packages/thlib/assets/touhou-common/audio/se_nodamage.wav)
- [touhou-common/audio/se_ok00.wav](../packages/thlib/assets/touhou-common/audio/se_ok00.wav)
- [touhou-common/audio/se_pause.wav](../packages/thlib/assets/touhou-common/audio/se_pause.wav)
- [touhou-common/audio/se_pin00.wav](../packages/thlib/assets/touhou-common/audio/se_pin00.wav)
- [touhou-common/audio/se_pin01.wav](../packages/thlib/assets/touhou-common/audio/se_pin01.wav)
- [touhou-common/audio/se_pldead00.wav](../packages/thlib/assets/touhou-common/audio/se_pldead00.wav)
- [touhou-common/audio/se_plst00.wav](../packages/thlib/assets/touhou-common/audio/se_plst00.wav)
- [touhou-common/audio/se_power0.wav](../packages/thlib/assets/touhou-common/audio/se_power0.wav)
- [touhou-common/audio/se_power1.wav](../packages/thlib/assets/touhou-common/audio/se_power1.wav)
- [touhou-common/audio/se_powerup.wav](../packages/thlib/assets/touhou-common/audio/se_powerup.wav)
- [touhou-common/audio/se_select00.wav](../packages/thlib/assets/touhou-common/audio/se_select00.wav)
- [touhou-common/audio/se_slash.wav](../packages/thlib/assets/touhou-common/audio/se_slash.wav)
- [touhou-common/audio/se_tan00.wav](../packages/thlib/assets/touhou-common/audio/se_tan00.wav)
- [touhou-common/audio/se_tan01.wav](../packages/thlib/assets/touhou-common/audio/se_tan01.wav)
- [touhou-common/audio/se_tan02.wav](../packages/thlib/assets/touhou-common/audio/se_tan02.wav)
- [touhou-common/audio/se_tan03.wav](../packages/thlib/assets/touhou-common/audio/se_tan03.wav)
- [touhou-common/audio/se_timeout.wav](../packages/thlib/assets/touhou-common/audio/se_timeout.wav)
- [touhou-common/audio/se_timeout2.wav](../packages/thlib/assets/touhou-common/audio/se_timeout2.wav)
- [touhou-common/bullet-styles.json](../packages/thlib/assets/touhou-common/bullet-styles.json)
- [touhou-common/manifest.json](../packages/thlib/assets/touhou-common/manifest.json)
- [touhou-common/prefabs.json](../packages/thlib/assets/touhou-common/prefabs.json)
- [touhou-common/shots/pl00.json](../packages/thlib/assets/touhou-common/shots/pl00.json)
- [touhou-common/shots/pl01.json](../packages/thlib/assets/touhou-common/shots/pl01.json)
- [touhou-common/textures/ascii_960/entry-0.png](../packages/thlib/assets/touhou-common/textures/ascii_960/entry-0.png)
- [touhou-common/textures/ascii_960/entry-1.png](../packages/thlib/assets/touhou-common/textures/ascii_960/entry-1.png)
- [touhou-common/textures/ascii_960/entry-2.png](../packages/thlib/assets/touhou-common/textures/ascii_960/entry-2.png)
- [touhou-common/textures/ascii_960/entry-3.png](../packages/thlib/assets/touhou-common/textures/ascii_960/entry-3.png)
- [touhou-common/textures/ascii_960/entry-4.png](../packages/thlib/assets/touhou-common/textures/ascii_960/entry-4.png)
- [touhou-common/textures/ascii_960/entry-5.png](../packages/thlib/assets/touhou-common/textures/ascii_960/entry-5.png)
- [touhou-common/textures/ascii_960/entry-6.png](../packages/thlib/assets/touhou-common/textures/ascii_960/entry-6.png)
- [touhou-common/textures/ascii_960/entry-7.png](../packages/thlib/assets/touhou-common/textures/ascii_960/entry-7.png)
- [touhou-common/textures/bullet/entry-0.png](../packages/thlib/assets/touhou-common/textures/bullet/entry-0.png)
- [touhou-common/textures/bullet/entry-1.png](../packages/thlib/assets/touhou-common/textures/bullet/entry-1.png)
- [touhou-common/textures/bullet/entry-2.png](../packages/thlib/assets/touhou-common/textures/bullet/entry-2.png)
- [touhou-common/textures/bullet/entry-3.png](../packages/thlib/assets/touhou-common/textures/bullet/entry-3.png)
- [touhou-common/textures/bullet/entry-4.png](../packages/thlib/assets/touhou-common/textures/bullet/entry-4.png)
- [touhou-common/textures/bullet/entry-5.png](../packages/thlib/assets/touhou-common/textures/bullet/entry-5.png)
- [touhou-common/textures/bullet/entry-6.png](../packages/thlib/assets/touhou-common/textures/bullet/entry-6.png)
- [touhou-common/textures/bullet/entry-7.png](../packages/thlib/assets/touhou-common/textures/bullet/entry-7.png)
- [touhou-common/textures/bullet/entry-8.png](../packages/thlib/assets/touhou-common/textures/bullet/entry-8.png)
- [touhou-common/textures/bullet/entry-9.png](../packages/thlib/assets/touhou-common/textures/bullet/entry-9.png)
- [touhou-common/textures/effect/entry-1.png](../packages/thlib/assets/touhou-common/textures/effect/entry-1.png)
- [touhou-common/textures/effect/entry-10.png](../packages/thlib/assets/touhou-common/textures/effect/entry-10.png)
- [touhou-common/textures/effect/entry-11.png](../packages/thlib/assets/touhou-common/textures/effect/entry-11.png)
- [touhou-common/textures/effect/entry-12.png](../packages/thlib/assets/touhou-common/textures/effect/entry-12.png)
- [touhou-common/textures/effect/entry-2.png](../packages/thlib/assets/touhou-common/textures/effect/entry-2.png)
- [touhou-common/textures/effect/entry-3.png](../packages/thlib/assets/touhou-common/textures/effect/entry-3.png)
- [touhou-common/textures/effect/entry-4.png](../packages/thlib/assets/touhou-common/textures/effect/entry-4.png)
- [touhou-common/textures/effect/entry-5.png](../packages/thlib/assets/touhou-common/textures/effect/entry-5.png)
- [touhou-common/textures/effect/entry-6.png](../packages/thlib/assets/touhou-common/textures/effect/entry-6.png)
- [touhou-common/textures/effect/entry-7.png](../packages/thlib/assets/touhou-common/textures/effect/entry-7.png)
- [touhou-common/textures/effect/entry-8.png](../packages/thlib/assets/touhou-common/textures/effect/entry-8.png)
- [touhou-common/textures/effect/entry-9.png](../packages/thlib/assets/touhou-common/textures/effect/entry-9.png)
- [touhou-common/textures/enemy/entry-0.png](../packages/thlib/assets/touhou-common/textures/enemy/entry-0.png)
- [touhou-common/textures/enemy/entry-1.png](../packages/thlib/assets/touhou-common/textures/enemy/entry-1.png)
- [touhou-common/textures/enemy/entry-2.png](../packages/thlib/assets/touhou-common/textures/enemy/entry-2.png)
- [touhou-common/textures/enemy/entry-3.png](../packages/thlib/assets/touhou-common/textures/enemy/entry-3.png)
- [touhou-common/textures/enemy/entry-4.png](../packages/thlib/assets/touhou-common/textures/enemy/entry-4.png)
- [touhou-common/textures/enemy/entry-5.png](../packages/thlib/assets/touhou-common/textures/enemy/entry-5.png)
- [touhou-common/textures/enemy/entry-6.png](../packages/thlib/assets/touhou-common/textures/enemy/entry-6.png)
- [touhou-common/textures/front/entry-0.png](../packages/thlib/assets/touhou-common/textures/front/entry-0.png)
- [touhou-common/textures/front/entry-10.png](../packages/thlib/assets/touhou-common/textures/front/entry-10.png)
- [touhou-common/textures/front/entry-11.png](../packages/thlib/assets/touhou-common/textures/front/entry-11.png)
- [touhou-common/textures/front/entry-2.png](../packages/thlib/assets/touhou-common/textures/front/entry-2.png)
- [touhou-common/textures/front/entry-3.png](../packages/thlib/assets/touhou-common/textures/front/entry-3.png)
- [touhou-common/textures/front/entry-4.png](../packages/thlib/assets/touhou-common/textures/front/entry-4.png)
- [touhou-common/textures/front/entry-5.png](../packages/thlib/assets/touhou-common/textures/front/entry-5.png)
- [touhou-common/textures/front/entry-7.png](../packages/thlib/assets/touhou-common/textures/front/entry-7.png)
- [touhou-common/textures/front/entry-8.png](../packages/thlib/assets/touhou-common/textures/front/entry-8.png)
- [touhou-common/textures/front/entry-9.png](../packages/thlib/assets/touhou-common/textures/front/entry-9.png)
- [touhou-common/textures/pl00/entry-0.png](../packages/thlib/assets/touhou-common/textures/pl00/entry-0.png)
- [touhou-common/textures/pl00/entry-1.png](../packages/thlib/assets/touhou-common/textures/pl00/entry-1.png)
- [touhou-common/textures/pl00/entry-10.png](../packages/thlib/assets/touhou-common/textures/pl00/entry-10.png)
- [touhou-common/textures/pl00/entry-11.png](../packages/thlib/assets/touhou-common/textures/pl00/entry-11.png)
- [touhou-common/textures/pl00/entry-2.png](../packages/thlib/assets/touhou-common/textures/pl00/entry-2.png)
- [touhou-common/textures/pl00/entry-24.png](../packages/thlib/assets/touhou-common/textures/pl00/entry-24.png)
- [touhou-common/textures/pl00/entry-3.png](../packages/thlib/assets/touhou-common/textures/pl00/entry-3.png)
- [touhou-common/textures/pl00/entry-4.png](../packages/thlib/assets/touhou-common/textures/pl00/entry-4.png)
- [touhou-common/textures/pl00/entry-5.png](../packages/thlib/assets/touhou-common/textures/pl00/entry-5.png)
- [touhou-common/textures/pl00/entry-6.png](../packages/thlib/assets/touhou-common/textures/pl00/entry-6.png)
- [touhou-common/textures/pl00/entry-7.png](../packages/thlib/assets/touhou-common/textures/pl00/entry-7.png)
- [touhou-common/textures/pl00/entry-8.png](../packages/thlib/assets/touhou-common/textures/pl00/entry-8.png)
- [touhou-common/textures/pl00/entry-9.png](../packages/thlib/assets/touhou-common/textures/pl00/entry-9.png)
- [touhou-common/textures/pl01/entry-0.png](../packages/thlib/assets/touhou-common/textures/pl01/entry-0.png)
- [touhou-common/textures/pl01/entry-1.png](../packages/thlib/assets/touhou-common/textures/pl01/entry-1.png)
- [touhou-common/textures/pl01/entry-10.png](../packages/thlib/assets/touhou-common/textures/pl01/entry-10.png)
- [touhou-common/textures/pl01/entry-11.png](../packages/thlib/assets/touhou-common/textures/pl01/entry-11.png)
- [touhou-common/textures/pl01/entry-12.png](../packages/thlib/assets/touhou-common/textures/pl01/entry-12.png)
- [touhou-common/textures/pl01/entry-13.png](../packages/thlib/assets/touhou-common/textures/pl01/entry-13.png)
- [touhou-common/textures/pl01/entry-2.png](../packages/thlib/assets/touhou-common/textures/pl01/entry-2.png)
- [touhou-common/textures/pl01/entry-26.png](../packages/thlib/assets/touhou-common/textures/pl01/entry-26.png)
- [touhou-common/textures/pl01/entry-3.png](../packages/thlib/assets/touhou-common/textures/pl01/entry-3.png)
- [touhou-common/textures/pl01/entry-5.png](../packages/thlib/assets/touhou-common/textures/pl01/entry-5.png)
- [touhou-common/textures/pl01/entry-6.png](../packages/thlib/assets/touhou-common/textures/pl01/entry-6.png)
- [touhou-common/textures/pl01/entry-7.png](../packages/thlib/assets/touhou-common/textures/pl01/entry-7.png)
- [touhou-common/textures/pl01/entry-8.png](../packages/thlib/assets/touhou-common/textures/pl01/entry-8.png)
- [touhou-common/textures/pl01/entry-9.png](../packages/thlib/assets/touhou-common/textures/pl01/entry-9.png)
- [touhou-common/textures/screenswitch/entry-0.png](../packages/thlib/assets/touhou-common/textures/screenswitch/entry-0.png)
- [touhou-common/textures/screenswitch/entry-1.png](../packages/thlib/assets/touhou-common/textures/screenswitch/entry-1.png)
- [touhou-common/textures/title/entry-10.png](../packages/thlib/assets/touhou-common/textures/title/entry-10.png)
- [touhou-common/textures/title/entry-11.png](../packages/thlib/assets/touhou-common/textures/title/entry-11.png)
- [touhou-common/textures/title/entry-12.png](../packages/thlib/assets/touhou-common/textures/title/entry-12.png)
- [touhou-common/textures/title/entry-13.png](../packages/thlib/assets/touhou-common/textures/title/entry-13.png)
- [touhou-common/textures/title/entry-14.png](../packages/thlib/assets/touhou-common/textures/title/entry-14.png)
- [touhou-common/textures/title/entry-15.png](../packages/thlib/assets/touhou-common/textures/title/entry-15.png)
- [touhou-common/textures/title/entry-16.png](../packages/thlib/assets/touhou-common/textures/title/entry-16.png)
- [touhou-common/textures/title/entry-17.png](../packages/thlib/assets/touhou-common/textures/title/entry-17.png)
- [touhou-common/textures/title/entry-18.png](../packages/thlib/assets/touhou-common/textures/title/entry-18.png)
- [touhou-common/textures/title/entry-23.png](../packages/thlib/assets/touhou-common/textures/title/entry-23.png)
- [touhou-common/textures/title/entry-28.png](../packages/thlib/assets/touhou-common/textures/title/entry-28.png)
- [touhou-common/textures/title/entry-29.png](../packages/thlib/assets/touhou-common/textures/title/entry-29.png)
- [touhou-common/textures/title/entry-4.png](../packages/thlib/assets/touhou-common/textures/title/entry-4.png)
- [touhou-common/textures/title/entry-5.png](../packages/thlib/assets/touhou-common/textures/title/entry-5.png)
- [touhou-common/textures/title/entry-6.png](../packages/thlib/assets/touhou-common/textures/title/entry-6.png)
- [touhou-common/textures/title/entry-7.png](../packages/thlib/assets/touhou-common/textures/title/entry-7.png)
- [touhou-common/textures/title/entry-8.png](../packages/thlib/assets/touhou-common/textures/title/entry-8.png)
- [touhou-common/textures/title/entry-9.png](../packages/thlib/assets/touhou-common/textures/title/entry-9.png)
