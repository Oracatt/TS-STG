// Semantic rows of the shared front.anm pause/result panels. Confirmation
// headings and Yes/No scripts are deliberately outside this mapping.
const choiceByScript = new Map([
  [119, 0], [120, 1], [121, 2], [122, 3], [123, 4], [124, 5],
  [125, 0], [126, 1], [127, 2], [128, 3], [129, 4], [130, 5],
  [131, 0], [132, 1], [133, 4], [134, 5],
  [135, 1], [136, 5],
  [137, 1], [138, 2], [139, 4], [140, 5],
]);
const choiceByName = Object.freeze({resume:0,continue:0,exit:1,replay:2,manual:3,options:4,restart:5});

export function hiddenTouhouMenuChoices(names = []) {
  if (!Array.isArray(names)) throw new TypeError('hiddenChoices must be an array of menu choice names');
  const hidden = new Set();
  for (const name of names) {
    if (!Object.hasOwn(choiceByName, name)) throw new RangeError(`Unknown hidden menu choice: ${name}`);
    hidden.add(choiceByName[name]);
  }
  return hidden;
}

/** Paint only this panel tree through the owner's priority queue. Translation
 * changes the submitted view, never the ANM transforms or animation clock.
 * Actual row positions also handle the four-row restart/practice variants. */
export function drawTouhouMenuPanel(panel, queue, view, hidden) {
  if (!panel) return;
  if (!hidden.size) { panel.draw(queue, view); return; }
  const rows = [];
  const collect = vm => {
    if (!vm.alive) return;
    if (choiceByScript.has(vm.scriptId)) rows.push({vm, choice:choiceByScript.get(vm.scriptId), y:vm.worldPosition(view).y});
    else for (const child of vm.children) collect(child);
  };
  collect(panel); rows.sort((a, b) => a.y - b.y || a.vm.id - b.vm.id);
  const rowViews = new Map(); let slot = 0;
  for (const row of rows) {
    if (hidden.has(row.choice)) rowViews.set(row.vm, null);
    else {
      const dy = (rows[slot++].y - row.y) * (view.scale ?? 1);
      rowViews.set(row.vm, dy === 0 ? view : {...view, y:(view.y ?? 0) + dy});
    }
  }
  const paint = (vm, inheritedView) => {
    if (!vm.alive) return;
    const rowView = rowViews.has(vm) ? rowViews.get(vm) : inheritedView;
    if (rowView === null) return; // A hidden row's descendants are hidden too.
    vm.drawSelf(queue, rowView);
    for (const child of vm.children) paint(child, rowView);
  };
  paint(panel, view);
}
