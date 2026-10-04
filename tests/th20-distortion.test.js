import test from 'node:test';
import assert from 'node:assert/strict';
import { Th20RenderMesh, Th20StageDistortion, Th20EnemyDistortion, argbToRgba } from '../games/touhou20/src/distortion.js';

test('source mesh initialization accumulates float32 steps, column-major and UV clamped only below zero', () => {
  const mesh = new Th20RenderMesh(3, 4, { viewOffsetX: 0, viewOffsetY: 0, screenWidth: 100, screenHeight: 100 });
  mesh.initialize(-20, -10, 150, 120);
  assert.equal(mesh.vertices[0].u, 0); assert.equal(mesh.vertices[0].v, 0);
  assert.equal(mesh.vertices[8].x, 130); assert.equal(mesh.vertices[8].u, Math.fround(1.3));
  assert.equal(mesh.positions[1].y, 30); assert.equal(mesh.strips.length, 2);
  assert.equal(mesh.geometry().indices.length, 2 * 6 * 3);
});

test('STD source preserves pre-deformation strip copy order and independently advances phases', () => {
  const distortion = new Th20StageDistortion({ mode: 2, phaseX: .3, phaseY: .4 });
  distortion.update(.5);
  const index = distortion.mesh.rows + 2;
  assert.notEqual(distortion.mesh.vertices[index].x, distortion.mesh.positions[index].x);
  assert.equal(distortion.mesh.vertices[index].color, 0xc0ffffff);
  assert.equal(distortion.mesh.strips[1][4].color, 0xffffffff);
  assert.equal(distortion.timer.value, .5);
});

test('enemy distortion grows after reading radius, fades outside circle, and recopies final strips', () => {
  const distortion = new Th20EnemyDistortion({ radius: 112, currentRadius: 16, color: 0xff405080 });
  distortion.update({ x: 0, y: 200 });
  assert.equal(distortion.currentRadius, 18);
  assert.equal(distortion.mesh.positions[0].x, 224 - 16 - 20);
  assert.equal(distortion.mesh.vertices[0].color >>> 24, 0);
  assert.deepEqual(distortion.mesh.strips[0][0], distortion.mesh.vertices[0]);
  assert.equal(argbToRgba(0xaabbccdd), 0xbbccddaa);
});
