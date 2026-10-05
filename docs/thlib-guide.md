# thlib 使用方式

## 分层

thlib 包含完整的通用应用框架、还原的通用角色、特效与素材。灵梦、魔理沙的基础自机、普通武器、Bomb、判定点、弹幕、小怪、原作 Boss 出场光圈、背景扭曲、倒计时、符卡宣言、游戏边框、HUD、主菜单流程、暂停和续关界面都在 thlib。锦上京的魔石变体、具体 Boss 及招式、标题 Logo 和专属插画、关卡背景、曲目与具体关卡留在业务层。通用界面布局也有默认预设，并允许自定义。

`@ts-stg/thlib/touhou` 提供此前在 touhou20 demo 中实现的还原模块，也从包根导出。它们保留原来的射击记录、逐帧状态机、浮点运算和动画解释器；两个 demo 调用的是同一个 `TouhouPlayer`、`TouhouShot` 和 Bomb 类。touhou20 中的旧类名只是兼容转发。这里没有依赖 `games/`。

两名自机的 Bomb 退场由公共 owner 和原 ANM 子动画共同完成，伤害寿命与视觉尾分别管理。生命周期与原作参考见 [灵梦法球](touhou-reimu-bomb-release.md) 和 [魔理沙魔炮](touhou-marisa-bomb-release.md)。

`Game` 则是可选的简易会话组合。也可以只依赖 `World`、`Bullet`、`Laser`、`Patterns` 等模块，自行实现场景与游戏流程。库本身不访问 Node、浏览器、文件系统、原生全局或系统时钟。

## 使用公共应用框架

```js
import { TouhouApplication, createTouhouResources } from '@ts-stg/thlib/touhou';
const host = globalThis.tsstg;
const resources = createTouhouResources(host);
globalThis.__tsstg_game = new TouhouApplication({
  resources,
  pixels: host,
  ownResources: true,
  onQuit: () => host.quit(),
  gameOptions: {
    onSound: (id, x) => resources.audio?.request(id, x),
    onStopSound: id => resources.audio?.stop(id),
    stage(game, frame) { /* 编排自己的关卡和具体 Boss 招式 */ },
    renderBackground(draw, game) { /* 绘制自己的背景 */ }
  },
  onAfterUpdate: () => resources.audio?.flush()
});
```

这会使用公共资源完成主菜单、难度与人物选择、游戏、暂停、失败/续关、重试和回到标题的流程。`pixels: host` 接入原作的暂停抓屏与噪声处理。`TouhouGame` 已组合还原自机、武器、Bomb、弹幕、敌人、道具、符卡、HUD 与结算组件；具体内容由 `stage` 和其他回调提供。`menuOptions` 可以替换标签、入口行为、动画脚本映射、位置、资源库及背景；`gameOptions` 也可以按所选人物和难度返回不同配置。

默认菜单进入游戏会经过 `TouhouSceneTransition` 的四片斜向盖幕、滚动纹理和 Now Loading，然后在新游戏上揭幕。自定义菜单调用 `app.startTransition(selection)`；程序化 `app.start(selection)`、`autostart` 和重试仍立即创建游戏。盖幕期间不推进场景模拟，`app.sceneUpdated` 为 `false`；揭幕期间游戏正常推进。录制只收集实际游戏更新的输入。`transitionOptions` 可注入替代 ANM 皮肤，传 `false` 可关闭转场。详见 [场景切换](touhou-scene-transition.md)。

普通关卡结束后使用 `TouhouStageClear` 生成公共 STAGE CLEAR 面板：120 帧后允许确认，300 帧自动结束，再等 10 帧交接。奖励和统计行由业务注入，默认 `bonus:0, rows:[]`。`TouhouStageTransition` 提供只作用于背景的 30 帧盖黑与 30 帧揭幕，`onCovered` 交接关卡及曲目，HUD 保持在透明层之上。两个 owner 均可不加载素材运行；前者可注入 `front` bank/font 恢复原面板动画。详见 [关卡结算与下一关过渡](touhou-stage-flow.md)。

玩家在盖黑期间使用 `finishStageVisibility()` 收起僚机并结束旧 Bomb；调用 `updateStageVisibility(inputMask, context)` / `drawStageVisibility()` 继续正常更新和绘制自机本体、已有自机弹与附属动画，通过上下文关闭新射击和 Bomb。背景遮罩只在背景层，不会令自机消失。关卡交接时调用 `resetForStage()` 清理自机弹、判定点及临时状态并恢复僚机，保留位置、分数和资源。单独恢复僚机可调用 `restoreStageVisibility()`。先前把原源码 `Owner::player_primary` 误认为自机，实际它是弹幕控制器；普通换关不禁用自机本体或 Replay 的输入更新回调。详见 [自机关卡交接](touhou-player-stage-visibility.md)。

