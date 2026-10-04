const command=['circle',0,0,3,0xffffffff];
Object.defineProperty(command,3,{get(){throw new Error('Expected command getter error');}});
globalThis.__tsstg_game={update(){},render(){return[command];}};
