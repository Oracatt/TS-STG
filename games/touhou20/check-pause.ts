// Imported-resource render fixture; no copyrighted resources are distributed.
import {AnmBank} from '../../games/touhou20/src/anm.js';
import {Th20Pause} from '../../games/touhou20/src/pause.js';
import {DrawList} from '../../packages/thlib/dist/render.js';
const host=globalThis.tsstg,bank=new AnmBank(JSON.parse(host.readText('games/touhou20/assets/anm/front.json')),{loadTexture:(...args)=>host.loadTexture(...args)});
const pause=new Th20Pause({bank,onExit(){},onRestart(){}}),draw=new DrawList();
globalThis.__tsstg_game={update(input:number){pause.update(input);},render(){draw.reset().clear(0x222033ff);pause.draw(draw);return draw.commands;},snapshot(){return pause.snapshot();}};