`TouhouMusic` 提供按需加载、缓存、循环区间、重播、暂停恢复和固定帧淡出。将它通过 `TouhouApplication.musicPlayer` 注入后，公共续关界面会保存当前曲目和位置，播放业务配置的 `game-over` 曲目；续关时恢复原位置，退出或重试时停止临时曲，交给新场景选曲。符卡练习和练习完成界面保留当前音乐。`gameOverOptions.music` 可替换曲目键，设为 `null` 可关闭自动换曲；BGM 文件和播放列表始终属于业务。底层 `TouhouMusicFade` 和 `touhouMusicVolume()` 仍可独立使用，前者音量使用 0–100，`TouhouMusic` 使用 0–1。详见 [音乐生命周期与衰减](touhou-music.md)。

Replay、Player Data、Music Room、Option、Manual 等栏目需要应用提供自己的数据与页面处理器；公共 `TouhouApplication` 尚未自带这些原作页面的完整业务实现，默认禁用未接入的入口。通过 `menuOptions.onSelect`、暂停/结算的 `onReplay`、`onOptions`、`onManual` 接入页面。显式 `excluded` 配置优先。下文简易 `Game` 模板中的设置、录像等功能属于另一套原型接口，不能理解为这些原作页面已完整还原。

`createTouhouPrefabCatalog(resources)` 提供所有保留动画的 `bank:script` 目录，以及两名自机、标准弹幕、普通敌人和效果的创建接口。资源数量、原始哈希及剔除操作以 `assets/touhou-common/manifest.json` 为准。`TouhouBossPresentation` 负责通用 Boss 演出，具体 Boss 身份、符卡配置和背景由使用方传入。

单独编排激光发射点时可用 `createTouhouLaserOrigin(bulletBank, color, options)`，颜色为整数 `0..15`。工厂复用 `TouhouLaserField` 的原始初始化，返回公共 `bullet:58..73` 动画；调用方负责位置、每帧更新、清理，并按激光的绘制优先级 `39` 排序。它是激光源头动画；Boss 攻击聚能用 `TouhouBossCharge`，出场黑雾用 `TouhouBossEntrance`，两者具有各自的原作时间线。

动态符卡名默认遵循原作的 CP932 字符转换；简体中文业务可通过 `createNameAnimation(name, {codePage: 936})` 显式使用 CP936，避免 CP932 不支持的汉字变成问号。描边、位图排版与动画仍使用公共实现。

背景扭曲需要可采样的背景纹理：由使用方通过 `host.createRenderTarget(960, 720)` 创建目标并传入 `gameOptions.renderTarget`，同时提供 `renderBackground`；退出应用时自行卸载该目标。上面的最小示例没有分配目标，因此只绘制普通背景。标题背景可以使用下面的抓屏网格，也可以用 `textureId:null` 提供直接绘制的背景。可运行的完整接入示例见仓库 `examples/touhou-framework/main.js`。

部分通用动画依赖具体关卡镜头。`effect:95–98` 和 `effect:133–134` 绘制时需要在 `AnmView.projection` 中提供视图/投影矩阵与视口；后两者还使用 `billboardAxis`。通过资源选项 `environment.cameraComponent`、`environment.cameraOffset` 注入相机变量及位移。资源包包含这些动画的实现，但不会为它们猜测某一关卡的镜头。其余常用界面、自机和 Boss 演出使用对应的默认二维/投影配置。

## Boss 出场、阶段与公共 HUD

`TouhouBossPresentation.enter(boss)` 只建立常驻演出，不会每次换阶段重播黑雾。出场时显式调用 `beginEntrance({mode:'blackFog'})`；道中直接飞入使用 `mode:'flyIn'`，轨迹由业务决定。黑雾第101帧显形，第102帧启用双圈和扭曲，尾雾到192帧结束。用 `entranceReady` 控制攻击开始，用 `bossVisible` 控制本体绘制，不要等待整个尾雾结束才开战。

公共 `TouhouGame` 可以直接接入：

```js
import { TouhouBossPhasePlan } from '@ts-stg/thlib/touhou';
const phases = [{hp:12000}, {hp:2200, spell:true}, {hp:2500, spell:true}];
const plan = new TouhouBossPhasePlan(phases);
game.enterBoss(boss, {entrance:{mode:'blackFog'}});
// 在stage更新中，由业务维护phaseIndex与实际HP。
game.setBossHud({name:'My Boss', ...plan.hudState(phaseIndex, {
  hp:boss.hp, maximumHp:phases[phaseIndex].hp
})});
if (game.bossPresentation.entranceReady) updateBossAttacks();
```

Game 负责黑雾的更新、分层、本体隐藏以及入口期间的伤害/接触保护；使用独立 Presentation 的应用自行接入这些规则。阶段规划器只计算显示数据，不执行攻击或改变伤害。默认将连续非符与下一张符卡合为一组，非符打完保留最后的符卡血段。`healthGroup` 与 `healthWeight` 可覆盖分组和比例，也能传入自定义选择器适配已有阶段格式。符卡练习只传所选阶段即可得到完整单条血环。

阶段准备由公共 `TouhouBossPhaseTimeline` 管理，固定帧来自关卡模拟时钟。`attackStartFrame` 是攻击开始时间，`patternLeadIn` 表示业务弹幕本来就有的前置等待；`patternReady` 会提前扣除这段等待，避免把聚能或准备时间重复叠加。`cues` 的内容和具体时间由关卡提供，库只负责按帧派发；泛型会保留使用方的 cue 类型。

