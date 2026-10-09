# 暂停和结果菜单的可选行

`TouhouPause` 与 `TouhouGameOver` 的 `hiddenChoices` 可以删除不需要的公共菜单行，并让后面的实际菜单行向上补齐。省略该选项或传入 `[]` 时，仍使用原作完整布局；未提供回调的行继续显示为不可用，不会自动隐藏。

```js
const game = new TouhouGame({
  // banks、font、sht、styles 及业务回调……
  pauseOptions: {hiddenChoices: ['options']},
  gameOverOptions: {hiddenChoices: ['options']},
});
```

单独创建公共菜单时，直接给其构造选项传 `hiddenChoices`。可用名称为 `resume`、`continue`、`exit`、`replay`、`manual`、`options`、`restart`；`resume` 和 `continue` 都指该菜单的第一项。名称数组可以是只读数组，构造后由菜单保存独立集合；未知名称会报错。隐藏行不参与上下导航、确认或重开/退出快捷操作。暂停键仍可恢复暂停游戏；结果菜单显式隐藏 Continue 时，暂停键不会触发它。配置隐藏行时，如果 Continue 与 Exit 都不可用，暂停键也不关闭结果菜单；使用保留的菜单操作离开。结果菜单应至少保留一个具有回调、可用的离开或重开操作。

`TouhouGame.pauseOptions` 可以提供暂停菜单回调与显示选项。游戏保留 `bank`、`initialMask`、`capture` 的资源和输入所有权；其恢复回调先解除游戏暂停，再调用可选的 `pauseOptions.onResume`。结果菜单继续使用已有的 `gameOverOptions`。

布局基于 `front.anm` 实际创建的菜单行，按行的世界纵坐标排序，不根据 choice 数字或 children 创建顺序推算缺失行。普通暂停/结果菜单原始行距是 66 raw，即当前 960×720 视图下的 49.5 像素；重开暂停/练习结果菜单的实际四行间距是 80 raw，即 60 像素。隐藏多个选项时，剩余行依次使用原布局最前面的实际行槽。

绘制助手仅跳过指定行的子树并平移提交给公共队列的 `view.y`。它不修改 ANM 指令、位置、插值、时间或生命周期，隐藏行仍正常更新。背景花纹使用原优先级 77，菜单文字使用原优先级 99；确认标题及 Yes/No（脚本 141–143）不属于主菜单行，不隐藏、不补位。原有 10 帧开场门、确认页 20/30/20 帧门和 12 帧关闭门不变。

保存回放的续关限制只排除导航，不使用“缺少回调”的近透明禁用样式。原作 `pause_system/menu.cpp` 发出 Replay 的中断 5 后，立即递归选择主菜单；后一次中断覆盖待执行的 5，Replay 走未选中灰色分支，开场淡入结束后透明度为 255。该文件的 `result_menu` 函数也只排除续关后的 Replay 光标。公共菜单分别维护导航排除与视觉禁用集合，续关只加入前者；缺少回调的其他不可用行保持已有样式。移动光标、从说明页返回、取消退出或重开确认均保持该区分。拾取残机或残机碎片不等于 Continue，不会禁用回放。

`tests/touhou-menu-hidden-choices.test.js` 使用真实 common front ANM，覆盖默认绘制命令不变、普通/重开/练习/完成结果的补位、多个隐藏行及子树、导航、退出/重开/保存回放确认、返回外部页面、无 Continue 的结果快捷键、独立双行面板和实际 `TouhouGame` 配置传递。原生截图由使用方的界面验收另行覆盖；Node 绘制命令回归不等于 GPU 像素验收。

`tests/touhou-menu-replay-availability.test.js` 使用默认与中文两套真实 ANM，逐帧检查续关后的保存回放行淡入、实际提交颜色和不变的位置，并覆盖不可选导航、恢复/取消确认与普通残机拾取。菜单快照继续只记录输入/阶段/导航状态；这次灰色显示修正没有加入新的快照字段。
