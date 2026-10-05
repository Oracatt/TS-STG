import assert from 'node:assert/strict';
import net from 'node:net';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const [executable,backend='quickjs']=process.argv.slice(2);
assert.ok(executable,'Expected native executable path');
for(const disconnect of [false,true])await verify(disconnect);
console.log(`Frame stream: ${backend} topdown opaque GPU pixels, 2-render cadence and disconnect exit passed`);

async function verify(disconnect){
  const pipe=`\\\\.\\pipe\\ts-stg-test-${randomUUID()}`;
  let socket,child,received=0,pending=Buffer.alloc(0),failure,stderr='',socketClosed=Promise.resolve();
  const server=net.createServer(connection=>{
    socket=connection;
    socketClosed=new Promise(resolve=>connection.once('close',resolve));
    connection.on('error',error=>{failure??=error;});
    connection.on('data',chunk=>{
      try{
        pending=Buffer.concat([pending,chunk]);
        while(pending.length>=16){
          assert.equal(pending.toString('ascii',0,4),'TSFR');
          const width=pending.readUInt32LE(4),height=pending.readUInt32LE(8),size=pending.readUInt32LE(12);
          assert.deepEqual([width,height,size],[960,720,960*720*4]);
          if(pending.length<16+size)break;
          const pixels=pending.subarray(16,16+size);
          for(const [x,y,rgba] of [[1,1,[0,0,0,255]],[120,90,[255,0,0,255]],[840,90,[0,255,0,255]],[120,630,[0,0,255,255]],[840,630,[255,255,255,255]]])
            assert.deepEqual([...pixels.subarray((y*width+x)*4,(y*width+x)*4+4)],rgba,`GPU pixel at ${x},${y}`);
          received++;pending=pending.subarray(16+size);
          if(disconnect){connection.destroy();break;}
        }
      }catch(error){failure??=error;connection.destroy();}
    });
  });
  try{
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(pipe,resolve);});
    const args=['native/tests/frame-stream.js','--root',root,'--backend',backend,'--frame-stream',pipe];
    if(!disconnect)args.push('--frames','8','--benchmark');
    child=spawn(executable,args,{cwd:root,windowsHide:true,stdio:['ignore','ignore','pipe']});
    child.stderr.on('data',chunk=>{stderr+=chunk;});
    const code=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{child.kill();reject(new Error('Frame stream process did not exit within 15 seconds'));},15000);
      child.once('error',error=>{clearTimeout(timer);reject(error);});
      child.once('exit',value=>{clearTimeout(timer);resolve(value);});
    });
    await socketClosed;
    if(failure)throw failure;
    assert.equal(code,0,stderr);
    assert.equal(received,disconnect?1:4,'Expected one frame per two native renders');
    assert.equal(pending.length,0,'Incomplete frame at process exit');
  }finally{
    socket?.destroy();child?.kill();await new Promise(resolve=>server.close(resolve));
  }
}
