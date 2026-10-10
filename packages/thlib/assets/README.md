# thlib 通用素材

thlib 包含灵梦、魔理沙本体、子机、武器、判定点、Bomb、弹幕、激光、道具、小怪、消弹和其他特效素材，以及通用音效。素材按用途归属；从哪个作品的资源中提取，并不决定它必须依赖该作品的业务代码。

`reference-common/`、`touhou-common/`、`spell-common/` 三套公共素材随 thlib 纳入 Git、npm 包和引擎 SDK。克隆仓库后即可使用，无须先导入任何参考资源。导入工具仅用于维护和从本机参考资源重建；各包的来源清单、哈希及原权利说明随素材保留。

## 完整公共还原资源

`touhou-common/` 由 `createTouhouResources` 载入，包含 10 个 ANM bank、94 张 PNG、51 个原音效、1,342 个动画脚本和 2,256 个 sprite，以及两角色的基础射击数据。脚本包含姿态、子动画和辅助效果，数量不是独立实体种类数。应用使用这套资源和同一个 `TouhouPlayer` 实现；保留运动、缩放、旋转、混合、子动画及中断等完整演出。混合图集仅移除作品专属区域，并保留 1 像素原采样边框；没有因图集混杂而排除整个角色或武器。来源、筛选规则和使用方式见 [完整公共资源](TOUHOU-COMMON.md)。

公共 UI 的 `front`、`ascii_960`、`title` 另作统一采样隔离：1066 个静态精灵完整保留原 RGBA，重新排列并延展两像素自身边缘；只重映射 UV 和纹理尺寸，不改变几何与 ANM。横向循环条带保留循环行为，动态文字和捕获表面不重排。这样避免相邻图块串边，并保留文字本身的黑色描边。`screenswitch` 的两张转场纹理和原始越界 UV 完全不重排，以保留原作平铺；`ascii_960:17` 和其子节点提供通用 NowLoading，其 entry7 原图已有采样留白，保留原纹理尺寸和 UV，避免粒子边缘量化差异。

工作区执行 `node tools/import-touhou-common-assets.mjs` 重建，`--check` 校验所有产物。运行时不需要导入工具。

## 图像与动画片段

`reference-common/manifest.json` 是数据清单，包含命名精灵、矩形区域、纹理画布尺寸和动画片段。当前选择 23 张完整图集：标准小/中弹、符札/星弹/光球、激光、消弹、粒子/符阵/花瓣和 Bomb 光球/魔炮。共 612 个原始精灵矩形、924 个可引用名称（含语义别名）、9 段纹理帧动画。

这个较小的 SpriteAtlas 包只选取完整通用图集，按原字节复制并保持透明度和纹理 padding。角色本体及混合图集中的公共区域已包含在上方完整 `touhou-common` 包；标题立绘、专属 HUD 与背景仍留业务层。

```js
import { SpriteAtlas } from '@ts-stg/thlib';

// host 和清单读取由使用者提供；库不依赖文件系统或 tsstg 全局。
const basePath = 'packages/thlib/assets/reference-common';
const manifest = JSON.parse(host.readText(basePath + '/manifest.json'));
const atlas = new SpriteAtlas(manifest, host, { basePath });
atlas.drawNamed('bullet.rice.red', draw, 200, 180, { scale: 2 });

draw.blend('add');
atlas.drawNamed('bomb.orb', draw, 300, 180);
draw.blendEnd();

const cancel = atlas.clip('bullet.cancel');
cancel.update();
cancel.draw(draw, 200, 180);
// 场景释放时调用 atlas.dispose()。
```

SpriteClip 只负责纹理帧播放。需要已还原的 Bomb 伤害、无敌、消弹、运动、混合和完整演出时，使用公共 `TouhouPlayer` 与 `touhou-common` 的 ANM。

这些图像来自本机已有原资源，逐文件 SHA-256、来源和范围在清单与 `reference-common/NOTICE.md` 记录；原图不属于 TS-STG 代码的 MIT 授权。素材选择表示通用用途，不宣称每张原图在所有作品里字节完全相同。

工作区执行 `node tools/import-common-reference-assets.mjs` 可从已有本机导入资源重建此包。导入工具位于开发工作区，运行或依赖 thlib 时不需要该工具。用 `run.ps1 -Entry examples/common-assets/main.js` 可检查素材页。

## 开卡、光环与蓄力素材

`spell-common/manifest.json` 提供三张通用纹理与七个命名图案：开卡文字条带、内外圆环、光环烟火、蓄力圈和枫叶。使用同一 `SpriteAtlas` 加载方式，基础目录改为 `packages/thlib/assets/spell-common`。三维精灵与纹理圆环由 thlib 公开的 `PerspectiveCamera`、`PerspectiveSprite` 和 `TexturedRing` 构建，时间轴与组合顺序由使用者配置。

具体 Boss、立绘、符卡背景与 UI 皮肤不在这个包里。原图按字节保留，来源和哈希见清单与 `spell-common/NOTICE.md`。工作区可执行 `node tools/import-common-spell-assets.mjs` 重建；运行时和独立安装的 thlib 不依赖原工程。

## 音效

`manifest.json` 和 `audio/` 提供六个原创合成音效：shot、graze、pickup、hit、bomb、select。它们为 MIT 授权；格式是单声道 22,050 Hz、16 位 PCM WAV。`touhou-common/audio/` 另外提供 51 个导入原音效（包括普通符卡超时的69号 `se_fault.wav`），保留原权利说明，由 `TouhouAudio` 调度。清单文件名相对各自素材目录，平台适配器负责载入和播放。

`tools/generate-audio.mjs` 可重建这六个文件。Moonlit 的音乐仍属于该示例，不在通用素材包内。
