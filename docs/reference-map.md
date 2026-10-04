# 参考实现与设计边界

参考目录：`D:/AIWorkspace/Touhou20Reconstruction/source_reconstruction`，只读。TS-STG 是新的通用引擎，不链接 TH20 重建模块、不依赖原版 DAT，也不主张逐帧等价。通用 Moonlit 示例的图形与音乐为本工程生成；锦上京 Demo 使用本机导入的原作资源。thlib 通用素材包按用途选择标准弹幕/Bomb/特效，素材来源与代码许可分别记录，不把作品专属界面或机制归入通用库。

| 参考源码 | 提取的通用概念 | TS-STG 实现位置 |
| --- | --- | --- |
| `bullet_system/shot_pattern.cpp` | 自机狙、固定角、环形、奇偶扇形、多层速度、随机散射 | thlib `patterns.js` |
| `bullet_system/movement.cpp` | 加速度、角速度、延时转向、跟踪、坐标插值、边界绕回 | thlib `bullets.js`、`task.js` |
| `bullet_system/player_collision.cpp`、`cancellation.cpp` | 命中和擦弹独立判定、消弹生命周期 | thlib `world.js`、`player.js` |
| `laser_system/type1_frame.cpp` | 预警、伸长、持续、收缩阶段，旋转线段判定 | thlib `lasers.js` |
| `laser_system/type2*` | 采样轨迹形成曲线激光 | thlib `lasers.js` |
| `player_entity/movement.cpp`、`death_state.cpp`、`firing.cpp` | 高低速、自机状态、决死窗口、复活无敌、周期武器 | thlib `player.js` |
| `bomb_system`、`damage_regions` | Bomb 的消弹、持续伤害和无敌相互协作 | thlib `player.js`、`world.js` |
| `card_system/start.cpp`、`update.cpp`、`finish.cpp` | 符卡开始、时间衰减、失误/Bomb 失去收取资格、结束奖励 | thlib `boss.js` |
| `item_system`、`small_score` | 道具收集、火力与得分、残机/Bomb 资源 | thlib `items.js` |
| `replay_system` | 输入流、种子、关卡初始配置决定回放 | thlib `replay.js` |
| `title_system`、`pause_system`、`stage_completion` | 菜单、暂停、结算是脚本层场景 | thlib `menu.js`、`game.js` |

thlib 通用 API 不沿用 TH20 的 32 位对象布局、地址、ECL/ANM 指令或魔石系统。锦上京 Demo 自己实现并解释所需 ANM/SHT 规则，位于 games/touhou20/src。通用 API 使用 ES modules、弧度、右下为正的坐标和帧单位。数值配置可由使用方调整；各作不同的判定半径、决死帧数、初始资源和计分公式不硬编码成“全系列统一标准”。

底层架构参考 [LuaSTG Sub](https://github.com/Legacy-LuaSTG-Engine/LuaSTG-Sub) 的 native/script 分层。依赖选择参考 [QuickJS-NG Windows/CMake 构建文档](https://quickjs-ng.github.io/quickjs/building/) 和 [raylib API](https://www.raylib.com/cheatsheet/cheatsheet.html)。此处的参考链接不意味着依赖版本自动跟随最新。
