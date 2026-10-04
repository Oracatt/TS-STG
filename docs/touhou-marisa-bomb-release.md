# 魔理沙魔炮结束时的 ANM 生命周期

公共实现位于 [`bombs.js`](../packages/thlib/src/touhou/bombs.js) 的 `TouhouMarisaBomb`，两个 Demo 使用同一份实现。

只读原作参考 `D:/AIWorkspace/Touhou20Reconstruction/source_reconstruction/bomb_system/marisa.cpp` 在计时器 300 帧调用 `env::interrupt(beam_handle)` 和 `env::interrupt(handle_74)`。`character_environment.cpp` 的这个函数实际调用 `sprite::interrupt_animation_children(..., 1)`，通过 `sprite_renderer/loading_interrupt.cpp` 通知父动画及其子动画。原作在 300 帧后不再更新魔炮的跟随位置和转向，但 ANM 自己的退出动画继续执行。

以前 JS 只调用 `beam.interrupt(1)`，而该 API 默认不递归。结果是主容器 51 等待 40 帧后销毁，但实际绘制魔炮的 52–56 继续循环、维持亮度；跟随位置停止后看起来像一张残留画面，随后随父容器突然消失。修复在 Bomb 层发送 `interrupt(1, true)`，不改公共 ANM 虚拟机，也不新增人造淡出曲线。

原脚本 `scripts/recovered/anm/pl01.anm.txt` 的退出规则如下；共用资源中的 `pl01.json` 保留这些指令。

| ANM 脚本 | 结束事件 1 的行为 |
| --- | --- |
| 51 主容器 | 停止循环生成 57，40 帧后销毁 |
| 52–56 魔炮各层 | `412(10,4,2,0)` 缩窄、`409(10,0,0)` 淡出，10 帧后销毁 |
| 57 移动波纹 | 没有事件 1 标签，已有波纹继续移动，按自身 32 帧寿命结束 |
| 65 背景光环 | 20 帧缩小并淡出 |

原作 300 帧同一更新内先恢复移动比例 1、随后又写 0.5，这一顺序保留；下一帧 Player 恢复正常比例。发射阻挡在 300 帧解除。主容器的 40 帧退场时间和原作 Bomb 结束判定也保留。

`tests/touhou-marisa-bomb-release.test.js` 用真实公共 ANM 验证五层收束、光环退场、波纹继续运动、玩家恢复移动、结束后的所有子节点清理。两个回归用例在修复前均失败。

原生截图工具 `node tools/verify-touhou-marisa-bomb-release.mjs --prepare` 只生成 300、301、306、311、321、342 帧的入口和调用清单，不启动游戏。去掉 `--prepare` 后才会串行执行宿主截图；可选择 `--backend v8` 或 `--backend quickjs`。它验证公共 Player 与原 ANM 的真实渲染和生命周期，不声称与原作 EXE 逐像素一致。
