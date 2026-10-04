# Touhou 预置体与公共资源

`@ts-stg/thlib/touhou` 提供原作的公共实体、应用界面与动画预置体。`createTouhouResources()` 加载公共资源，`createTouhouPrefabCatalog(resources)` 提供可列举、可直接创建的预置体；不需要导入 `games/touhou20` 或 `games/rushboss`。

```js
import {createTouhouResources, createTouhouPrefabCatalog, TouhouEffectPreset}
  from '@ts-stg/thlib/touhou';

const resources = createTouhouResources(host, {basePath: 'assets/touhou-common'});
const prefabs = createTouhouPrefabCatalog(resources);
const player = prefabs.createPlayer('reimu', {power: 400});
const enemy = prefabs.createEnemy('enemy:166', {x: 0, y: 100, hp: 80});
const bullets = prefabs.createBulletField();
prefabs.emitBullet(bullets, 'bullet:0', 2, {x: 0, y: 100, count: 16, pattern: 2});
const circles = prefabs.createEffect(TouhouEffectPreset.SPELL_DOUBLE_CIRCLES);
```

这些工厂返回已有的完整 `TouhouPlayer`、`TouhouEnemy`、`TouhouBulletField` 和 `AnmInstance`，保留原始碰撞参数与动画脚本。调用方负责游戏循环、关卡 AI、血量和掉落；动画更新和绘制不可重复调用。直接管理独立动画时可用对应 bank 的 `update()`/`draw()`，它会推进并绘制脱离父级的粒子。

| 类别 | 公共库存 | 来源与边界 |
| --- | --- | --- |
| 自机 | 灵梦、魔理沙两套标准配置 | 完整机体、子机、72/32 条武器发射行、攻击命中、判定点、完整 Bomb；去除魔石武器配置 |
| 子弹 | 50 种原始类型 × 16 色表行 | `bullet-styles.json`，保留原始半径；不同色行可能有意共用图片 |
| 小怪 | 全部 272 个非魔石敌机 ANM 脚本 | 七张原始敌机图集；包含辅助光环、方向帧与过渡，**不表示 272 个独立敌人种类** |
| 特效 | `effect.anm` 全部 193 个脚本 | 双圈 `6 → 4/5`、Spell Card Attack `13`、擦弹、死亡、蓄力、粒子等 |
| 游戏界面 | front 公共 HUD、血条、奖励提示、暂停、结束、对话框 | 具体 Boss 名字与魔石异常值标签除外 |
| 主菜单 | 通用主菜单控制、难度、角色选择原始时间线 | 应用提供标题文字、背景、品牌插画；角色保持标准配色 |
| 场景切换 | screenswitch 全部 12 个脚本与 NowLoading 动画树 | 通用遮幕、展开、循环纹理与加载指示；不包含具体作品加载插画 |
| 文字与字体 | text 全部 94 个表面动画、公共位图字体 | 包含符卡名称与暂停截图的动态纹理定义，由资源层分配表面 |

公共包包含 10 个 ANM bank、93 张 PNG、51 个音效、1,341 个动画脚本、2,255 个 sprite。`assets/touhou-common/prefabs.json` 列出每个动画的原始 bank、脚本编号、源图集和 SHA-256；`manifest.json` 记录图像转换与资源边界。对话扩展加入两名自机各九张原始无魔石表情图和其运动脚本；整身皮肤使用干净原画的等比例裁片，保留原身体动画的尺寸、位置和说话切换。场景切换的两张纹理和超出纹理尺寸的原始 UV 保持不变，以保留原作平铺；`ascii_960:17` 及其 `14..16` 子节点提供通用 NowLoading。

数字 ID 是源数据中的稳定地址，目录不会将一个通用替代动画冒充所有颜色或所有敌人。方向动画默认仅对具有完整五脚本移动序列的 25 个源族启用，其它脚本可单独创建或由应用配置方向行为。具体 Boss 的形象、台词、招式、立绘和背景仍由业务提供。

主菜单的通用化只做了清单中的明确转换：原始背景、插画、Logo、版权文字子节点替换成同尺寸 NOP，保留所有后续指令偏移；魔石配色分支保留中断编号，但指向标准角色图片。HUD 移除魔石异常值标签。普通混合图集保留选中图片和原始一像素采样边界，其他像素置为透明；未转换的完整公共图集逐字节复制。公共 UI 的 `front`、`ascii_960`、`title` 则逐精灵保留原 RGBA，并重排为带两像素自身边缘延展的图集，以防线性采样串入邻图；横向循环条带保留循环语义，动态文字及捕获表面不重排。详见 [UI 图集采样边缘](touhou-end-feedback.md#ui-图集采样边缘)。`aura.anm` 属于 `WeaponStoneInf`，魔石敌机以及石头道具脚本不进入公共包。

ANM 508 的原作聚拢蓄力实现为公共 `TouhouConvergingParticles`。它在 50 帧内生成 200 个真实 `effect149/150` 动画，保留两个 Hermite 阶段、随机调用顺序、颜色变换和结束清理。`AnmEnvironment.spawnEffect` 可扩展其他附着效果；缺省已经支持公共包使用的类型 1。阶段相机可通过 `cameraComponent` 和 `cameraOffset` 注入；缺省是没有相机运动的公共场景。需要三维阶段透视的动画使用 `AnmView.projection` 指定阶段相机。

初始 1,322 个选中动画有逐个创建、更新 240 帧、7 个时点实际绘制的审计记录，见 `reports/touhou-common/prefab-audit/report.json`；后续新增对话身体和时间提示有各自的回归与原生截图验收。其中 `effect95–98` 和 `effect133/134` 需要应用提供阶段相机；审计明确使用 416 × 480 的原始标准相机，billboard 轴为 `{x:1,y:0,z:0}`，不是从某一关卡移入相机轨迹。静态绘制审计不证明所有中断与游戏状态分支已覆盖；42 个聚拢蓄力脚本还单独检查了每个完整的 200 粒子生命周期。

验证命令：

```text
node tools/import-touhou-common-assets.mjs --check
node --test tests/touhou-prefabs.test.js tests/touhou-common-resources.test.js
node tools/verify-touhou-prefabs.mjs
node tools/verify-touhou-converging.mjs
node tools/verify-th20-projection.mjs
node --test tests/touhou-billboard.test.js
```

数值对照直接编译未修改的 `effect_system/converging_particles.cpp`，256 组案例、42,798 个 32 位字段完全相同。测试边界包括附着回调的分配接口、两段曲线控制点、RNG、颜色、时间和缓速值；真实 ANM 更新、绘制与最终清理由另一组测试验证。这些 CPU 结果不等于整个应用逐像素还原已完成。

Billboard 使用原始 `prepare_projected_billboard` 和本机 D3DX 的独立数值对照，覆盖 216 组输入、九种锚点组合、父子旋转、缩放、深度裁剪和四个视口。2,712 个几何输出字段以及 972 个旋转状态字段逐位一致，包括被裁剪对象的角度归一化副作用。参考点先投影、再依据相机轴的投影长度缩放四角；它与三维 world quad 是不同的源渲染路径。验证工具还逐一检查了 SSE 倒数估算的 8,388,608 个标准浮点尾数，以保留 D3DX 的舍入行为。
