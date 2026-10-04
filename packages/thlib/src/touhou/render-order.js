// sprite_renderer/dispatch.cpp and controller_callbacks.inc. Effective layer
// numbers are NOT scheduler priorities (notably layer 45 precedes layer 26).
export const TOUHOU_LAYER_PRIORITIES = Object.freeze({0:5,1:7,2:9,3:10,4:11,5:13,6:16,7:18,8:20,9:21,10:22,11:24,12:27,13:28,14:33,15:34,16:37,17:40,18:43,19:46,20:49,21:50,22:60,23:62,24:64,25:65,26:72,27:68,28:69,29:73,30:76,31:78,32:81,33:83,34:98,35:100,36:103,37:105,38:107,45:63,46:74,47:77,48:79,49:80,50:82,51:99,52:101,53:104,54:106,55:108});
// Embedded animations are drawn by their owner, rather than an ANM layer
// callback. Registered children/effects still use TOUHOU_LAYER_PRIORITIES.
// Source: each owner's lifecycle/controller registrations, not update priorities.
export const TOUHOU_OWNER_PRIORITIES = Object.freeze({stageBackground:3,stageForeground:6,itemBack:19,enemyOverlay:23,player:30,item:35,laser:39,bullet:41,graze:42,bomb:44,bossLabel:60,spellText:84});
export function effectiveAnmLayer(layer,secondary=false){return secondary?(layer>=29&&layer<=36?layer+17:layer===26?45:47):(layer>=46&&layer<=53?layer-17:layer===45?26:layer);}
export function anmDrawPriority(layer,secondary=false,priorities=TOUHOU_LAYER_PRIORITIES){return priorities[effectiveAnmLayer(layer,secondary)];}