```js
import { TouhouBossPhaseTimeline } from '@ts-stg/thlib/touhou';
const phaseClock = new TouhouBossPhaseTimeline({
  attackStartFrame: phase.timing.attackStartFrame,
  patternLeadIn: phase.pattern.preparationFrames,
  cues: phase.timing.cues,
  onCue(cue, clock) {
    if (cue.kind === 'charge') presentation.beginCharge({
      ...cue.options,
      clock: () => clock.frame - cue.frame
    });
  }
});
// 每个实际关卡模拟帧推进一次，不随命中次数或绘制调用推进：
phaseClock.update();
if (phaseClock.patternReady) updateAuthoredPattern();
```

准备期仍照常更新 Boss 演出、血环与伤害保护，只限制业务弹幕何时启动，不要暂停整个 Boss owner。`TouhouBossCharge.clock` 接收从这次聚能开始计算的非负整数帧，可以让聚能释放与阶段 cue 共用同一时钟；省略或传 `null` 时按每次 `update()` 自增。构造和 `reset()` 会立即派发第零帧 cue，因此回调应使用它的第二个 `clock` 参数，避免引用尚未赋值的 `phaseClock`。具体原作关卡的准备时间属于业务配置，不应成为库里的某个 Demo 特例。

保存 `beginCharge()` 返回的聚能对象，在阶段结束或重置时调用它们的 `stop()`，取消尚未发生的释放。已经生成的粒子仍由演出组件更新到正常退场；不要继续推进结束阶段的时间线，也不要让旧聚能继续等待停止的时钟。

需要每张符卡开场满圈时，使用 `new TouhouBossPhasePlan(phases, {spellRing:'full'})`。
非符仍按真实 HP 分段；符卡改按自身 `hp / maximumHp` 显示，移除分隔标记，并通过
`animateFill:false` 立即显示当前比例。竖屏 Rush Demo 使用公共默认共用血环，不启用此选项。公共默认
`spellRing:'shared'` 仍遵循 TH20 的共用血环；`full` 是可选显示方式，不改逻辑 HP、
伤害、保护期、阶段切换或胜负。直接提供 `healthBars` 时也可设置 `animateFill:false`
取消向上填充动画；保护期的隐藏规则仍生效。

名字下面的星星表示当前/即将到来的符卡之后还剩几张；减少时使用原作放大淡出动画。名字通过 `name` 提供，字体/贴图可由 `TouhouBossHud` 的 `drawName` 回调替换。默认两组血环、每环四个分隔标记、十颗星；`panelCount`、`markerCount`、`starCapacity` 可覆盖容量，超过十颗星时必须提供 `createStar(index, bank)` 的排版/动画。阶段规划器的 `maxSections` 应与 HUD 标记容量对应。更多出场参数、动画生命周期和源码证据见 [Boss 出场](touhou-boss-entrance.md) 与 [Boss HUD](touhou-boss-hud.md)。

### 最终击破、消弹与对话

`TouhouBossDefeat` 提供不依赖渲染资源的最终击破流程：Boss 以随机方向缓慢漂移，固定中心的 `TouhouBulletClearWave` 从半径 16 开始，每帧增加 6；第 60 帧全场补清，再结算符卡、掉落并启动 `TouhouBossDeath` 反色与爆炸视觉。原作等待期间仍更新玩家、已有弹幕和符卡，不能提前锁定收卡奖励。

公共 `TouhouGame` 在登记 Boss 的 HP 归零时保留身体，通过 `enterBoss(boss,{onDefeated})` 或全局 `onBossDefeated` 交给关卡决定后续；没有处理器时发送 `bossdefeated` 事件。需要完整爆炸预设时显式调用 `game.beginBossDefeat(boss)`。也可以先结算再接对话、用 `resumeBoss()` 继续下一阶段，或调用 `beginBossEscape()` 飞走、`removeBoss()` 无特效移除。`TouhouBossEscape` 本身只提供可配置的固定帧移动，不绑定奖励或消弹。使用独立模拟框架的爆炸预设时，接入 `cancelCircle`、`clearAll`、`onMove` 和 `onBurst` 回调；`TouhouBulletField.cancelNearbyCircle` 提供原作清弹圆波所需的特殊消弹规则。离开场景调用 `destroy()`，不会触发清弹或击破；需要业务主动提前完成时可调用 `finish()`。

战后对话由舞台编排控制，应在 `bossburst` 事件后按业务时间启动，不要等待爆炸粒子全部消失。一、三、四、六面的源脚本在 Boss 退场后固定等待 60 帧；对话和死亡特效可以同时存在。API、完整接入示例和源码位置见 [Boss 击破与渐进消弹](touhou-boss-defeat.md)。

## 扩展还原框架

默认数值和素材仍由公共预设提供。自定义角色、关卡和界面在调用方组合，无需修改 thlib 源文件。以下接口属于 `@ts-stg/thlib/touhou`；后文的简易 `Game/World` 是另一套可选模板。

### 系统配置与世界

