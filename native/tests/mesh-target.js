import { DrawList } from '../../packages/thlib/src/render.js';
import { Th20EnemyDistortion } from '../../games/touhou20/src/distortion.js';
const target = tsstg.createRenderTarget(640, 480);
const distortion = new Th20EnemyDistortion({ radius: 112, currentRadius: 112, color: 0xffa0c8ff });
let frame = 0;
globalThis.__tsstg_game = {
  update() { frame++; distortion.update({ x: 0, y: 224 }); },
  render() {
    const draw = new DrawList();
    draw.targetBegin(target, 0x121626ff);
    for (let y = 0; y < 480; y += 20) for (let x = 0; x < 640; x += 20)
      draw.rect(x, y, 20, 20, ((x + y) / 20) % 2 ? 0x506890ff : 0x1c2c46ff);
    draw.rect(0, 0, 60, 60, 0xff3040ff); draw.rect(580, 420, 60, 60, 0x30a0ffff);
    draw.mesh(0, [[480, 20, 0, 0, 0xffff00ff], [600, 20, 0, 0, 0xff0000ff], [540, 120, 0, 0, 0x00ffffff]], [0, 1, 2]);
    draw.targetEnd();
    draw.sampler(target, 'bilinear', 'clamp', 'clamp');
    draw.sprite(target, 480, 360, 960, 720);
    draw.blendFactors('srcAlpha', 'oneMinusSrcAlpha', 'add', 'one', 'zero', 'add');
    distortion.draw(draw, target, { scale: 1.5 });
    draw.blendEnd();
    return draw.commands;
  },
  snapshot() { return { frame, vertices: distortion.mesh.vertices.length, radius: distortion.currentRadius }; }
};
