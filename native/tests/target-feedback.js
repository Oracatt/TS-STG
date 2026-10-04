const target = tsstg.createRenderTarget(64, 64);
globalThis.__tsstg_game = { update() {}, render() { return [['targetBegin',target,0],['sprite',target,32,32,64,64,0,0xffffffff],['targetEnd']]; } };