`TouhouGame.systemOptions` 将局部选项传给 `player`、`bullets`、`lasers`、`items`、`enemy`、`hud`、`bossHud`、`spell`、`bossPresentation`、`damage`。`factories` 的同名回调接收合并后的选项和 Game，返回符合该系统接口的实例。工厂实例归 Game 所有；自定义资源可在幂等 `destroy()` 中释放。通常只需配置；需要替换行为时再提供工厂。`spawnEnemy(options)` 的本次参数优先于公共 enemy 配置。

```js
import { TouhouGame, TouhouWorld } from '@ts-stg/thlib/touhou';
const world = new TouhouWorld({bounds:{x:-192,y:0,width:384,height:448}});
const game = new TouhouGame({
  banks, font, sht, styles, world,
  systemOptions: {
    bullets: {capacity:4000}, lasers: {capacity:1024}, items: {capacity:1024},
    player: {rules:{initialLives:3}},
    bossHud: {markerCount:6}
  }
});
```

世界几何不可变，默认自机、敌人、子弹、激光和道具共享同一 `world`。出界、反弹、循环和消弹裁剪使用它；单个对象可覆盖 `bounds`，弹幕/激光/敌人可配置 `autoBounds`。这不自动缩放原作动画、Bomb 轨迹、镜头或 HUD；更换画幅还需配置 `view/viewport`、自机出生/复活位置和界面。默认弹幕、激光、道具容量分别为 2000、512、512。

### 角色、武器、Bomb 和道具

`TOUHOU_PLAYER_PROFILES.reimu/marisa` 组合原角色行为；`TOUHOU_PLAYER_RULES` 集中保存原作规则。`systemOptions.player.profile` 可传自定义 `{id,rules,shoot,shotFactory,bombFactory}`，同名 Player 选项优先于 profile。新角色需要自己的动画 bank 和合法 SHT 数据；仅更换角色身份不会偷偷套用魔理沙 Bomb。

`shoot(player,frame,secondaryFrame,context)` 在原射击节拍中调用，可组合导出的 `fireTouhouPlayerWeapons`；`shotFactory` 替换单发武器对象。`bombFactory(player,context)` 返回具有 `alive/update/draw/destroy` 的对象，设为 `null` 可禁用 Bomb。伤害、音效、消弹仍通过 context 接入公共系统。跨关重置保留玩家配置，退出 Game 会清理自定义武器和 Bomb。

规则可配置火力单位和上限、库存、碎片阈值、吸收、判定及决死时间等。原 SHT 仍只有自己的武器档位；提高库存火力上限不等于凭空增加新武器。公共 HUD 使用同一规则显示数值，原素材的七个库存槽之外用实际数量标注；更换完整布局可用 `factories.hud`。自定义角色/难度标签用 `characterScript/difficultyScript` 指定，未指定的未知身份不绘制冒用的角色标签。

```js
game.items.register('medal', {
  bank: myItemBank, script: 0,
  collect(item, player, context) { player.score += 500; }
});
game.items.spawn({type:'medal',x:0,y:120});
```

自定义道具复用原道具移动、吸收、出界和回收生命周期；奖励逻辑由 `collect` 决定，`spawnEffect` 可增加出生效果。公共类型和业务类型均通过同一个道具系统管理。

### 阶段编排和 Boss 归属

`TouhouPhaseSequence` 只管理 `enter → run/update → leave` 生命周期。`enter/run/leave` 可返回固定帧 generator；无 `run` 的阶段等待外部 `finish(result)`，有 `run` 的阶段在 generator 完成后结束，也可提前 `finish`。提前结束会先关闭攻击 generator，执行其 `finally`，再执行 `leave`；销毁整个流程则关闭任务而不执行后续阶段。异步 Promise 不属于确定性游戏时钟。

```js
import { wait } from '@ts-stg/thlib';
import { TouhouPhaseSequence } from '@ts-stg/thlib/touhou';
const sequence = new TouhouPhaseSequence([
  {name:'arrival', run:function* (game) {
    game.enterBoss(boss,{entrance:{mode:'blackFog'}});
    while (!game.bossPresentation.entranceReady) yield 1;
  }},
  {name:'attack', enter(game) {
    game.startBossCombat(boss);
    // 设置 HP，并由本阶段 update/run 推进业务弹幕。
  }, leave:function* (game) {
    game.stopBossCombat(boss);
    yield* wait(30); // 此等待由关卡指定。
  }},
  {name:'after', run:function* (game) {
    // 可等待自己的对话、移动或其它演出。
    game.beginBossEscape(boss);
  }}
],{context:game});
game.registerBoss(boss,{onDefeated:()=>{sequence.finish('defeated');}});
// 每帧调用 sequence.update()；离开关卡时调用 sequence.destroy()。
```

流程不隐式清弹、掉落、结算符卡或爆炸；这些仍需调用对应公共组件。Game 的 `stage` 也接受 `{update(game),destroy()}`，可让它持有 sequence 并随场景退出清理。`runBossSequence(boss,generator)` 和返回 generator 的 `onDefeated` 则由 Game 自动推进，移除该 Boss/退出场景会取消所属任务。`holdBoss` 暂停实体的更新、移动和碰撞，不暂停外部协程；阶段攻击用 `sequence.finish()` 收尾，或保存任务句柄再调用 `game.tasks.cancel(handle)`。这样战后对话/退场任务仍能运行。

