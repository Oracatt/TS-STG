// SPDX-License-Identifier: GPL-3.0-only
import {TouhouMusic} from '@ts-stg/thlib/touhou';

/** Rush's archive stores loop offsets in interleaved samples. All playback
 * and temporary-screen lifecycle is shared with other thlib applications. */
export class RushMusic extends TouhouMusic {
  constructor(host,tracks,{basePath='games/rushboss/assets',volume=.7}={}) {
    super(host,Object.fromEntries(Object.entries(tracks).map(([key,track])=>[key,{
      file:track.file,loopStart:track.loopBegin/(track.sampleRate*track.channels),
      loopEnd:track.loopEnd/(track.sampleRate*track.channels),
    }])),{basePath,volume});
  }
}
