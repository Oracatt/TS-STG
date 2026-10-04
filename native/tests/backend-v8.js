if(tsstg.backend!=='v8')throw new Error('Requested V8 but a different runtime was used');
for(const name of ['process','require','Buffer'])if(typeof globalThis[name]!=='undefined')throw new Error('Node process fallback is forbidden');
globalThis.__tsstg_game={update(){},render(){return[];},snapshot(){return{backend:'v8',embedded:true};}};