`registerBoss` 登记角色及其击破回调，独立于 `enterBoss/setBoss` 的当前 HUD/特效焦点。切换焦点不会让上一只 Boss 丢失击破处理。`startBossCombat/stopBossCombat` 控制攻击就绪状态；`beginCharge` 只创建聚能，`clearCharges` 显式清理聚能。每次 `enterBoss` 可选择 `profile:'boss'|'midboss'` 或自定义 aura 参数。当前 Game 默认仍组合一张活动符卡和一套焦点演出；独立的并行符卡/演出需要调用方额外组合实例。

`onSpellTimeout({game,boss,spell})` 可替换 Game 默认超时结算；传 `null` 只发送一次 `spelltimeout` 事件。每次 `beginSpell` 都有独立 generation，旧 Boss 的退出序列不会结算后来开启的同编号符卡。`spell.clockPaused` 暂停模拟计时和 bonus 递减，动画继续更新；它不代表平台计时暂停。

### 应用、选择页、资源与续关

`new TouhouApplication({scenes,initialScene})` 或 `registerScene(name,factory)` 可注册任意场景。工厂接收 `{selection,data,createBank}` 和 app，返回 `update`、`draw` 或 `render`，以及可选 `destroy`。通过该 `createBank` 创建的场景资源自动回收。`switchScene(name,{data,selection,transition:true})` 复用公共幕帘；更新回调内发起的切换在当前帧更新完成后执行。

菜单的 `difficulties/characters` 接受 ID 列表或 `{id,label}`，`selectionFlow` 决定难度/角色页面的顺序，也能按模式返回不同列表。`createSelectionPage(kind,menu)` 给自定义 ID 提供画面，公共输入和选择结果仍可复用。默认难度、两名角色和原动画时序保持。自定义字符串难度需要在 `gameOptions(selection)` 中映射成 `TouhouGame` 使用的数值难度，或交给自己的 Game 工厂处理。

`createTouhouResources` 支持额外 `archives/bankNames/shots/styles/players`，`registerBank(name,decodedAnm)` 追加已解码动画。`players[id]={bank,profile,sht}` 将自定义角色选项交给 Application。名称空间由应用决定，不往公共资源清单添加具体作品内容。对话的 `portraitProfiles` 替换预设参数，`createPortrait(side,step,dialogue)` 可接入完整的自定义立绘生命周期。

GameOver 使用 `session.stageKind:'extra'` 判断 Extra，普通第七关不再被误认。`canContinue` 控制资格；`continuePolicy(player,session,context)` 完整替换补给和重置，然后才调用 `onContinue`。默认策略保留原作补给并遵守玩家配置的上限。

## 标题背景与练习列表

`TouhouTitleBackground` 提供原菜单的 64×48 动态网格和逐帧波动，图像由应用绘制。将以下 `background` 传给 `menuOptions.background`，并设 `menuOptions.disposeBackground:true`，即可让菜单负责更新和释放。普通 `TouhouTitleMenu` 的 `disposeBackground` 默认是 `false`；共享背景由应用自行释放。

```js
import { TouhouTitleBackground } from '@ts-stg/thlib/touhou';
const target = host.createRenderTarget(960, 720);
const mesh = new TouhouTitleBackground({textureId: target});
const background = {
  textureId: target,
  update() { mesh.update(); },
  drawCapture(draw) {
    draw.clear(0x182030ff);
    // 在此绘制自己的标题插画、Logo 或其他需要一起扭曲的内容。
  },
  draw(draw) { mesh.draw(draw); },
  destroy() { host.unloadTexture(target); }
};
```

菜单先调用 `drawCapture`，再把低层菜单动画写入该目标，最后通过网格绘制并叠加其余界面。目标必须是有效的 render target；`0` 不能代替纹理。若不需要抓屏或网格，使用 `{textureId:null, update(){}, draw(draw){ /* 自定义背景 */ }}`，菜单不会建立离屏目标。`TouhouTitleBackground` 本身没有图像资源，不能在 `textureId:null` 时调用其 `draw`。导出的 `titleShade(component, weight, direction)` 是网格的通用颜色计算函数。

`TouhouStageSelect` 提供原练习列表的输入、分页、确认闪烁及返回等待。标题、条目、分数和选择结果由应用提供；它不会创建关卡。

```js
import { TouhouStageSelect } from '@ts-stg/thlib/touhou';
const bank = resources.createBank('title');
let selectedStage = 1; // 业务 gameOptions 按此值创建关卡。
const selector = new TouhouStageSelect({
  bank, font: resources.font,
  entries: [{label: 'Stage 1', stage: 1}, {label: 'Stage 2', stage: 2}],
  onTransition(entry, index) {
    // 确认后第10帧盖幕；应用再运行30帧，于第40帧换场。
    selectedStage = entry.stage;
    app.startTransition({mode: 'practice'});
  },
  onCancel() { /* 返回上一页 */ }
});
// 更新：selector.update(mask); bank.update();
// 绘制：bank.draw(draw, {x:0,y:0,scale:1,screenScale:1.5}); selector.draw(draw);
// 退出：selector.destroy(); bank.dispose();
```

