import type {AnmData,AnmEnvironment,TouhouBulletStyle,TouhouSht} from '@ts-stg/thlib/touhou';
// Local render verification fixture; uses only the user's imported resources.
import { DrawList } from '../../packages/thlib/dist/render.js';
import { AnmBank } from '../../games/touhou20/src/anm-vm.js';
import { Th20BitmapFont } from '../../games/touhou20/src/font.js';
import { Th20Hud } from '../../games/touhou20/src/hud.js';
import { Th20Player } from '../../games/touhou20/src/player.js';
const host=globalThis.tsstg, read=<T=AnmData>(path:string):T=>JSON.parse(host.readText(path));
const adapter:Required<Pick<AnmEnvironment,'loadTexture'>>={loadTexture:(...args)=>host.loadTexture(...args)};
const bank=(name:string)=>new AnmBank(read(`games/touhou20/assets/anm/${name}.json`),adapter);
const front=bank('front'), font=new Th20BitmapFont(read('games/touhou20/assets/anm/ascii_960.json'),adapter);
const hud=new Th20Hud({bank:front,font});
const player=new Th20Player({character:0,sht:read<TouhouSht>('games/touhou20/assets/shots/pl00.json'),bank:bank('pl00'),effectBank:bank('effect'),power:400});
const draw=new DrawList();let frame=0;
globalThis.__tsstg_game={
 update(input:number){player.update(input,{enemies:[]});hud.update(player);frame++;},
 render(){draw.reset().clear(0x161525ff);player.draw(draw,{x:336,y:24,scale:1.5});hud.draw(draw,player);return draw.commands;},
 snapshot(){return {frame,x:player.x,y:player.y,state:player.state};}
};
