// Local asset verification: original common bullet artwork and lifecycle, no attack script.
import {DrawList} from '../../packages/thlib/src/render.js';
import {AnmBank} from '../../games/touhou20/src/anm.js';
import {Th20BulletField,th20BulletCommand} from '../../games/touhou20/src/bullets.js';
const host=globalThis.tsstg,read=path=>JSON.parse(host.readText(path));
const bank=new AnmBank(read('games/touhou20/assets/anm/bullet.json'),{loadTexture:(...args)=>host.loadTexture(...args)});
const field=new Th20BulletField({bank,styles:read('games/touhou20/assets/bullet-styles.json').styles});
for(let type=0;type<50;type++)for(let color=0;color<4;color++)field.emit({type,color,x:-167+(type%10)*36+color*7,y:35+Math.floor(type/10)*82,speed:0,shotSound:-1});
const draw=new DrawList();let frame=0;
globalThis.__tsstg_game={update(){field.update();frame++;},render(){draw.reset().clear(0x141925ff);field.draw(draw);return draw.commands;},snapshot(){return {frame,count:field.count,effects:field.effects.length};}};