控制器只管理列表和它创建的标题动画，不更新、绘制或释放整个 bank；上层每帧处理一次 bank。如果与其他菜单共用 bank，不要重复推进它。`headingScript:false` 可禁用标题；`entries[].disabled`、`pageSize`、`drawLabel`、位置与字体均可配置。自定义中文条目需通过 `drawLabel` 接入支持中文的文字服务；位图字库的默认列表标签用于原有拉丁字符。

盖幕开始时保留列表，等应用销毁旧场景时再清理，避免旧画面突然消失。未使用应用转场的独立列表仍可通过 `onSelect` 在第40帧接收选择；不要从这个晚回调再启动30帧盖幕，否则会额外延迟换场。

## 对话、头像与中文文本

`TouhouDialogue` 接收业务步骤，组合公共对话框、文字展开、说话人明暗、自机头像及推进/跳过。它独立创建并管理自己的 ANM bank，外层只调用一次 `update(mask)`、`draw(draw, view)`，退出时 `dispose()`；不要再推进这些内部动画。默认视图对应 960×720 窗口内的 384×448 竖屏游戏区。

```js
import { TouhouDialogue } from '@ts-stg/thlib/touhou';
const dialogue = new TouhouDialogue({
  resources, character: 0, codePage: 936,
  speakerNames: {right: '角色名字'},
  steps: [
    {speaker: 'left', text: '由游戏提供的对话。', coldFrames: 30,
     portraits: {left: {present: true, emotion: 'NOTICE'}}},
    {speaker: 'right', text: '另一位角色的回复。', coldFrames: 2},
    {terminal: true}
  ],
  onComplete() { /* 请求上层在安全的更新边界切换场景 */ }
});
```

文字默认整行淡入；`charsPerFrame` 可启用逐字显示。`coldFrames`、`autoFrames`、`startDelayFrames` 控制推进时序；`onEvent` 接收步骤事件，`drawPortrait` 可以替换角色皮肤。公共默认 CP932；中文明确传 `codePage:936`，使用原生宿主注入的编码、GDI 字图与纹理服务。`resources.writeAnimationText(vm, text, {font:4,codePage:936,align:'left'})` 写入原 text 动画表面；`createNameAnimation` 仍是独立的居中符卡名接口。编码后的换行通过 `wrapTouhouDialogue` 实现，不切断汉字。

战后首句可选 `entrance:'afterBoss'`，使用公共 `TOUHOU_DIALOGUE_ENTRANCE_PRESETS.afterBoss`：入口第 0 帧生成立绘，第 4 帧切换说话状态，第 34 帧显示文字，第 38 帧允许输入。默认 `entrance:null` 保持立即显示首句；也可传 `{portraitFrame,speakerFrame,textFrame,inputFrame}` 自定义四个按顺序不递减的非负整数帧。这个入口只作用于首句，并以 `inputFrame` 代替首句的 `coldFrames`；后续对白使用各自的常规时序。`startDelayFrames` 是整个入口开始前的附加等待；无需附加等待时传 `0`。需要在对应时点派发自定义事件时，设置 `event.entranceStage` 为 `'portraits'`、`'speaker'` 或 `'text'`。`snapshot().entrance` 提供当前入口帧和立绘、说话、文字、输入的状态。舞台仍负责决定何时创建整段对话。

退场可选 `exit:'beforeBoss'`（30 帧完成）或 `exit:'afterBoss'`（第 1 帧 `onExitHandoff`，第 31 帧 `onComplete`），也可自定义 `{completeFrame,handoffFrame}`。战后用 `onExitHandoff` 启动 `TouhouStageClear`，继续更新和绘制对话直到 `onComplete`，保留立绘及文字的淡出尾段。`finish()` 请求配置的退场；`dispose()` 立即终止。默认 `exit:null` 保持即时完成，空对白直接完成，不派发退场交接。

默认自机对话身体脚本使用无魔石原画的等比例 UV 裁片，保留原身体尺寸、独立表情与运动时间线；它不是原作含魔石整身图的逐像素复刻。公共包另有两名自机各九张无魔石表情图，供自定义组合。Boss 头像和台词由游戏提供，没有头像时显示业务传入的名字。详见 [对话 API 与资源边界](touhou-dialogue.md) 和 [预置体库存](touhou-prefabs.md)。

## 使用还原的自机、武器和 Bomb

下面是可直接用作 `main.js` 的自机展示场景。方向键移动，Z 射击，Shift 低速，X 使用 Bomb。把 `character` 改为 `1` 即可使用魔理沙。SDK 中的共享素材目录为 `packages/thlib/assets/touhou-common`；安装在 `node_modules` 或另行复制素材时，传入实际的 `basePath`。

