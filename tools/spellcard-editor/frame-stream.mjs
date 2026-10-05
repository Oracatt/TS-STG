/** Incremental TSFR decoder. Accept arbitrary pipe chunk boundaries without
 * repeatedly concatenating multi-megabyte frames. All pixels are native RGBA. */
export class FrameStreamDecoder {
  constructor(onFrame){this.onFrame=onFrame;this.header=Buffer.alloc(16);this.offset=0;this.pixels=null;}
  push(chunk){
    let at=0;
    while(at<chunk.length){
      if(!this.pixels){
        const count=Math.min(16-this.offset,chunk.length-at);chunk.copy(this.header,this.offset,at,at+count);this.offset+=count;at+=count;
        if(this.offset<16)continue;
        const width=this.header.readUInt32LE(4),height=this.header.readUInt32LE(8),bytes=this.header.readUInt32LE(12);
        if(this.header.toString('ascii',0,4)!=='TSFR'||width<1||height<1||width>4096||height>4096||bytes!==width*height*4)
          throw Error('Invalid native frame header');
        this.width=width;this.height=height;this.pixels=Buffer.allocUnsafe(bytes);this.offset=0;
      }
      const count=Math.min(this.pixels.length-this.offset,chunk.length-at);chunk.copy(this.pixels,this.offset,at,at+count);this.offset+=count;at+=count;
      if(this.offset===this.pixels.length){const frame={width:this.width,height:this.height,pixels:this.pixels};this.pixels=null;this.offset=0;this.onFrame(frame);}
    }
  }
}
