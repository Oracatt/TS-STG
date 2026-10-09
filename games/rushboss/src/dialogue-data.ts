// SPDX-License-Identifier: GPL-3.0-only
import type {TouhouDialogueStep} from '@ts-stg/thlib/touhou';
export interface RushDialogueStep extends TouhouDialogueStep{step:number;sourceLine:number;balloon?:{sourceType:number;position:number[];length:number;inverted:boolean};portraits?:{left?:{character:string;active:boolean;emotion:string;present?:boolean};right?:{character:string;active:boolean;emotion:string;present?:boolean}}}
export interface RushDialogueSequence{id:string;sourceClass:string;bossId:string;character:number;phase:string;startDelayFrames:number;steps:RushDialogueStep[];}
// Generated from RushBoss DialogDeriver.h; do not hand-edit source dialogue.
export const RUSH_DIALOGUE_DATA: {format:string;sources:Record<string,{sha256:string;bytes:number}>;counts:{classes:number;steps:number;lines:number};missing:Record<string,string>;sequences:Record<string,RushDialogueSequence>} = {
  "format": "ts-stg-rush-dialogue-v1",
  "sources": {
    "src/DialogDeriver.h": {
      "sha256": "c4c8ef6dab55362c8fd2850dc64fd9c45900fc02c81ae2630aa48afb8f6253ba",
      "bytes": 20354
    },
    "src/Dialog.h": {
      "sha256": "553d0b24679b3aa6511f9a47ed5ec56a067f3c14e5d1122155c8198ac797bc20",
      "bytes": 1781
    },
    "src/Dialog.cpp": {
      "sha256": "93231de5a93ac62386826de41c936ef827b9e211adff2150724a658809974cac",
      "bytes": 563
    },
    "src/Face.h": {
      "sha256": "7ecf2611d9559d1c287e31194056217176e5e583683a57254ab12a5c19ab14dc",
      "bytes": 7290
    },
    "src/GSObjects.h": {
      "sha256": "09c44e7a60ff775374b152c7f7ff201e6193da5278fc99c55926e09bd1f78984",
      "bytes": 62653
    }
  },
  "counts": {
    "classes": 10,
    "steps": 84,
    "lines": 74
  },
  "missing": {
    "artia:0:after": "No source after-battle dialogue; GSObjects::Victory provides results only",
    "artia:1:after": "No source after-battle dialogue; GSObjects::Victory provides results only"
  },
  "sequences": {
    "artia:0:before": {
      "id": "artia:0:before",
      "sourceClass": "Dialog_Reimu_Artia",
      "bossId": "artia",
      "character": 0,
      "phase": "before",
      "startDelayFrames": 0,
      "steps": [
        {
          "step": 0,
          "sourceLine": 13,
          "coldFrames": 30,
          "autoFrames": 300,
          "events": [
            {
              "type": "portrait",
              "side": "left",
              "character": "reimu"
            },
            {
              "type": "active",
              "side": "left",
              "value": true
            },
            {
              "type": "emotion",
              "side": "left",
              "value": "PUZZLED"
            },
            {
              "type": "text",
              "speaker": "left",
              "text": "这又是什么奇怪的地方..."
            }
          ],
          "text": "这又是什么奇怪的地方...",
          "speaker": "left",
          "emotion": "PUZZLED",
          "balloon": {
            "sourceType": 1,
            "position": [
              -150,
              -30
            ],
            "length": 5,
            "inverted": false
          },
          "portraits": {
            "left": {
              "character": "reimu",
              "active": true,
              "emotion": "PUZZLED",
              "present": true
            },
            "right": {
              "character": "artia",
              "active": false,
              "emotion": "NOTICE"
            }
          }
        },
        {
          "step": 1,
          "sourceLine": 19,
          "coldFrames": 2,
          "autoFrames": 500,
          "events": [
            {
              "type": "text",
              "speaker": "left",
              "text": "一眨眼的功夫居然到了晚上，究竟是谁在搞鬼啊"
            }
          ],
          "text": "一眨眼的功夫居然到了晚上，究竟是谁在搞鬼啊",
          "speaker": "left",
          "emotion": "PUZZLED",
          "balloon": {
            "sourceType": 1,
            "position": [
              -150,
              -30
            ],
            "length": 5,
            "inverted": false
          },
          "portraits": {
            "left": {
              "character": "reimu",
              "active": true,
              "emotion": "PUZZLED",
              "present": true
            },
            "right": {
              "character": "artia",
              "active": false,
              "emotion": "NOTICE"
            }
          }
        },
        {
          "step": 2,
          "sourceLine": 22,
          "coldFrames": 120,
          "autoFrames": 500,
          "events": [
            {
              "type": "spawnBoss",
              "bossId": "artia"
            },
            {
              "type": "bossLife",
              "value": 6
            },
            {
              "type": "bossPosition",
              "position": [
                0,
                100,
                0
              ]
            },
            {
              "type": "revealBoss"
            },
            {
              "type": "active",
              "side": "left",
              "value": false
            },
            {
              "type": "emotion",
              "side": "left",
              "value": "SURPRISE"
            },
            {
              "type": "text",
              "speaker": "right",
              "text": "这是哪位迷路的小朋友？"
            }
          ],
          "text": "这是哪位迷路的小朋友？",
          "speaker": "right",
          "emotion": "NOTICE",
          "balloon": {
            "sourceType": 4,
            "position": [
              0,
              60
            ],
            "length": 5,
            "inverted": false
          },
          "portraits": {
            "left": {
              "character": "reimu",
              "active": false,
              "emotion": "SURPRISE",
              "present": true
            },
            "right": {
              "character": "artia",
              "active": false,
              "emotion": "NOTICE"
            }
          }
        },
        {
          "step": 3,
          "sourceLine": 35,
          "coldFrames": 2,
          "autoFrames": 500,
          "events": [
            {
              "type": "bossName",
              "index": 2
            },
            {
              "type": "portrait",
              "side": "right",
              "character": "artia"
            },
            {
              "type": "active",
              "side": "right",
              "value": true
            },
            {
              "type": "emotion",
              "side": "right",
              "value": "HAPPY"
            },
            {
              "type": "text",
              "speaker": "right",
              "text": "啊呀，没想到竟然是灵梦小姐"
            }
          ],
          "text": "啊呀，没想到竟然是灵梦小姐",
          "speaker": "right",
          "emotion": "HAPPY",
          "balloon": {
            "sourceType": 4,
            "position": [
              150,
              -30
            ],
            "length": 5,
            "inverted": true
          },
          "portraits": {
            "left": {
              "character": "reimu",
              "active": false,
              "emotion": "SURPRISE",
              "present": true
            },
            "right": {
              "character": "artia",
              "active": true,
              "emotion": "HAPPY",
              "present": true
            }
          }
        },
        {
          "step": 4,
          "sourceLine": 42,
          "coldFrames": 2,
          "autoFrames": 500,
          "events": [
            {
              "type": "active",
              "side": "left",
              "value": true
            },
            {
              "type": "active",
              "side": "right",
              "value": false
            },
            {
              "type": "emotion",
              "side": "left",
              "value": "DISAPPOINT"
            },
            {
              "type": "emotion",
              "side": "right",
              "value": "NOTICE"
            },
            {
              "type": "text",
              "speaker": "left",
              "text": "嗯？我之前可从来不认识你"
            }
          ],
          "text": "嗯？我之前可从来不认识你",
          "speaker": "left",
          "emotion": "DISAPPOINT",
          "balloon": {
            "sourceType": 1,
            "position": [
              -150,
              -30
            ],
            "length": 5,
            "inverted": false
          },
          "portraits": {
            "left": {
              "character": "reimu",
              "active": true,
              "emotion": "DISAPPOINT",
              "present": true
            },
            "right": {
              "character": "artia",
              "active": false,
              "emotion": "NOTICE",
              "present": true
            }
          }
        },
        {
          "step": 5,
          "sourceLine": 49,
          "coldFrames": 2,
          "autoFrames": 500,
          "events": [
            {
              "type": "active",
              "side": "left",
              "value": false
            },
            {
              "type": "active",
              "side": "right",
              "value": true
            },
            {
              "type": "emotion",
              "side": "right",
              "value": "HAPPY"
            },
            {
              "type": "text",
              "speaker": "right",
              "text": "没关系，在我们那里，灵梦小姐可是人尽皆知呢"
            }
          ],
          "text": "没关系，在我们那里，灵梦小姐可是人尽皆知呢",
          "speaker": "right",
          "emotion": "HAPPY",
          "balloon": {
            "sourceType": 4,
            "position": [
              150,
              -30
            ],
            "length": 6,
            "inverted": true
          },
          "portraits": {
            "left": {
              "character": "reimu",
              "active": false,
              "emotion": "DISAPPOINT",
              "present": true
            },
            "right": {
              "character": "artia",
              "active": true,
              "emotion": "HAPPY",
              "present": true
            }
          }
        },
        {
          "step": 6,
          "sourceLine": 55,
          "coldFrames": 2,
          "autoFrames": 500,
          "events": [
            {
              "type": "active",
              "side": "left",
              "value": true
            },
            {
              "type": "active",
              "side": "right",
              "value": false
            },
            {
              "type": "emotion",
              "side": "left",
              "value": "NOTICE"
            },
            {
              "type": "emotion",
              "side": "right",
              "value": "NOTICE"
            },
            {
              "type": "text",
              "speaker": "left",
              "text": "除了幻想乡，那就是外面的世界喽"
            }
          ],
          "text": "除了幻想乡，那就是外面的世界喽",
          "speaker": "left",
          "emotion": "NOTICE",
          "balloon": {
            "sourceType": 1,
            "position": [
              -150,
              -30
            ],
            "length": 5,
            "inverted": false
          },
          "portraits": {
            "left": {
              "character": "reimu",
              "active": true,
              "emotion": "NOTICE",
              "present": true
            },
            "right": {
              "character": "artia",
              "active": false,
              "emotion": "NOTICE",
              "present": true
            }
          }
        },
        {
          "step": 7,
          "sourceLine": 62,
          "coldFrames": 2,
          "autoFrames": 500,
          "events": [
            {
              "type": "active",
              "side": "left",
              "value": false
            },
            {
              "type": "active",
              "side": "right",
              "value": true
            },
            {
              "type": "emotion",
              "side": "left",
              "value": "DISAPPOINT"
            },
            {
              "type": "emotion",
              "side": "right",
              "value": "SWEAT"
            },
            {
              "type": "text",
              "speaker": "right",
              "text": "那倒也不是"
            }
          ],
          "text": "那倒也不是",
          "speaker": "right",
          "emotion": "SWEAT",
          "balloon": {
            "sourceType": 4,
            "position": [
              150,
              -30
            ],
            "length": 3,
            "inverted": true
          },
          "portraits": {
            "left": {
              "character": "reimu",
              "active": false,
              "emotion": "DISAPPOINT",
              "present": true
            },
            "right": {
              "character": "artia",
              "active": true,
              "emotion": "SWEAT",
              "present": true
            }
          }
        },
        {
          "step": 8,
          "sourceLine": 69,
          "coldFrames": 2,
          "autoFrames": 500,
          "events": [
            {
              "type": "emotion",
              "side": "right",
              "value": "DISAPPOINT"
            },
            {
              "type": "text",
              "speaker": "right",
              "text": "事实上，外面的世界是什么样子，我也没有见过"
            }
          ],
          "text": "事实上，外面的世界是什么样子，我也没有见过",
          "speaker": "right",
          "emotion": "DISAPPOINT",
          "balloon": {
            "sourceType": 4,
            "position": [
              150,
              -30
            ],
            "length": 6,
            "inverted": true
          },
          "portraits": {
            "left": {
              "character": "reimu",
              "active": false,
              "emotion": "DISAPPOINT",
              "present": true
            },
            "right": {
              "character": "artia",
              "active": true,
              "emotion": "DISAPPOINT",
              "present": true
            }
          }
        },
        {
          "step": 9,
          "sourceLine": 73,
          "coldFrames": 2,
          "autoFrames": 500,
          "events": [
            {
              "type": "emotion",
              "side": "left",
              "value": "SURPRISE"
            },
            {
              "type": "emotion",
              "side": "right",
              "value": "HAPPY"
            },
            {
              "type": "text",
              "speaker": "right",
              "text": "但是我知道，外面的那些人们，现在正在屏幕上看着我们呢"
            }
          ],
          "text": "但是我知道，外面的那些人们，现在正在屏幕上看着我们呢",
          "speaker": "right",
          "emotion": "HAPPY",
          "balloon": {
            "sourceType": 4,
            "position": [
              150,
              -30
            ],
            "length": 6,
            "inverted": true
          },
          "portraits": {
            "left": {
              "character": "reimu",
              "active": false,
              "emotion": "SURPRISE",
              "present": true
            },
            "right": {
              "character": "artia",
              "active": true,
              "emotion": "HAPPY",
              "present": true
            }
          }
        },
        {
          "step": 10,
          "sourceLine": 78,
          "coldFrames": 2,
          "autoFrames": 500,
          "events": [
            {
              "type": "active",
              "side": "left",
              "value": true
            },
            {
              "type": "active",
              "side": "right",
              "value": false
            },
            {
              "type": "emotion",
              "side": "right",
              "value": "NOTICE"
            },
            {
              "type": "text",
              "speaker": "left",
              "text": "我们？现在？"
            }
          ],
          "text": "我们？现在？",
          "speaker": "left",
          "emotion": "SURPRISE",
          "balloon": {
            "sourceType": 1,
            "position": [
              -150,
              -30
            ],
            "length": 4,
            "inverted": false
          },
          "portraits": {
            "left": {
              "character": "reimu",
              "active": true,
              "emotion": "SURPRISE",
              "present": true
            },
            "right": {
              "character": "artia",
              "active": false,
              "emotion": "NOTICE",
              "present": true
            }
          }
        },
        {
          "step": 11,
          "sourceLine": 84,
          "coldFrames": 2,
          "autoFrames": 500,
          "events": [
            {
              "type": "active",
              "side": "left",
              "value": false
            },
            {
              "type": "active",
              "side": "right",
              "value": true
            },
            {
              "type": "text",
              "speaker": "right",
              "text": "没错，而且我已经感受到观众们的兴奋了"
            }
          ],
          "text": "没错，而且我已经感受到观众们的兴奋了",
          "speaker": "right",
          "emotion": "NOTICE",
          "balloon": {
            "sourceType": 4,
            "position": [
              150,
              -30
            ],
            "length": 6,
            "inverted": true
          },
          "portraits": {
            "left": {
              "character": "reimu",
              "active": false,
              "emotion": "SURPRISE",
              "present": true
            },
            "right": {
              "character": "artia",
              "active": true,
              "emotion": "NOTICE",
              "present": true
            }
          }
        },
        {
          "step": 12,
          "sourceLine": 89,
          "coldFrames": 2,
          "autoFrames": 500,
          "events": [
            {
              "type": "emotion",
              "side": "right",
              "value": "HAPPY"
            },
            {
              "type": "text",
              "speaker": "right",
              "text": "这将是一次无比精彩的直播！"
            }
          ],
          "text": "这将是一次无比精彩的直播！",
          "speaker": "right",
          "emotion": "HAPPY",
          "balloon": {
            "sourceType": 4,
            "position": [
              150,
              -30
            ],
            "length": 5,
            "inverted": true
          },
          "portraits": {
            "left": {
              "character": "reimu",
              "active": false,
              "emotion": "SURPRISE",
              "present": true
            },
            "right": {
              "character": "artia",
              "active": true,
              "emotion": "HAPPY",
              "present": true
            }
          }
        },
        {
          "step": 13,
          "sourceLine": 93,
          "coldFrames": 2,
          "autoFrames": 500,
          "events": [
            {
              "type": "bossMagicSquare"
            },
            {
              "type": "startAttack",
              "attack": "Artia_SC_1"
            },
            {
              "type": "complete"
            }
          ],
          "terminal": true,
          "portraits": {
            "left": {
              "character": "reimu",
              "active": false,
              "emotion": "SURPRISE",
              "present": true
            },
            "right": {
              "character": "artia",
              "active": true,
              "emotion": "HAPPY",
              "present": true
            }
          }
        }
      ]
    },
    "artia:1:before": {
      "id": "artia:1:before",
      "sourceClass": "Dialog_Marisa_Artia",
      "bossId": "artia",
      "character": 1,
      "phase": "before",
      "startDelayFrames": 0,
      "steps": [
        {
          "step": 0,
          "sourceLine": 110,
          "coldFrames": 30,
          "autoFrames": 300,
          "events": [
            {
              "type": "portrait",
              "side": "left",
              "character": "marisa"
            },
            {
              "type": "active",
              "side": "left",
              "value": true
            },
            {
              "type": "emotion",
              "side": "left",
              "value": "PUZZLED"
            },
            {
              "type": "text",
              "speaker": "left",
              "text": "好冷啊...这诡异的天气"
            }
          ],
          "text": "好冷啊...这诡异的天气",
          "speaker": "left",
          "emotion": "PUZZLED",
          "balloon": {
            "sourceType": 1,
            "position": [
              -150,
              -30
            ],
            "length": 5,
            "inverted": false
          },
          "portraits": {
            "left": {
              "character": "marisa",
              "active": true,
              "emotion": "PUZZLED",
              "present": true
            },
            "right": {
              "character": "artia",
              "active": false,
              "emotion": "NOTICE"
            }
          }
        },
        {
          "step": 1,
          "sourceLine": 116,
          "coldFrames": 2,
          "autoFrames": 500,
          "events": [
            {
              "type": "emotion",
              "side": "left",
              "value": "ANGRY"
            },
            {
              "type": "text",
              "speaker": "left",
              "text": "这附近一定有什么人在作妖吧"
            }
          ],
          "text": "这附近一定有什么人在作妖吧",
          "speaker": "left",
          "emotion": "ANGRY",
          "balloon": {
            "sourceType": 1,
            "position": [
              -150,
              -30
            ],
            "length": 5,
            "inverted": false
          },
          "portraits": {
            "left": {
              "character": "marisa",
              "active": true,
              "emotion": "ANGRY",
              "present": true
            },
            "right": {
              "character": "artia",
              "active": false,
              "emotion": "NOTICE"
            }
          }
        },
        {
          "step": 2,
          "sourceLine": 120,
          "coldFrames": 120,
          "autoFrames": 500,
          "events": [
            {
              "type": "spawnBoss",
              "bossId": "artia"
            },
            {
              "type": "bossLife",
              "value": 6
            },
            {
              "type": "bossPosition",
              "position": [
                0,
                100,
                0
              ]
            },
            {
              "type": "revealBoss"
            },
            {
              "type": "active",
              "side": "left",
              "value": false
            },
            {
              "type": "emotion",
              "side": "left",
              "value": "SURPRISE"
            },
            {
              "type": "text",
              "speaker": "right",
              "text": "骑着扫帚的家伙？难道是..."
            }
          ],
          "text": "骑着扫帚的家伙？难道是...",
          "speaker": "right",
          "emotion": "NOTICE",
          "balloon": {
            "sourceType": 4,
            "position": [
              0,
              60
            ],
            "length": 5,
            "inverted": false
          },
          "portraits": {
            "left": {
              "character": "marisa",
              "active": false,
              "emotion": "SURPRISE",
              "present": true
            },
            "right": {
              "character": "artia",
              "active": false,
              "emotion": "NOTICE"
            }
          }
        },
        {
          "step": 3,
          "sourceLine": 133,
          "coldFrames": 2,
          "autoFrames": 500,
          "events": [
            {
              "type": "bossName",
              "index": 2
            },
            {
              "type": "portrait",
              "side": "right",
              "character": "artia"
            },
            {
              "type": "active",
              "side": "right",
              "value": true
            },
            {
              "type": "emotion",
              "side": "right",
              "value": "HAPPY"
            },
            {
              "type": "text",
              "speaker": "right",
              "text": "啊哈！果然和我想的一样"
            }
          ],
          "text": "啊哈！果然和我想的一样",
          "speaker": "right",
          "emotion": "HAPPY",
          "balloon": {
            "sourceType": 4,
            "position": [
              150,
              -30
            ],
            "length": 5,
            "inverted": true
          },
          "portraits": {
            "left": {
              "character": "marisa",
              "active": false,
              "emotion": "SURPRISE",
              "present": true
            },
            "right": {
              "character": "artia",
              "active": true,
              "emotion": "HAPPY",
              "present": true
            }
          }
        },
        {
          "step": 4,
          "sourceLine": 140,
          "coldFrames": 2,
          "autoFrames": 500,
          "events": [
            {
              "type": "active",
              "side": "left",
              "value": true
            },
            {
              "type": "active",
              "side": "right",
              "value": false
            },
            {
              "type": "emotion",
              "side": "left",
              "value": "DISAPPOINT"
            },
            {
              "type": "emotion",
              "side": "right",
              "value": "NOTICE"
            },
            {
              "type": "text",
              "speaker": "left",
              "text": "等等，你是不是应该先自我介绍一下？"
            }
          ],
          "text": "等等，你是不是应该先自我介绍一下？",
          "speaker": "left",
          "emotion": "DISAPPOINT",
          "balloon": {
            "sourceType": 1,
            "position": [
              -150,
              -30
            ],
            "length": 6,
            "inverted": false
          },
          "portraits": {
            "left": {
              "character": "marisa",
              "active": true,
              "emotion": "DISAPPOINT",
              "present": true
            },
            "right": {
              "character": "artia",
              "active": false,
              "emotion": "NOTICE",
              "present": true
            }
          }
        },
        {
          "step": 5,
          "sourceLine": 147,
          "coldFrames": 2,
          "autoFrames": 500,
          "events": [
            {
              "type": "active",
              "side": "left",
              "value": false
            },
            {
              "type": "active",
              "side": "right",
              "value": true
            },
            {
              "type": "emotion",
              "side": "left",
              "value": "NOTICE"
            },
            {
              "type": "emotion",
              "side": "right",
              "value": "HAPPY"
            },
            {
              "type": "text",
              "speaker": "right",
              "text": "没时间了，外面的观众们都已经等不及了！"
            }
          ],
          "text": "没时间了，外面的观众们都已经等不及了！",
          "speaker": "right",
          "emotion": "HAPPY",
          "balloon": {
            "sourceType": 4,
            "position": [
              150,
              -30
            ],
            "length": 6,
            "inverted": true
          },
          "portraits": {
            "left": {
              "character": "marisa",
              "active": false,
              "emotion": "NOTICE",
              "present": true
            },
            "right": {
              "character": "artia",
              "active": true,
              "emotion": "HAPPY",
              "present": true
            }
          }
        },
        {
          "step": 6,
          "sourceLine": 154,
          "coldFrames": 2,
          "autoFrames": 500,
          "events": [
            {
              "type": "active",
              "side": "left",
              "value": true
            },
            {
              "type": "active",
              "side": "right",
              "value": false
            },
            {
              "type": "emotion",
              "side": "left",
              "value": "SWEAT"
            },
            {
              "type": "emotion",
              "side": "right",
              "value": "NOTICE"
            },
            {
              "type": "text",
              "speaker": "left",
              "text": "什么观众？这里明明只有我们两个人"
            }
          ],
          "text": "什么观众？这里明明只有我们两个人",
          "speaker": "left",
          "emotion": "SWEAT",
          "balloon": {
            "sourceType": 1,
            "position": [
              -150,
              -30
            ],
            "length": 5,
            "inverted": false
          },
          "portraits": {
            "left": {
              "character": "marisa",
              "active": true,
              "emotion": "SWEAT",
              "present": true
            },
            "right": {
              "character": "artia",
              "active": false,
              "emotion": "NOTICE",
              "present": true
            }
          }
        },
        {
          "step": 7,
          "sourceLine": 161,
          "coldFrames": 2,
          "autoFrames": 500,
          "events": [
            {
              "type": "emotion",
              "side": "left",
              "value": "ANGRY"
            },
            {
              "type": "text",
              "speaker": "left",
              "text": "不管你是谁，这鬼天气跟你一定脱不了关系吧"
            }
          ],
          "text": "不管你是谁，这鬼天气跟你一定脱不了关系吧",
          "speaker": "left",
          "emotion": "ANGRY",
          "balloon": {
            "sourceType": 1,
            "position": [
              -150,
              -30
            ],
            "length": 6,
            "inverted": false
          },
          "portraits": {
            "left": {
              "character": "marisa",
              "active": true,
              "emotion": "ANGRY",
              "present": true
            },
            "right": {
              "character": "artia",
              "active": false,
              "emotion": "NOTICE",
              "present": true
            }
          }
        },
        {
          "step": 8,
          "sourceLine": 165,
          "coldFrames": 2,
          "autoFrames": 500,
          "events": [
            {
              "type": "active",
              "side": "left",
              "value": false
            },
            {
              "type": "active",
              "side": "right",
              "value": true
            },
            {
              "type": "emotion",
              "side": "right",
              "value": "ANGRY"
            },
            {
              "type": "text",
              "speaker": "right",
              "text": "原来是个来找麻烦的家伙..."
            }
          ],
          "text": "原来是个来找麻烦的家伙...",
          "speaker": "right",
          "emotion": "ANGRY",
          "balloon": {
            "sourceType": 4,
            "position": [
              150,
              -30
            ],
            "length": 5,
            "inverted": true
          },
          "portraits": {
            "left": {
              "character": "marisa",
              "active": false,
              "emotion": "ANGRY",
              "present": true
            },
            "right": {
              "character": "artia",
              "active": true,
              "emotion": "ANGRY",
              "present": true
            }
          }
        },
        {
          "step": 9,
          "sourceLine": 171,
          "coldFrames": 2,
          "autoFrames": 500,
          "events": [
            {
              "type": "emotion",
              "side": "right",
              "value": "ANGRY2"
            },
            {
              "type": "text",
              "speaker": "right",
              "text": "只可惜，只有胜利者才有资格掌控主场！"
            }
          ],
          "text": "只可惜，只有胜利者才有资格掌控主场！",
          "speaker": "right",
          "emotion": "ANGRY2",
          "balloon": {
            "sourceType": 4,
            "position": [
              150,
              -30
            ],
            "length": 6,
            "inverted": true
          },
          "portraits": {
            "left": {
              "character": "marisa",
              "active": false,
              "emotion": "ANGRY",
              "present": true
            },
            "right": {
              "character": "artia",
              "active": true,
              "emotion": "ANGRY2",
              "present": true
            }
          }
        },
        {
          "step": 10,
          "sourceLine": 175,
          "coldFrames": 2,
          "autoFrames": 500,
          "events": [
            {
              "type": "active",
              "side": "left",
              "value": true
            },
            {
              "type": "active",
              "side": "right",
              "value": false
            },
            {
              "type": "emotion",
              "side": "left",
              "value": "SWEAT"
            },
            {
              "type": "emotion",
              "side": "right",
              "value": "ANGRY"
            },
            {
              "type": "text",
              "speaker": "left",
              "text": "..."
            }
          ],
          "text": "...",
          "speaker": "left",
          "emotion": "SWEAT",
          "balloon": {
            "sourceType": 1,
            "position": [
              -150,
              -30
            ],
            "length": 3,
            "inverted": false
          },
          "portraits": {
            "left": {
              "character": "marisa",
              "active": true,
              "emotion": "SWEAT",
              "present": true
            },
            "right": {
              "character": "artia",
              "active": false,
              "emotion": "ANGRY",
              "present": true
            }
          }
        },
        {
          "step": 11,
          "sourceLine": 182,
          "coldFrames": 2,
          "autoFrames": 500,
          "events": [
            {
              "type": "active",
              "side": "left",
              "value": false
            },
            {
              "type": "active",
              "side": "right",
              "value": true
            },
            {
              "type": "emotion",
              "side": "right",
              "value": "NOTICE"
            },
            {
              "type": "text",
              "speaker": "right",
              "text": "观众们早就期待一场魔法间的对决了，拿出你的全部实力吧！"
            }
          ],
          "text": "观众们早就期待一场魔法间的对决了，拿出你的全部实力吧！",
          "speaker": "right",
          "emotion": "NOTICE",
          "balloon": {
            "sourceType": 4,
            "position": [
              150,
              -30
            ],
            "length": 6,
            "inverted": true
          },
          "portraits": {
            "left": {
              "character": "marisa",
              "active": false,
              "emotion": "SWEAT",
              "present": true
            },
            "right": {
              "character": "artia",
              "active": true,
              "emotion": "NOTICE",
              "present": true
            }
          }
        },
        {
          "step": 12,
          "sourceLine": 188,
          "coldFrames": 2,
          "autoFrames": 500,
          "events": [
            {
              "type": "bossMagicSquare"
            },
            {
              "type": "startAttack",
              "attack": "Artia_SC_1"
            },
            {
              "type": "complete"
            }
          ],
          "terminal": true,
          "portraits": {
            "left": {
              "character": "marisa",
              "active": false,
              "emotion": "SWEAT",
              "present": true
            },
            "right": {
              "character": "artia",
              "active": true,
              "emotion": "NOTICE",
              "present": true
            }
          }
        }
      ]
    },
    "monstone:0:before": {
      "id": "monstone:0:before",
      "sourceClass": "Dialog_Reimu_Monstone",
      "bossId": "monstone",
      "character": 0,
      "phase": "before",
      "startDelayFrames": 0,
      "steps": [
        {
          "step": 0,
          "sourceLine": 205,
          "coldFrames": 30,
          "autoFrames": 300,
          "events": [
            {
              "type": "portrait",
              "side": "left",
              "character": "reimu"
            },
            {
              "type": "active",
              "side": "left",
              "value": true
            },
            {
              "type": "emotion",
              "side": "left",
              "value": "PUZZLED"
            },
            {
              "type": "text",
              "speaker": "left",
              "text": "河面上暂时也没发现什么异样..."
            }
          ],
          "text": "河面上暂时也没发现什么异样...",
          "speaker": "left",
          "emotion": "PUZZLED",
          "balloon": {
            "sourceType": 1,
            "position": [
              -150,
              -30
            ],
            "length": 5,
            "inverted": false
          },
          "portraits": {
            "left": {
              "character": "reimu",
              "active": true,
              "emotion": "PUZZLED",
              "present": true
            },
            "right": {
              "character": "monstone",
              "active": false,
              "emotion": "NOTICE"
            }
          }
        },
        {
          "step": 1,
          "sourceLine": 211,
          "coldFrames": 2,
          "autoFrames": 500,
          "events": [
            {
              "type": "text",
              "speaker": "left",
              "text": "难道之前都是我的错觉吗？"
            }
          ],
          "text": "难道之前都是我的错觉吗？",
          "speaker": "left",
          "emotion": "PUZZLED",
          "balloon": {
            "sourceType": 1,
            "position": [
              -150,
              -30
            ],
            "length": 5,
            "inverted": false
          },
          "portraits": {
            "left": {
              "character": "reimu",
              "active": true,
              "emotion": "PUZZLED",
              "present": true
            },
            "right": {
              "character": "monstone",
              "active": false,
              "emotion": "NOTICE"
            }
          }
        },
        {
          "step": 2,
          "sourceLine": 214,
          "coldFrames": 120,
          "autoFrames": 500,
          "events": [
            {
              "type": "spawnBoss",
              "bossId": "monstone"
            },
            {
              "type": "bossLife",
              "value": 4
            },
            {
              "type": "bossPosition",
              "position": [
                0,
                100,
                0
              ]
            },
            {
              "type": "revealBoss"
            },
            {
              "type": "emotion",
              "side": "left",
              "value": "SURPRISE"
            },
            {
              "type": "text",
              "speaker": "left",
              "text": "什么人？"
            }
          ],
          "text": "什么人？",
          "speaker": "left",
          "emotion": "SURPRISE",
          "balloon": {
            "sourceType": 1,
            "position": [
              -150,
              -30
            ],
            "length": 4,
            "inverted": false
          },
          "portraits": {
            "left": {
              "character": "reimu",
              "active": true,
              "emotion": "SURPRISE",
              "present": true
            },
            "right": {
              "character": "monstone",
              "active": false,
              "emotion": "NOTICE"
            }
          }
        },
        {
          "step": 3,
          "sourceLine": 226,
          "coldFrames": 2,
          "autoFrames": 500,
          "events": [
            {
              "type": "bossName",
              "index": 1
            },
            {
              "type": "portrait",
              "side": "right",
              "character": "monstone"
            },
            {
              "type": "active",
              "side": "left",
              "value": false
            },
            {
              "type": "active",
              "side": "right",
              "value": true
            },
            {
              "type": "emotion",
              "side": "left",
              "value": "SURPRISE"
            },
            {
              "type": "emotion",
              "side": "right",
              "value": "LOSE"
            },
            {
              "type": "text",
              "speaker": "right",
              "text": "#%#@&$*!%"
            }
          ],
          "text": "#%#@&$*!%",
          "speaker": "right",
          "emotion": "LOSE",
          "balloon": {
            "sourceType": 4,
            "position": [
              150,
              -30
            ],
            "length": 4,
            "inverted": true
          },
          "portraits": {
            "left": {
              "character": "reimu",
              "active": false,
              "emotion": "SURPRISE",
              "present": true
            },
            "right": {
              "character": "monstone",
              "active": true,
              "emotion": "LOSE",
              "present": true
            }
          }
        },
        {
          "step": 4,
          "sourceLine": 237,
          "coldFrames": 2,
          "autoFrames": 500,
          "events": [
            {
              "type": "active",
              "side": "left",
              "value": true
            },
            {
              "type": "active",
              "side": "right",
              "value": false
            },
            {
              "type": "emotion",
              "side": "left",
              "value": "SWEAT"
            },
            {
              "type": "text",
              "speaker": "left",
              "text": "这年头，石头都成精了吗"
            }
          ],
          "text": "这年头，石头都成精了吗",
          "speaker": "left",
          "emotion": "SWEAT",
          "balloon": {
            "sourceType": 1,
            "position": [
              -150,
              -30
            ],
            "length": 5,
            "inverted": false
          },
          "portraits": {
            "left": {
              "character": "reimu",
              "active": true,
              "emotion": "SWEAT",
              "present": true
            },
            "right": {
              "character": "monstone",
              "active": false,
              "emotion": "LOSE",
              "present": true
            }
          }
        },
        {
          "step": 5,
          "sourceLine": 243,
          "coldFrames": 2,
          "autoFrames": 500,
          "events": [
            {
              "type": "active",
              "side": "left",
              "value": false
            },
            {
              "type": "active",
              "side": "right",
              "value": true
            },
            {
              "type": "emotion",
              "side": "left",
              "value": "SURPRISE"
            },
            {
              "type": "text",
              "speaker": "right",
              "text": "小家伙，注意你说话的口气！"
            }
          ],
          "text": "小家伙，注意你说话的口气！",
          "speaker": "right",
          "emotion": "LOSE",
          "balloon": {
            "sourceType": 4,
            "position": [
              150,
              -30
            ],
            "length": 5,
            "inverted": true
          },
          "portraits": {
            "left": {
              "character": "reimu",
              "active": false,
              "emotion": "SURPRISE",
              "present": true
            },
            "right": {
              "character": "monstone",
              "active": true,
              "emotion": "LOSE",
              "present": true
            }
          }
        },
        {
          "step": 6,
          "sourceLine": 249,
          "coldFrames": 2,
          "autoFrames": 500,
          "events": [
            {
              "type": "text",
              "speaker": "right",
              "text": "这条河可不是人人都能过去的！"
            }
          ],
          "text": "这条河可不是人人都能过去的！",
          "speaker": "right",
          "emotion": "LOSE",
          "balloon": {
            "sourceType": 4,
            "position": [
              150,
              -30
            ],
            "length": 6,
            "inverted": true
          },
          "portraits": {
            "left": {
              "character": "reimu",
              "active": false,
              "emotion": "SURPRISE",
              "present": true
            },
            "right": {
              "character": "monstone",
              "active": true,
              "emotion": "LOSE",
              "present": true
            }
          }
        },
        {
          "step": 7,
          "sourceLine": 252,
          "coldFrames": 2,
          "autoFrames": 500,
          "events": [
            {
              "type": "active",
              "side": "left",
              "value": true
            },
            {
              "type": "active",
              "side": "right",
              "value": false
            },
            {
              "type": "emotion",
              "side": "left",
              "value": "NOTICE"
            },
            {
              "type": "text",
              "speaker": "left",
              "text": "原来还是一块会说话的石头啊"
            }
          ],
          "text": "原来还是一块会说话的石头啊",
          "speaker": "left",
          "emotion": "NOTICE",
          "balloon": {
            "sourceType": 1,
            "position": [
              -150,
              -30
            ],
            "length": 6,
            "inverted": false
          },
          "portraits": {
            "left": {
              "character": "reimu",
              "active": true,
              "emotion": "NOTICE",
              "present": true
            },
            "right": {
              "character": "monstone",
              "active": false,
              "emotion": "LOSE",
              "present": true
            }
          }
        },
        {
          "step": 8,
          "sourceLine": 258,
          "coldFrames": 2,
          "autoFrames": 500,
          "events": [
            {
              "type": "active",
              "side": "left",
              "value": false
            },
            {
              "type": "active",
              "side": "right",
              "value": true
            },
            {
              "type": "emotion",
              "side": "left",
              "value": "DISAPPOINT"
            },
            {
              "type": "text",
              "speaker": "right",
              "text": "我可不是普通的石头！"
            }
          ],
          "text": "我可不是普通的石头！",
          "speaker": "right",
          "emotion": "LOSE",
          "balloon": {
            "sourceType": 4,
            "position": [
              150,
              -30
            ],
            "length": 4,
            "inverted": true
          },
          "portraits": {
            "left": {
              "character": "reimu",
              "active": false,
              "emotion": "DISAPPOINT",
              "present": true
            },
            "right": {
              "character": "monstone",
              "active": true,
              "emotion": "LOSE",
              "present": true
            }
          }
        },
        {
          "step": 9,
          "sourceLine": 264,
          "coldFrames": 2,
          "autoFrames": 500,
          "events": [
            {
              "type": "text",
              "speaker": "right",
              "text": "想过这条河，先把身上值钱的东西都交出来吧！"
            }
          ],
          "text": "想过这条河，先把身上值钱的东西都交出来吧！",
          "speaker": "right",
          "emotion": "LOSE",
          "balloon": {
            "sourceType": 4,
            "position": [
              150,
              -30
            ],
            "length": 6,
            "inverted": true
          },
          "portraits": {
            "left": {
              "character": "reimu",
              "active": false,
              "emotion": "DISAPPOINT",
              "present": true
            },
            "right": {
              "character": "monstone",
              "active": true,
              "emotion": "LOSE",
              "present": true
            }
          }
        },
        {
          "step": 10,
          "sourceLine": 267,
          "coldFrames": 2,
          "autoFrames": 500,
          "events": [
            {
              "type": "active",
              "side": "left",
              "value": true
            },
            {
              "type": "active",
              "side": "right",
              "value": false
            },
            {
              "type": "emotion",
              "side": "left",
              "value": "NOTICE"
            },
            {
              "type": "text",
              "speaker": "left",
              "text": "值钱的东西都留在神社，没有带出来呢"
            }
          ],
          "text": "值钱的东西都留在神社，没有带出来呢",
          "speaker": "left",
          "emotion": "NOTICE",
          "balloon": {
            "sourceType": 1,
            "position": [
              -150,
              -30
            ],
            "length": 6,
            "inverted": false
          },
          "portraits": {
            "left": {
              "character": "reimu",
              "active": true,
              "emotion": "NOTICE",
              "present": true
            },
            "right": {
              "character": "monstone",
              "active": false,
              "emotion": "LOSE",
              "present": true
            }
          }
        },
        {
          "step": 11,
          "sourceLine": 273,
          "coldFrames": 2,
          "autoFrames": 500,
          "events": [
            {
              "type": "emotion",
              "side": "left",
              "value": "ANGRY"
            },
            {
              "type": "text",
              "speaker": "left",
              "text": "正好让我先制止你的胡作非为吧！"
            }
          ],
          "text": "正好让我先制止你的胡作非为吧！",
          "speaker": "left",
          "emotion": "ANGRY",
          "balloon": {
            "sourceType": 1,
            "position": [
              -150,
              -30
            ],
            "length": 6,
            "inverted": false
          },
          "portraits": {
            "left": {
              "character": "reimu",
              "active": true,
              "emotion": "ANGRY",
              "present": true
            },
            "right": {
              "character": "monstone",
              "active": false,
              "emotion": "LOSE",
              "present": true
            }
          }
        },
        {
          "step": 12,
          "sourceLine": 277,
          "coldFrames": 2,
          "autoFrames": 500,
          "events": [
            {
              "type": "bossMagicSquare"
            },
            {
              "type": "startAttack",
              "attack": "Monstone_SC_1"
            },
            {
              "type": "complete"
            },
            {
              "type": "music",
              "action": "stop"
            },
            {
              "type": "music",
              "action": "play",
              "track": "riverside"
            },
            {
              "type": "music",
              "action": "caption",
              "text": "恩惠Summer Rain"
            }
          ],
          "terminal": true,
          "portraits": {
            "left": {
              "character": "reimu",
              "active": true,
              "emotion": "ANGRY",
              "present": true
            },
            "right": {
              "character": "monstone",
              "active": false,
              "emotion": "LOSE",
              "present": true
            }
          }
        }
      ]
    },
    "monstone:0:after": {
      "id": "monstone:0:after",
      "sourceClass": "Dialog_Reimu_Monstone_2",
      "bossId": "monstone",
      "character": 0,
      "phase": "after",
      "startDelayFrames": 50,
      "steps": [
        {
          "step": 0,
          "sourceLine": 297,
          "coldFrames": 120,
          "autoFrames": 300,
          "events": [
            {
              "type": "portrait",
              "side": "left",
              "character": "reimu"
            },
            {
              "type": "active",
              "side": "left",
              "value": true
            },
            {
              "type": "emotion",
              "side": "left",
              "value": "PUZZLED"
            },
            {
              "type": "text",
              "speaker": "left",
              "text": "在情况变得更糟之前，还是尽快解决主要的问题吧"
            }
          ],
          "text": "在情况变得更糟之前，还是尽快解决主要的问题吧",
          "speaker": "left",
          "emotion": "PUZZLED",
          "balloon": {
            "sourceType": 1,
            "position": [
              -150,
              -30
            ],
            "length": 6,
            "inverted": false
          },
          "portraits": {
            "left": {
              "character": "reimu",
              "active": true,
              "emotion": "PUZZLED",
              "present": true
            },
            "right": {
              "character": "monstone",
              "active": false,
              "emotion": "NOTICE"
            }
          }
        },
        {
          "step": 1,
          "sourceLine": 304,
          "coldFrames": 2,
          "autoFrames": 500,
          "events": [
            {
              "type": "complete"
            },
            {
              "type": "clearLevel"
            }
          ],
          "terminal": true,
          "portraits": {
            "left": {
              "character": "reimu",
              "active": true,
              "emotion": "PUZZLED",
              "present": true
            },
            "right": {
              "character": "monstone",
              "active": false,
              "emotion": "NOTICE"
            }
          }
        }
      ]
    },
    "monstone:1:before": {
      "id": "monstone:1:before",
      "sourceClass": "Dialog_Marisa_Monstone",
      "bossId": "monstone",
      "character": 1,
      "phase": "before",
      "startDelayFrames": 0,
      "steps": [
        {
          "step": 0,
          "sourceLine": 318,
          "coldFrames": 30,
          "autoFrames": 300,
          "events": [
            {
              "type": "portrait",
              "side": "left",
              "character": "marisa"
            },
            {
              "type": "active",
              "side": "left",
              "value": true
            },
            {
              "type": "emotion",
              "side": "left",
              "value": "PUZZLED"
            },
            {
              "type": "text",
              "speaker": "left",
              "text": "总感觉下一秒就会有大事发生"
            }
          ],
          "text": "总感觉下一秒就会有大事发生",
          "speaker": "left",
          "emotion": "PUZZLED",
          "balloon": {
            "sourceType": 1,
            "position": [
              -150,
              -30
            ],
            "length": 5,
            "inverted": false
          },
          "portraits": {
            "left": {
              "character": "marisa",
              "active": true,
              "emotion": "PUZZLED",
              "present": true
            },
            "right": {
              "character": "monstone",
              "active": false,
              "emotion": "NOTICE"
            }
          }
        },
        {
          "step": 1,
          "sourceLine": 324,
          "coldFrames": 120,
          "autoFrames": 500,
          "events": [
            {
              "type": "spawnBoss",
              "bossId": "monstone"
            },
            {
              "type": "bossLife",
              "value": 4
            },
            {
              "type": "bossPosition",
              "position": [
                0,
                100,
                0
              ]
            },
            {
              "type": "revealBoss"
            },
            {
              "type": "active",
              "side": "left",
              "value": false
            },
            {
              "type": "emotion",
              "side": "left",
              "value": "SURPRISE"
            },
            {
              "type": "text",
              "speaker": "right",
              "text": "预感挺准嘛，小家伙"
            }
          ],
          "text": "预感挺准嘛，小家伙",
          "speaker": "right",
          "emotion": "NOTICE",
          "balloon": {
            "sourceType": 4,
            "position": [
              0,
              60
            ],
            "length": 4,
            "inverted": false
          },
          "portraits": {
            "left": {
              "character": "marisa",
              "active": false,
              "emotion": "SURPRISE",
              "present": true
            },
            "right": {
              "character": "monstone",
              "active": false,
              "emotion": "NOTICE"
            }
          }
        },
        {
          "step": 2,
          "sourceLine": 337,
          "coldFrames": 2,
          "autoFrames": 500,
          "events": [
            {
              "type": "bossName",
              "index": 1
            },
            {
              "type": "portrait",
              "side": "right",
              "character": "monstone"
            },
            {
              "type": "active",
              "side": "left",
              "value": false
            },
            {
              "type": "active",
              "side": "right",
              "value": true
            },
            {
              "type": "emotion",
              "side": "left",
              "value": "SURPRISE"
            },
            {
              "type": "emotion",
              "side": "right",
              "value": "LOSE"
            },
            {
              "type": "text",
              "speaker": "right",
              "text": "识相的话就赶紧把值钱的东西都交出来！"
            }
          ],
          "text": "识相的话就赶紧把值钱的东西都交出来！",
          "speaker": "right",
          "emotion": "LOSE",
          "balloon": {
            "sourceType": 4,
            "position": [
              150,
              -30
            ],
            "length": 6,
            "inverted": true
          },
          "portraits": {
            "left": {
              "character": "marisa",
              "active": false,
              "emotion": "SURPRISE",
              "present": true
            },
            "right": {
              "character": "monstone",
              "active": true,
              "emotion": "LOSE",
              "present": true
            }
          }
        },
        {
          "step": 3,
          "sourceLine": 348,
          "coldFrames": 2,
          "autoFrames": 500,
          "events": [
            {
              "type": "active",
              "side": "left",
              "value": true
            },
            {
              "type": "active",
              "side": "right",
              "value": false
            },
            {
              "type": "emotion",
              "side": "left",
              "value": "DISAPPOINT"
            },
            {
              "type": "text",
              "speaker": "left",
              "text": "我说可不是这个..."
            }
          ],
          "text": "我说可不是这个...",
          "speaker": "left",
          "emotion": "DISAPPOINT",
          "balloon": {
            "sourceType": 1,
            "position": [
              -150,
              -30
            ],
            "length": 4,
            "inverted": false
          },
          "portraits": {
            "left": {
              "character": "marisa",
              "active": true,
              "emotion": "DISAPPOINT",
              "present": true
            },
            "right": {
              "character": "monstone",
              "active": false,
              "emotion": "LOSE",
              "present": true
            }
          }
        },
        {
          "step": 4,
          "sourceLine": 354,
          "coldFrames": 2,
          "autoFrames": 500,
          "events": [
            {
              "type": "emotion",
              "side": "left",
              "value": "SWEAT"
            },
            {
              "type": "text",
              "speaker": "left",
              "text": "不过被一块石头打劫确实是在意料之外的"
            }
          ],
          "text": "不过被一块石头打劫确实是在意料之外的",
          "speaker": "left",
          "emotion": "SWEAT",
          "balloon": {
            "sourceType": 1,
            "position": [
              -150,
              -30
            ],
            "length": 6,
            "inverted": false
          },
          "portraits": {
            "left": {
              "character": "marisa",
              "active": true,
              "emotion": "SWEAT",
              "present": true
            },
            "right": {
              "character": "monstone",
              "active": false,
              "emotion": "LOSE",
              "present": true
            }
          }
        },
        {
          "step": 5,
          "sourceLine": 358,
          "coldFrames": 2,
          "autoFrames": 500,
          "events": [
            {
              "type": "active",
              "side": "left",
              "value": false
            },
            {
              "type": "active",
              "side": "right",
              "value": true
            },
            {
              "type": "emotion",
              "side": "left",
              "value": "NOTICE"
            },
            {
              "type": "text",
              "speaker": "right",
              "text": "想过这条河，要么交出过路费..."
            }
          ],
          "text": "想过这条河，要么交出过路费...",
          "speaker": "right",
          "emotion": "LOSE",
          "balloon": {
            "sourceType": 4,
            "position": [
              150,
              -30
            ],
            "length": 5,
            "inverted": true
          },
          "portraits": {
            "left": {
              "character": "marisa",
              "active": false,
              "emotion": "NOTICE",
              "present": true
            },
            "right": {
              "character": "monstone",
              "active": true,
              "emotion": "LOSE",
              "present": true
            }
          }
        },
        {
          "step": 6,
          "sourceLine": 364,
          "coldFrames": 2,
          "autoFrames": 500,
          "events": [
            {
              "type": "text",
              "speaker": "right",
              "text": "要么就被我丢下河里喂鱼吧！"
            }
          ],
          "text": "要么就被我丢下河里喂鱼吧！",
          "speaker": "right",
          "emotion": "LOSE",
          "balloon": {
            "sourceType": 4,
            "position": [
              150,
              -30
            ],
            "length": 5,
            "inverted": true
          },
          "portraits": {
            "left": {
              "character": "marisa",
              "active": false,
              "emotion": "NOTICE",
              "present": true
            },
            "right": {
              "character": "monstone",
              "active": true,
              "emotion": "LOSE",
              "present": true
            }
          }
        },
        {
          "step": 7,
          "sourceLine": 367,
          "coldFrames": 2,
          "autoFrames": 500,
          "events": [
            {
              "type": "active",
              "side": "left",
              "value": true
            },
            {
              "type": "active",
              "side": "right",
              "value": false
            },
            {
              "type": "emotion",
              "side": "left",
              "value": "SWEAT"
            },
            {
              "type": "text",
              "speaker": "left",
              "text": "你只是一块石头，要再多的钱财又有什么用呢"
            }
          ],
          "text": "你只是一块石头，要再多的钱财又有什么用呢",
          "speaker": "left",
          "emotion": "SWEAT",
          "balloon": {
            "sourceType": 1,
            "position": [
              -150,
              -30
            ],
            "length": 6,
            "inverted": false
          },
          "portraits": {
            "left": {
              "character": "marisa",
              "active": true,
              "emotion": "SWEAT",
              "present": true
            },
            "right": {
              "character": "monstone",
              "active": false,
              "emotion": "LOSE",
              "present": true
            }
          }
        },
        {
          "step": 8,
          "sourceLine": 373,
          "coldFrames": 2,
          "autoFrames": 500,
          "events": [
            {
              "type": "emotion",
              "side": "left",
              "value": "ANGRY"
            },
            {
              "type": "text",
              "speaker": "left",
              "text": "还是先让我把你送回你该去的地方吧"
            }
          ],
          "text": "还是先让我把你送回你该去的地方吧",
          "speaker": "left",
          "emotion": "ANGRY",
          "balloon": {
            "sourceType": 1,
            "position": [
              -150,
              -30
            ],
            "length": 5,
            "inverted": false
          },
          "portraits": {
            "left": {
              "character": "marisa",
              "active": true,
              "emotion": "ANGRY",
              "present": true
            },
            "right": {
              "character": "monstone",
              "active": false,
              "emotion": "LOSE",
              "present": true
            }
          }
        },
        {
          "step": 9,
          "sourceLine": 377,
          "coldFrames": 2,
          "autoFrames": 500,
          "events": [
            {
              "type": "bossMagicSquare"
            },
            {
              "type": "startAttack",
              "attack": "Monstone_SC_1"
            },
            {
              "type": "complete"
            },
            {
              "type": "music",
              "action": "stop"
            },
            {
              "type": "music",
              "action": "play",
              "track": "riverside"
            },
            {
              "type": "music",
              "action": "caption",
              "text": "恩惠Summer Rain"
            }
          ],
          "terminal": true,
          "portraits": {
            "left": {
              "character": "marisa",
              "active": true,
              "emotion": "ANGRY",
              "present": true
            },
            "right": {
              "character": "monstone",
              "active": false,
              "emotion": "LOSE",
              "present": true
            }
          }
        }
      ]
    },
    "monstone:1:after": {
      "id": "monstone:1:after",
      "sourceClass": "Dialog_Marisa_Monstone_2",
      "bossId": "monstone",
      "character": 1,
      "phase": "after",
      "startDelayFrames": 50,
      "steps": [
        {
          "step": 0,
          "sourceLine": 397,
          "coldFrames": 30,
          "autoFrames": 300,
          "events": [
            {
              "type": "portrait",
              "side": "left",
              "character": "marisa"
            },
            {
              "type": "active",
              "side": "left",
              "value": true
            },
            {
              "type": "emotion",
              "side": "left",
              "value": "DISAPPOINT"
            },
            {
              "type": "text",
              "speaker": "left",
              "text": "居然和一块石头浪费了这么久的时间"
            }
          ],
          "text": "居然和一块石头浪费了这么久的时间",
          "speaker": "left",
          "emotion": "DISAPPOINT",
          "balloon": {
            "sourceType": 1,
            "position": [
              -150,
              -30
            ],
            "length": 6,
            "inverted": false
          },
          "portraits": {
            "left": {
              "character": "marisa",
              "active": true,
              "emotion": "DISAPPOINT",
              "present": true
            },
            "right": {
              "character": "monstone",
              "active": false,
              "emotion": "NOTICE"
            }
          }
        },
        {
          "step": 1,
          "sourceLine": 403,
          "coldFrames": 120,
          "autoFrames": 500,
          "events": [
            {
              "type": "emotion",
              "side": "left",
              "value": "PUZZLED"
            },
            {
              "type": "text",
              "speaker": "left",
              "text": "还是抓紧时间赶路吧"
            }
          ],
          "text": "还是抓紧时间赶路吧",
          "speaker": "left",
          "emotion": "PUZZLED",
          "balloon": {
            "sourceType": 1,
            "position": [
              -150,
              -30
            ],
            "length": 5,
            "inverted": false
          },
          "portraits": {
            "left": {
              "character": "marisa",
              "active": true,
              "emotion": "PUZZLED",
              "present": true
            },
            "right": {
              "character": "monstone",
              "active": false,
              "emotion": "NOTICE"
            }
          }
        },
        {
          "step": 2,
          "sourceLine": 408,
          "coldFrames": 2,
          "autoFrames": 500,
          "events": [
            {
              "type": "complete"
            },
            {
              "type": "clearLevel"
            }
          ],
          "terminal": true,
          "portraits": {
            "left": {
              "character": "marisa",
              "active": true,
              "emotion": "PUZZLED",
              "present": true
            },
            "right": {
              "character": "monstone",
              "active": false,
              "emotion": "NOTICE"
            }
          }
        }
      ]
    },
    "sunny:0:before": {
      "id": "sunny:0:before",
      "sourceClass": "Dialog_Reimu_SunnyMilk",
      "bossId": "sunny",
      "character": 0,
      "phase": "before",
      "startDelayFrames": 0,
      "steps": [
        {
          "step": 0,
          "sourceLine": 422,
          "coldFrames": 30,
          "autoFrames": 300,
          "events": [
            {
              "type": "portrait",
              "side": "left",
              "character": "reimu"
            },
            {
              "type": "active",
              "side": "left",
              "value": true
            },
            {
              "type": "emotion",
              "side": "left",
              "value": "HAPPY"
            },
            {
              "type": "text",
              "speaker": "left",
              "text": "只有这种远离人烟的地方才不会发生那些怪事吧"
            }
          ],
          "text": "只有这种远离人烟的地方才不会发生那些怪事吧",
          "speaker": "left",
          "emotion": "HAPPY",
          "balloon": {
            "sourceType": 1,
            "position": [
              -150,
              -30
            ],
            "length": 6,
            "inverted": false
          },
          "portraits": {
            "left": {
              "character": "reimu",
              "active": true,
              "emotion": "HAPPY",
              "present": true
            },
            "right": {
              "character": "sunny",
              "active": false,
              "emotion": "NOTICE"
            }
          }
        },
        {
          "step": 1,
          "sourceLine": 428,
          "coldFrames": 2,
          "autoFrames": 500,
          "events": [
            {
              "type": "emotion",
              "side": "left",
              "value": "NOTICE"
            },
            {
              "type": "text",
              "speaker": "left",
              "text": "这么说，来这里也找不到什么线索"
            }
          ],
          "text": "这么说，来这里也找不到什么线索",
          "speaker": "left",
          "emotion": "NOTICE",
          "balloon": {
            "sourceType": 1,
            "position": [
              -150,
              -30
            ],
            "length": 5,
            "inverted": false
          },
          "portraits": {
            "left": {
              "character": "reimu",
              "active": true,
              "emotion": "NOTICE",
              "present": true
            },
            "right": {
              "character": "sunny",
              "active": false,
              "emotion": "NOTICE"
            }
          }
        },
        {
          "step": 2,
          "sourceLine": 432,
          "coldFrames": 2,
          "autoFrames": 500,
          "events": [
            {
              "type": "emotion",
              "side": "left",
              "value": "DISAPPOINT"
            },
            {
              "type": "text",
              "speaker": "left",
              "text": "还是赶紧找到出去的路吧"
            }
          ],
          "text": "还是赶紧找到出去的路吧",
          "speaker": "left",
          "emotion": "DISAPPOINT",
          "balloon": {
            "sourceType": 1,
            "position": [
              -150,
              -30
            ],
            "length": 5,
            "inverted": false
          },
          "portraits": {
            "left": {
              "character": "reimu",
              "active": true,
              "emotion": "DISAPPOINT",
              "present": true
            },
            "right": {
              "character": "sunny",
              "active": false,
              "emotion": "NOTICE"
            }
          }
        },
        {
          "step": 3,
          "sourceLine": 436,
          "coldFrames": 120,
          "autoFrames": 500,
          "events": [
            {
              "type": "spawnBoss",
              "bossId": "sunny"
            },
            {
              "type": "bossLife",
              "value": 3
            },
            {
              "type": "bossPosition",
              "position": [
                0,
                100,
                0
              ]
            },
            {
              "type": "revealBoss"
            },
            {
              "type": "active",
              "side": "left",
              "value": false
            },
            {
              "type": "emotion",
              "side": "left",
              "value": "SURPRISE"
            },
            {
              "type": "text",
              "speaker": "right",
              "text": "干嘛这么着急离开啊"
            }
          ],
          "text": "干嘛这么着急离开啊",
          "speaker": "right",
          "emotion": "NOTICE",
          "balloon": {
            "sourceType": 4,
            "position": [
              0,
              60
            ],
            "length": 4,
            "inverted": false
          },
          "portraits": {
            "left": {
              "character": "reimu",
              "active": false,
              "emotion": "SURPRISE",
              "present": true
            },
            "right": {
              "character": "sunny",
              "active": false,
              "emotion": "NOTICE"
            }
          }
        },
        {
          "step": 4,
          "sourceLine": 449,
          "coldFrames": 2,
          "autoFrames": 500,
          "events": [
            {
              "type": "bossName",
              "index": 0
            },
            {
              "type": "portrait",
              "side": "right",
              "character": "sunnymilk"
            },
            {
              "type": "active",
              "side": "left",
              "value": false
            },
            {
              "type": "active",
              "side": "right",
              "value": true
            },
            {
              "type": "emotion",
              "side": "left",
              "value": "SURPRISE"
            },
            {
              "type": "emotion",
              "side": "right",
              "value": "HAPPY"
            },
            {
              "type": "text",
              "speaker": "right",
              "text": "好久没遇到人类了，我可准备了好多的恶作剧..."
            }
          ],
          "text": "好久没遇到人类了，我可准备了好多的恶作剧...",
          "speaker": "right",
          "emotion": "HAPPY",
          "balloon": {
            "sourceType": 4,
            "position": [
              150,
              -30
            ],
            "length": 6,
            "inverted": true
          },
          "portraits": {
            "left": {
              "character": "reimu",
              "active": false,
              "emotion": "SURPRISE",
              "present": true
            },
            "right": {
              "character": "sunny",
              "active": true,
              "emotion": "HAPPY",
              "present": true
            }
          }
        },
        {
          "step": 5,
          "sourceLine": 460,
          "coldFrames": 2,
          "autoFrames": 500,
          "events": [
            {
              "type": "emotion",
              "side": "right",
              "value": "SWEAT"
            },
            {
              "type": "text",
              "speaker": "right",
              "text": "...不对，是礼物"
            }
          ],
          "text": "...不对，是礼物",
          "speaker": "right",
          "emotion": "SWEAT",
          "balloon": {
            "sourceType": 4,
            "position": [
              150,
              -30
            ],
            "length": 4,
            "inverted": true
          },
          "portraits": {
            "left": {
              "character": "reimu",
              "active": false,
              "emotion": "SURPRISE",
              "present": true
            },
            "right": {
              "character": "sunny",
              "active": true,
              "emotion": "SWEAT",
              "present": true
            }
          }
        },
        {
          "step": 6,
          "sourceLine": 464,
          "coldFrames": 2,
          "autoFrames": 500,
          "events": [
            {
              "type": "active",
              "side": "left",
              "value": true
            },
            {
              "type": "active",
              "side": "right",
              "value": false
            },
            {
              "type": "emotion",
              "side": "left",
              "value": "NOTICE"
            },
            {
              "type": "emotion",
              "side": "right",
              "value": "NOTICE"
            },
            {
              "type": "text",
              "speaker": "left",
              "text": "虽然你只是一只妖精，但我还是想问一下"
            }
          ],
          "text": "虽然你只是一只妖精，但我还是想问一下",
          "speaker": "left",
          "emotion": "NOTICE",
          "balloon": {
            "sourceType": 1,
            "position": [
              -150,
              -30
            ],
            "length": 6,
            "inverted": false
          },
          "portraits": {
            "left": {
              "character": "reimu",
              "active": true,
              "emotion": "NOTICE",
              "present": true
            },
            "right": {
              "character": "sunny",
              "active": false,
              "emotion": "NOTICE",
              "present": true
            }
          }
        },
        {
          "step": 7,
          "sourceLine": 471,
          "coldFrames": 2,
          "autoFrames": 500,
          "events": [
            {
              "type": "emotion",
              "side": "left",
              "value": "SWEAT"
            },
            {
              "type": "text",
              "speaker": "left",
              "text": "你知道出去的路吗"
            }
          ],
          "text": "你知道出去的路吗",
          "speaker": "left",
          "emotion": "SWEAT",
          "balloon": {
            "sourceType": 1,
            "position": [
              -150,
              -30
            ],
            "length": 5,
            "inverted": false
          },
          "portraits": {
            "left": {
              "character": "reimu",
              "active": true,
              "emotion": "SWEAT",
              "present": true
            },
            "right": {
              "character": "sunny",
              "active": false,
              "emotion": "NOTICE",
              "present": true
            }
          }
        },
        {
          "step": 8,
          "sourceLine": 475,
          "coldFrames": 2,
          "autoFrames": 500,
          "events": [
            {
              "type": "active",
              "side": "left",
              "value": false
            },
            {
              "type": "active",
              "side": "right",
              "value": true
            },
            {
              "type": "emotion",
              "side": "left",
              "value": "DISAPPOINT"
            },
            {
              "type": "emotion",
              "side": "right",
              "value": "DISAPPOINT"
            },
            {
              "type": "text",
              "speaker": "right",
              "text": "人类可真是没有幽默感啊"
            }
          ],
          "text": "人类可真是没有幽默感啊",
          "speaker": "right",
          "emotion": "DISAPPOINT",
          "balloon": {
            "sourceType": 4,
            "position": [
              150,
              -30
            ],
            "length": 5,
            "inverted": true
          },
          "portraits": {
            "left": {
              "character": "reimu",
              "active": false,
              "emotion": "DISAPPOINT",
              "present": true
            },
            "right": {
              "character": "sunny",
              "active": true,
              "emotion": "DISAPPOINT",
              "present": true
            }
          }
        },
        {
          "step": 9,
          "sourceLine": 482,
          "coldFrames": 2,
          "autoFrames": 500,
          "events": [
            {
              "type": "text",
              "speaker": "right",
              "text": "既然都来了，那就比试一下吧，打赢了我就告诉你！"
            },
            {
              "type": "music",
              "action": "stop"
            },
            {
              "type": "music",
              "action": "play",
              "track": "grassland"
            },
            {
              "type": "music",
              "action": "caption",
              "text": "赌上性命去恶作剧"
            }
          ],
          "text": "既然都来了，那就比试一下吧，打赢了我就告诉你！",
          "speaker": "right",
          "emotion": "DISAPPOINT",
          "balloon": {
            "sourceType": 4,
            "position": [
              150,
              -30
            ],
            "length": 6,
            "inverted": true
          },
          "portraits": {
            "left": {
              "character": "reimu",
              "active": false,
              "emotion": "DISAPPOINT",
              "present": true
            },
            "right": {
              "character": "sunny",
              "active": true,
              "emotion": "DISAPPOINT",
              "present": true
            }
          }
        },
        {
          "step": 10,
          "sourceLine": 488,
          "coldFrames": 2,
          "autoFrames": 500,
          "events": [
            {
              "type": "bossMagicSquare"
            },
            {
              "type": "startAttack",
              "attack": "SunnyMilk_SC_1"
            },
            {
              "type": "complete"
            }
          ],
          "terminal": true,
          "portraits": {
            "left": {
              "character": "reimu",
              "active": false,
              "emotion": "DISAPPOINT",
              "present": true
            },
            "right": {
              "character": "sunny",
              "active": true,
              "emotion": "DISAPPOINT",
              "present": true
            }
          }
        }
      ]
    },
    "sunny:0:after": {
      "id": "sunny:0:after",
      "sourceClass": "Dialog_Reimu_SunnyMilk_2",
      "bossId": "sunny",
      "character": 0,
      "phase": "after",
      "startDelayFrames": 50,
      "steps": [
        {
          "step": 0,
          "sourceLine": 505,
          "coldFrames": 30,
          "autoFrames": 300,
          "events": [
            {
              "type": "portrait",
              "side": "left",
              "character": "reimu"
            },
            {
              "type": "portrait",
              "side": "right",
              "character": "sunnymilk"
            },
            {
              "type": "active",
              "side": "left",
              "value": true
            },
            {
              "type": "active",
              "side": "right",
              "value": false
            },
            {
              "type": "emotion",
              "side": "left",
              "value": "SWEAT"
            },
            {
              "type": "emotion",
              "side": "right",
              "value": "LOSE"
            },
            {
              "type": "text",
              "speaker": "left",
              "text": "像你这种妖精待在森林里真的不会引发火灾吗"
            }
          ],
          "text": "像你这种妖精待在森林里真的不会引发火灾吗",
          "speaker": "left",
          "emotion": "SWEAT",
          "balloon": {
            "sourceType": 1,
            "position": [
              -150,
              -30
            ],
            "length": 6,
            "inverted": false
          },
          "portraits": {
            "left": {
              "character": "reimu",
              "active": true,
              "emotion": "SWEAT",
              "present": true
            },
            "right": {
              "character": "sunny",
              "active": false,
              "emotion": "LOSE",
              "present": true
            }
          }
        },
        {
          "step": 1,
          "sourceLine": 514,
          "coldFrames": 120,
          "autoFrames": 500,
          "events": [
            {
              "type": "emotion",
              "side": "left",
              "value": "DISAPPOINT"
            },
            {
              "type": "text",
              "speaker": "left",
              "text": "算了，已经没有时间考虑这些了"
            }
          ],
          "text": "算了，已经没有时间考虑这些了",
          "speaker": "left",
          "emotion": "DISAPPOINT",
          "balloon": {
            "sourceType": 1,
            "position": [
              -150,
              -30
            ],
            "length": 5,
            "inverted": false
          },
          "portraits": {
            "left": {
              "character": "reimu",
              "active": true,
              "emotion": "DISAPPOINT",
              "present": true
            },
            "right": {
              "character": "sunny",
              "active": false,
              "emotion": "LOSE",
              "present": true
            }
          }
        },
        {
          "step": 2,
          "sourceLine": 519,
          "coldFrames": 2,
          "autoFrames": 500,
          "events": [
            {
              "type": "complete"
            },
            {
              "type": "clearLevel"
            }
          ],
          "terminal": true,
          "portraits": {
            "left": {
              "character": "reimu",
              "active": true,
              "emotion": "DISAPPOINT",
              "present": true
            },
            "right": {
              "character": "sunny",
              "active": false,
              "emotion": "LOSE",
              "present": true
            }
          }
        }
      ]
    },
    "sunny:1:before": {
      "id": "sunny:1:before",
      "sourceClass": "Dialog_Marisa_SunnyMilk",
      "bossId": "sunny",
      "character": 1,
      "phase": "before",
      "startDelayFrames": 0,
      "steps": [
        {
          "step": 0,
          "sourceLine": 533,
          "coldFrames": 30,
          "autoFrames": 300,
          "events": [
            {
              "type": "portrait",
              "side": "left",
              "character": "marisa"
            },
            {
              "type": "active",
              "side": "left",
              "value": true
            },
            {
              "type": "emotion",
              "side": "left",
              "value": "PUZZLED"
            },
            {
              "type": "text",
              "speaker": "left",
              "text": "来时的路这么快就已经长满了树，已经完全找不到出去的路了"
            }
          ],
          "text": "来时的路这么快就已经长满了树，已经完全找不到出去的路了",
          "speaker": "left",
          "emotion": "PUZZLED",
          "balloon": {
            "sourceType": 1,
            "position": [
              -150,
              -30
            ],
            "length": 7,
            "inverted": false
          },
          "portraits": {
            "left": {
              "character": "marisa",
              "active": true,
              "emotion": "PUZZLED",
              "present": true
            },
            "right": {
              "character": "sunny",
              "active": false,
              "emotion": "NOTICE"
            }
          }
        },
        {
          "step": 1,
          "sourceLine": 539,
          "coldFrames": 2,
          "autoFrames": 500,
          "events": [
            {
              "type": "emotion",
              "side": "left",
              "value": "DISAPPOINT"
            },
            {
              "type": "text",
              "speaker": "left",
              "text": "这片森林处处都让人觉得诡异啊"
            }
          ],
          "text": "这片森林处处都让人觉得诡异啊",
          "speaker": "left",
          "emotion": "DISAPPOINT",
          "balloon": {
            "sourceType": 1,
            "position": [
              -150,
              -30
            ],
            "length": 5,
            "inverted": false
          },
          "portraits": {
            "left": {
              "character": "marisa",
              "active": true,
              "emotion": "DISAPPOINT",
              "present": true
            },
            "right": {
              "character": "sunny",
              "active": false,
              "emotion": "NOTICE"
            }
          }
        },
        {
          "step": 2,
          "sourceLine": 543,
          "coldFrames": 120,
          "autoFrames": 500,
          "events": [
            {
              "type": "spawnBoss",
              "bossId": "sunny"
            },
            {
              "type": "bossLife",
              "value": 3
            },
            {
              "type": "bossPosition",
              "position": [
                0,
                100,
                0
              ]
            },
            {
              "type": "revealBoss"
            },
            {
              "type": "active",
              "side": "left",
              "value": false
            },
            {
              "type": "emotion",
              "side": "left",
              "value": "SURPRISE"
            },
            {
              "type": "text",
              "speaker": "right",
              "text": "真是细心的人类啊~"
            }
          ],
          "text": "真是细心的人类啊~",
          "speaker": "right",
          "emotion": "NOTICE",
          "balloon": {
            "sourceType": 4,
            "position": [
              0,
              60
            ],
            "length": 4,
            "inverted": false
          },
          "portraits": {
            "left": {
              "character": "marisa",
              "active": false,
              "emotion": "SURPRISE",
              "present": true
            },
            "right": {
              "character": "sunny",
              "active": false,
              "emotion": "NOTICE"
            }
          }
        },
        {
          "step": 3,
          "sourceLine": 556,
          "coldFrames": 2,
          "autoFrames": 500,
          "events": [
            {
              "type": "bossName",
              "index": 0
            },
            {
              "type": "portrait",
              "side": "right",
              "character": "sunnymilk"
            },
            {
              "type": "active",
              "side": "left",
              "value": false
            },
            {
              "type": "active",
              "side": "right",
              "value": true
            },
            {
              "type": "emotion",
              "side": "left",
              "value": "SURPRISE"
            },
            {
              "type": "emotion",
              "side": "right",
              "value": "DISAPPOINT"
            },
            {
              "type": "text",
              "speaker": "right",
              "text": "不过话说回来，这么快就打算离开了吗"
            }
          ],
          "text": "不过话说回来，这么快就打算离开了吗",
          "speaker": "right",
          "emotion": "DISAPPOINT",
          "balloon": {
            "sourceType": 4,
            "position": [
              150,
              -30
            ],
            "length": 6,
            "inverted": true
          },
          "portraits": {
            "left": {
              "character": "marisa",
              "active": false,
              "emotion": "SURPRISE",
              "present": true
            },
            "right": {
              "character": "sunny",
              "active": true,
              "emotion": "DISAPPOINT",
              "present": true
            }
          }
        },
        {
          "step": 4,
          "sourceLine": 567,
          "coldFrames": 2,
          "autoFrames": 500,
          "events": [
            {
              "type": "active",
              "side": "left",
              "value": true
            },
            {
              "type": "active",
              "side": "right",
              "value": false
            },
            {
              "type": "emotion",
              "side": "left",
              "value": "NOTICE2"
            },
            {
              "type": "emotion",
              "side": "right",
              "value": "PUZZLED"
            },
            {
              "type": "text",
              "speaker": "left",
              "text": "已经改变主意了"
            }
          ],
          "text": "已经改变主意了",
          "speaker": "left",
          "emotion": "NOTICE2",
          "balloon": {
            "sourceType": 1,
            "position": [
              -150,
              -30
            ],
            "length": 4,
            "inverted": false
          },
          "portraits": {
            "left": {
              "character": "marisa",
              "active": true,
              "emotion": "NOTICE2",
              "present": true
            },
            "right": {
              "character": "sunny",
              "active": false,
              "emotion": "PUZZLED",
              "present": true
            }
          }
        },
        {
          "step": 5,
          "sourceLine": 574,
          "coldFrames": 2,
          "autoFrames": 500,
          "events": [
            {
              "type": "emotion",
              "side": "left",
              "value": "HAPPY"
            },
            {
              "type": "text",
              "speaker": "left",
              "text": "毕竟没有比幕后黑手就在眼前更让人兴奋的事了"
            }
          ],
          "text": "毕竟没有比幕后黑手就在眼前更让人兴奋的事了",
          "speaker": "left",
          "emotion": "HAPPY",
          "balloon": {
            "sourceType": 1,
            "position": [
              -150,
              -30
            ],
            "length": 6,
            "inverted": false
          },
          "portraits": {
            "left": {
              "character": "marisa",
              "active": true,
              "emotion": "HAPPY",
              "present": true
            },
            "right": {
              "character": "sunny",
              "active": false,
              "emotion": "PUZZLED",
              "present": true
            }
          }
        },
        {
          "step": 6,
          "sourceLine": 578,
          "coldFrames": 2,
          "autoFrames": 500,
          "events": [
            {
              "type": "active",
              "side": "left",
              "value": false
            },
            {
              "type": "active",
              "side": "right",
              "value": true
            },
            {
              "type": "emotion",
              "side": "left",
              "value": "DISAPPOINT"
            },
            {
              "type": "emotion",
              "side": "right",
              "value": "SURPRISE"
            },
            {
              "type": "text",
              "speaker": "right",
              "text": "啊喂，你在说什么啊，完全听不懂"
            }
          ],
          "text": "啊喂，你在说什么啊，完全听不懂",
          "speaker": "right",
          "emotion": "SURPRISE",
          "balloon": {
            "sourceType": 4,
            "position": [
              150,
              -30
            ],
            "length": 5,
            "inverted": true
          },
          "portraits": {
            "left": {
              "character": "marisa",
              "active": false,
              "emotion": "DISAPPOINT",
              "present": true
            },
            "right": {
              "character": "sunny",
              "active": true,
              "emotion": "SURPRISE",
              "present": true
            }
          }
        },
        {
          "step": 7,
          "sourceLine": 585,
          "coldFrames": 2,
          "autoFrames": 500,
          "events": [
            {
              "type": "emotion",
              "side": "right",
              "value": "ANGRY"
            },
            {
              "type": "text",
              "speaker": "right",
              "text": "一点幽默感都没有"
            }
          ],
          "text": "一点幽默感都没有",
          "speaker": "right",
          "emotion": "ANGRY",
          "balloon": {
            "sourceType": 4,
            "position": [
              150,
              -30
            ],
            "length": 4,
            "inverted": true
          },
          "portraits": {
            "left": {
              "character": "marisa",
              "active": false,
              "emotion": "DISAPPOINT",
              "present": true
            },
            "right": {
              "character": "sunny",
              "active": true,
              "emotion": "ANGRY",
              "present": true
            }
          }
        },
        {
          "step": 8,
          "sourceLine": 589,
          "coldFrames": 2,
          "autoFrames": 500,
          "events": [
            {
              "type": "active",
              "side": "left",
              "value": true
            },
            {
              "type": "active",
              "side": "right",
              "value": false
            },
            {
              "type": "emotion",
              "side": "left",
              "value": "SWEAT"
            },
            {
              "type": "emotion",
              "side": "right",
              "value": "PUZZLED"
            },
            {
              "type": "text",
              "speaker": "left",
              "text": "妖精们都把这种所谓的恶作剧视为幽默吗"
            }
          ],
          "text": "妖精们都把这种所谓的恶作剧视为幽默吗",
          "speaker": "left",
          "emotion": "SWEAT",
          "balloon": {
            "sourceType": 1,
            "position": [
              -150,
              -30
            ],
            "length": 6,
            "inverted": false
          },
          "portraits": {
            "left": {
              "character": "marisa",
              "active": true,
              "emotion": "SWEAT",
              "present": true
            },
            "right": {
              "character": "sunny",
              "active": false,
              "emotion": "PUZZLED",
              "present": true
            }
          }
        },
        {
          "step": 9,
          "sourceLine": 596,
          "coldFrames": 2,
          "autoFrames": 500,
          "events": [
            {
              "type": "emotion",
              "side": "left",
              "value": "ANGRY"
            },
            {
              "type": "text",
              "speaker": "left",
              "text": "看来有必要退治一下了！"
            },
            {
              "type": "music",
              "action": "stop"
            },
            {
              "type": "music",
              "action": "play",
              "track": "grassland"
            },
            {
              "type": "music",
              "action": "caption",
              "text": "赌上性命去恶作剧"
            }
          ],
          "text": "看来有必要退治一下了！",
          "speaker": "left",
          "emotion": "ANGRY",
          "balloon": {
            "sourceType": 1,
            "position": [
              -150,
              -30
            ],
            "length": 5,
            "inverted": false
          },
          "portraits": {
            "left": {
              "character": "marisa",
              "active": true,
              "emotion": "ANGRY",
              "present": true
            },
            "right": {
              "character": "sunny",
              "active": false,
              "emotion": "PUZZLED",
              "present": true
            }
          }
        },
        {
          "step": 10,
          "sourceLine": 603,
          "coldFrames": 2,
          "autoFrames": 500,
          "events": [
            {
              "type": "bossMagicSquare"
            },
            {
              "type": "startAttack",
              "attack": "SunnyMilk_SC_1"
            },
            {
              "type": "complete"
            }
          ],
          "terminal": true,
          "portraits": {
            "left": {
              "character": "marisa",
              "active": true,
              "emotion": "ANGRY",
              "present": true
            },
            "right": {
              "character": "sunny",
              "active": false,
              "emotion": "PUZZLED",
              "present": true
            }
          }
        }
      ]
    },
    "sunny:1:after": {
      "id": "sunny:1:after",
      "sourceClass": "Dialog_Marisa_SunnyMilk_2",
      "bossId": "sunny",
      "character": 1,
      "phase": "after",
      "startDelayFrames": 50,
      "steps": [
        {
          "step": 0,
          "sourceLine": 620,
          "coldFrames": 30,
          "autoFrames": 300,
          "events": [
            {
              "type": "portrait",
              "side": "left",
              "character": "marisa"
            },
            {
              "type": "portrait",
              "side": "right",
              "character": "sunnymilk"
            },
            {
              "type": "active",
              "side": "left",
              "value": false
            },
            {
              "type": "active",
              "side": "right",
              "value": true
            },
            {
              "type": "emotion",
              "side": "left",
              "value": "HAPPY"
            },
            {
              "type": "emotion",
              "side": "right",
              "value": "LOSE"
            },
            {
              "type": "text",
              "speaker": "right",
              "text": "呜呜，那些都只是你看到的假象啦~"
            }
          ],
          "text": "呜呜，那些都只是你看到的假象啦~",
          "speaker": "right",
          "emotion": "LOSE",
          "balloon": {
            "sourceType": 4,
            "position": [
              150,
              -30
            ],
            "length": 5,
            "inverted": true
          },
          "portraits": {
            "left": {
              "character": "marisa",
              "active": false,
              "emotion": "HAPPY",
              "present": true
            },
            "right": {
              "character": "sunny",
              "active": true,
              "emotion": "LOSE",
              "present": true
            }
          }
        },
        {
          "step": 1,
          "sourceLine": 629,
          "coldFrames": 2,
          "autoFrames": 500,
          "events": [
            {
              "type": "active",
              "side": "left",
              "value": true
            },
            {
              "type": "active",
              "side": "right",
              "value": false
            },
            {
              "type": "emotion",
              "side": "left",
              "value": "NOTICE2"
            },
            {
              "type": "text",
              "speaker": "left",
              "text": "路果然通了呢"
            }
          ],
          "text": "路果然通了呢",
          "speaker": "left",
          "emotion": "NOTICE2",
          "balloon": {
            "sourceType": 1,
            "position": [
              -150,
              -30
            ],
            "length": 4,
            "inverted": false
          },
          "portraits": {
            "left": {
              "character": "marisa",
              "active": true,
              "emotion": "NOTICE2",
              "present": true
            },
            "right": {
              "character": "sunny",
              "active": false,
              "emotion": "LOSE",
              "present": true
            }
          }
        },
        {
          "step": 2,
          "sourceLine": 635,
          "coldFrames": 120,
          "autoFrames": 500,
          "events": [
            {
              "type": "emotion",
              "side": "left",
              "value": "NOTICE"
            },
            {
              "type": "text",
              "speaker": "left",
              "text": "不过，这一切应该不止妖精的恶作剧这么简单吧"
            }
          ],
          "text": "不过，这一切应该不止妖精的恶作剧这么简单吧",
          "speaker": "left",
          "emotion": "NOTICE",
          "balloon": {
            "sourceType": 1,
            "position": [
              -150,
              -30
            ],
            "length": 6,
            "inverted": false
          },
          "portraits": {
            "left": {
              "character": "marisa",
              "active": true,
              "emotion": "NOTICE",
              "present": true
            },
            "right": {
              "character": "sunny",
              "active": false,
              "emotion": "LOSE",
              "present": true
            }
          }
        },
        {
          "step": 3,
          "sourceLine": 640,
          "coldFrames": 2,
          "autoFrames": 500,
          "events": [
            {
              "type": "complete"
            },
            {
              "type": "clearLevel"
            }
          ],
          "terminal": true,
          "portraits": {
            "left": {
              "character": "marisa",
              "active": true,
              "emotion": "NOTICE",
              "present": true
            },
            "right": {
              "character": "sunny",
              "active": false,
              "emotion": "LOSE",
              "present": true
            }
          }
        }
      ]
    }
  }
};