```js
import { DrawList } from '@ts-stg/thlib';
import { createTouhouResources, TouhouPlayer } from '@ts-stg/thlib/touhou';

const resources = createTouhouResources(globalThis.tsstg, {
  basePath: 'packages/thlib/assets/touhou-common'
});
const character = 0;
const player = new TouhouPlayer({
  character, sht: resources.shots[character],
  bank: resources.banks[character ? 'pl01' : 'pl00'],
  effectBank: resources.banks.effect,
  power: 400, lives: 2, bombs: 2
});
const context = {
  enemies: [],
  sound: (id, x = 0) => resources.audio?.request(id, x),
  stopSound: id => resources.audio?.stop(id)
};
const draw = new DrawList();
const view = { x: 336, y: 24, scale: 1.5, screenScale: 1 };

globalThis.__tsstg_game = {
  update(mask) {
    player.update(mask, context);
    for (const bank of Object.values(resources.banks)) {
      bank?.updateDetached();
      bank?.collect();
    }
    resources.audio?.flush();
  },
  render() {
    draw.reset().clear(0x101018ff);
    player.draw(draw, view);
    for (const bank of Object.values(resources.banks)) bank?.drawDetached(draw, view);
    return draw.commands;
  },
  snapshot: () => player.snapshot()
};
```

`player.update` 自己推进射击、子机、低速判定点、两种 Bomb 和自机效果，`player.draw` 使用相应 ANM 绘制它们。不要再通过 `bank.update()` 或简易 `PlayerPresentation` 推进、重画这些对象。脱离原主对象的动画用 `updateDetached` / `drawDetached` 处理；复杂场景可用 `TouhouRenderQueue` 统一角色、弹幕和效果的绘制顺序。

完整游戏通过 `context` 接入 `enemies`、`damageEnemy` 或 `damageRegion`、`cancelCircle` / `cancelRectangle`、`spawnItem`、`enqueueGraze`、`spell` 和事件通知。它们连接敌方对象与关卡；武器和 Bomb 的轨迹、伤害区域、消弹时机以及动画仍由共享实现计算。`TouhouItems`、`TouhouGrazeEffects`、`TouhouDamageAccumulator`、`TouhouSpell`、`TouhouBulletField`、`TouhouLaserField` 是对应的公共组件。

共享射击数据格式为 `ts-stg-touhou-shots`，只保留两名角色的基础模式 `0..14` 和基础子机、伤害上限数据，功率范围 `0..400`。运行时不读取 SHT 二进制；特定作品的二进制导入器留在业务工具中。`getTouhouPlayerData(0 | 1 | 'reimu' | 'marisa')` 可以直接取同一份数据。`createTouhouResources()` 不传宿主时提供无图形模拟数据，不会换成简易武器。

还原组件使用弧度、每帧速度、向下为正的 Y 轴；默认自机场地为 `{x:-192,y:0,width:384,height:448}`，移动内边距为左/上/右/下 `8/32/8/16`，初始位置 `(0,400)`，复活从 `480` 到 `400`。`bounds`、`movementInsets`、`respawnX`、`respawnY`、`respawnStartY` 可适配其他场地。绘制 `view` 负责屏幕投影，自机、弹幕与伤害适配器应使用同一逻辑坐标系。

`assets/touhou-common` 保存完整通用动画、图像、字体与音效。混有专属图像的图集经过筛选，保留通用像素、动画和资源索引，并明确拒绝访问被剔除的脚本/精灵。`assets/reference-common` 仍用于只需要命名精灵的轻量图集方式。两者的资源来源和许可独立于代码 MIT 许可。

`Entity` 有确定的 ID、年龄、任务和销毁钩子。`world.spawn(entity)` 可在任务和碰撞回调中调用；本轮更新中产生的新实体不会插进当前迭代。`destroy()` 幂等，并清理所属 generator。用 `world.rng` 取得可回放的随机数；不要在玩法代码中用 `Math.random()` 或实时时间。

## 弹幕与激光

```js
import { Bullet, Laser, Patterns, wait } from '@ts-stg/thlib';

world.spawn(new Bullet({
  x: 320, y: 160, angle: Math.PI / 2, speed: 1.5,
  shape: 'rice', radius: 3, color: 0xf48fc4ff,
  acceleration: 0.01, maxSpeed: 4,
  commands: [
    { at: 60, type: 'pause', frames: 25 },
    { at: 85, type: 'aim', target: () => game.player },
    { at: 85, type: 'speed', value: 3 }
  ]
}));

Patterns.ring(world, { x: 320, y: 160, count: 32, rows: 3, speed: 1, speedStep: .4 });
Patterns.aimed(world, { x: 320, y: 160, target: game.player, count: 5, spread: .6, speed: 2 });

world.spawn(new Laser({
  x: 320, y: 100, angle: Math.PI / 2, length: 600, width: 12,
  warning: 60, grow: 12, duration: 120, fade: 20,
  angularVelocity: .002, color: 0x9be5ffff
}));

world.spawn(new Laser({
  kind: 'curved', x: 100, y: 100, maxPoints: 80,
  path: frame => ({ x: 320 + Math.sin(frame * .04) * 140, y: 80 + frame * 1.7 }),
  width: 10, warning: 50, duration: 240
}));
```

普通弹可配置圆、旋转胶囊、旋转矩形判定；擦弹对每架自机只结算一次。激光沿线段/曲线节点判定，擦弹有冷却；预警和淡出不造成伤害。`cancelable:false` 可禁止普通 Bomb 消除。`behavior(bullet,world)` 和 generator 可以表达 API 未内置的运动组合。

