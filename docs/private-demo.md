# TS-STG 本机参考 Demo

双击 `Play.cmd` 运行锦上京参考 Demo。程序在 `games/touhou20/`，使用其中已导入的本机原作资源；它依赖 `packages/thlib/` 的通用能力。

`games/touhou20/` 用于展示和回归验证，不是引擎发布物，也不是完整原关卡复刻；锦上京具体 Boss 和魔石不在实现范围内。

双击 `Play-RushBoss.cmd` 运行 `games/rushboss/` 的竖屏 Demo。按 2026-10-04 更新后的范围，它使用 RushBoss 的 29 个攻击阶段、16 张符卡、源对白，以及三关 3D 背景、符卡背景、三个 Boss 的实际精灵、对白立绘与开卡 cut-in。这些具体美术、背景和业务动画全部位于 `games/rushboss/`；早先仅接入弹幕形状与对白的范围已被此次要求替代。

RushBoss Demo 继续依赖 thlib 的 TH20 通用应用框架、菜单、玩家、武器、Bomb、弹幕及碰撞、界面、对白时间线和 Boss 演出。入场法阵、开卡双圈、SpellCardAttack、倒计时和背景扭曲保留公共原作实现；具体 Boss 图像与背景通过业务层注入。音乐本次保持现有注入和选择。

后续发布范围仅为底层引擎与 thlib；默认打包生成的独立 SDK 不包含这两个 Demo 或它们的私有素材。请勿将含本机原作资源的目录当作 SDK 发布。原作资源保留原有权利归属，不属于 TS-STG 代码的 MIT 授权；RushBoss 业务衍生代码单独采用 GPL-3.0-only。

方向键移动/选择，Z 射击/确认，X Bomb/返回，Shift 低速，Esc 暂停。无需安装 Node.js。通用接口见 `docs/native-api.md`，共用素材说明见 `packages/thlib/assets/README.md`。