## 简易自机、武器、Bomb 与规则

```js
const game = new Game({
  player: {
    speed: 5, focusSpeed: 2.2, radius: 2.5,
    grazeRadius: 23, deathbombFrames: 8,
    lives: 2, bombs: 3, power: 1, maxPower: 4,
    weapon: { type: 'homing', interval: 5, damage: 3 },
    bomb: { duration: 150, damage: 2, maxRadius: 950 }
  },
  rules: {
    respawnBombs: 3, scoreExtends: [100000, 300000, 700000],
    lifePieceThreshold: 5, bombPieceThreshold: 5,
    grazeScore: 10, pointValue: 1000, allowContinue: true
  }
});
```

内置武器有 spread、homing、laser、piercing。用 `new Weapon({emit(player,world,weapon){...}})` 定义新的发射方式；Bomb 的 `onTick(bomb,world)` 定义追加行为。默认 Bomb 提供扩张消弹、持续伤害和自机无敌。它们是通用模板，不是某个原作角色武器的逐帧复刻。

`createPlayerCharacter('reimu'|'marisa', options)` 组合简易 `Player`、`Weapon` 与 `Bomb` 模板。它与前面的还原 `TouhouPlayer` 是不同 API，两个还原 demo 不再使用它代替原有武器和 Bomb。需要快速原型时仍可通过 `weapon`、`bomb` 参数或 `bombFactory` 配置。普通 `new Player()` 的默认行为不变。

简易模板使用 `new PlayerPresentation(atlas)` 绘制武器、子机、Bomb、低速判定点和死亡特效。其 `view` 接受缩放、平移及 `body(draw,player,{x,y,alpha,scale})` 皮肤回调。还原 `TouhouPlayer` 已包含共享角色本体动画，无需这个皮肤回调。API 细节见 [公共包说明](../packages/thlib/README.md)。

## Boss、符卡与关卡

`Boss.phases` 数组依次定义非符、符卡、耐久卡。每阶段可配置 `hp`、`timeLimit`、`spell`、`survival`、`bonus`、`bombResistance`、`position`、`drops`、`script`、`onUpdate`、`onEnd`。击破/超时清理旧任务和弹幕。失误、Bomb 和续关会影响收取资格；耐久卡以成功生存到超时为收取条件。

`Stage.script` 是 generator 时间轴，使用 `yield* wait(frames)`；使用 `yield* stage.talk([{speaker:'...',text:'...'}])` 编排对话。关卡可用 `autoFinish:false` 自行控制结束。传入 `stages:[createStage1,createStage2,...]` 构建多关流程：上一关结束自动进入下一关，保留计分、自机资源、RNG 和录像，清理关卡实体与旧任务。只有最后一关完成才进入整局结算。也可显式调用 `advanceStage()`，并通过 `stageStart`/`stageClear` 事件控制表现。

```js
const game = new Game({ stages: [createStage1, createStage2], replayVersion: 'my-game-1' });
game.startPractice(2, 1); // 第二关的第三个 Boss 阶段，两个下标都从 0 开始。
```

## 简易 Game 模板的菜单与绘制

`Menu` 的条目支持 `label`、`description`、`enabled`、`value`、`adjust(direction)` 与 `action`。Game 默认提供开始、练习、回放、设置、暂停、游戏结束、续关和结算。传入 `menu.entries` 自定义主菜单，或覆盖场景方法。

`renderBackground(draw,game)`、`renderHUD(draw,game)`、`renderOverlay(draw,game)` 可替换视觉表现。`DrawList` 只生成命令；绘制不应修改游戏状态。颜色是 `0xRRGGBBAA`，旋转角为弧度。

```js
const resources = new Resources(globalThis.tsstg);
const animation = SpriteAnimation.grid(resources.texture('assets/player.png'), {
  width: 32, height: 48, columns: 4, count: 4, frameDuration: 6
});
// 每次 simulation update 调一次，而不是每次 render 更新。
animation.update();
animation.draw(draw, player.x, player.y);
draw.blend('add').circle(320, 180, 40, 0x88bbff44).blendEnd();
```

自定义字体由宿主 `loadFont('assets/font.ttf',32)` 加载，再用 `draw.text(text,x,y,size,color,fontId)`。默认内置字体用于示例英文；中文项目应提供有相应字形且允许分发的字体。

## 简易 Game 模板的录像与保存

`game.exportReplay()` 输出种子、初始关卡、边界、规则、自机/武器参数和压缩输入流；`game.playReplay(data)` 重新运行相同关卡。每 300 帧校验状态，发现不一致立即报告。游戏代码或回调发生变化时应更新 `replayVersion`，以便拒绝旧录像；这是输入录像，不是存储 generator 调用栈的即时存档。

```js
const host = globalThis.tsstg;
const store = new SaveStore({
  readText: name => host.readText(`userdata/${name}`),
  writeText: (name, text) => host.writeText(name, text)
});
const game = new Game({ store, stageFactory });
```

原生宿主写入限制在项目 `userdata/`。示例保存设置、最高分和最近一次录像；续关后停止继续录制该局，因为当前录像格式没有收录续关菜单流程。
