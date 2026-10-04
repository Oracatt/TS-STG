import test from 'node:test';
import assert from 'node:assert/strict';
import {Keys,DrawList,TouhouStageSelect} from '@ts-stg/thlib';

function fixture(options={}){
  const drawn=[],events=[],vm={interrupt:(...args)=>events.push(['interrupt',...args])};
  const page=new TouhouStageSelect({bank:{create:id=>(events.push(['create',id]),vm)},
    font:{draw:(_draw,label,style)=>drawn.push({label,...style})},
    entries:Array.from({length:16},(_,index)=>({label:`Card ${index+1}`})),
    sound:id=>events.push(['sound',id]),onSelect:(_entry,index)=>events.push(['select',index]),
    onCancel:()=>events.push(['cancel']),...options});
  return{page,drawn,events};
}
const tick=(page,count,mask=0)=>{for(let frame=0;frame<count;frame++)page.update(mask);};

test('public source stage list honors entrance, confirm and cancel timing',()=>{
  const {page,events}=fixture();assert.deepEqual(events,[['create',43]]);
  tick(page,11);assert.equal(page.phase,1);page.update();assert.equal(page.phase,2);
  page.update(Keys.CONFIRM);assert.equal(page.phase,3);tick(page,39);assert.ok(!events.some(event=>event[0]==='select'));
  page.update();assert.deepEqual(events.at(-1),['select',0]);assert.equal(page.active,false);
  const back=fixture();tick(back.page,12);back.page.update(Keys.CANCEL);tick(back.page,5);assert.equal(back.page.active,true);
  back.page.update();assert.deepEqual(back.events.at(-1),['cancel']);back.page.destroy();assert.deepEqual(back.events.at(-1),['interrupt',1,true]);
});

test('all authored practice cards can be selected and pages retain original coordinates/colors',()=>{
  const {page,events,drawn}=fixture({pageSize:8});tick(page,22);page.update(Keys.UP);assert.equal(page.selection,15);
  page.draw(new DrawList());assert.equal(drawn.length,9);assert.equal(drawn[0].label,'Card 9');
  assert.deepEqual({x:drawn[7].x,y:drawn[7].y,color:drawn[7].color,font:drawn[7].font},{x:330,y:408,color:0xffffff00,font:7});
  page.update(0);page.update(Keys.LEFT);assert.equal(page.selection,7);
  page.update(0);page.update(Keys.CONFIRM);tick(page,40);assert.deepEqual(events.at(-1),['select',7]);
});

test('unavailable entries are drawn but cannot launch',()=>{
  const {page,events}=fixture({entries:[{label:'Unavailable',disabled:true}]});tick(page,12);
  page.update(Keys.CONFIRM);assert.equal(page.phase,2);assert.deepEqual(events.at(-1),['sound',16]);
});

test('short custom lists wrap page jumps without negative selections',()=>{
  const {page}=fixture({entries:Array.from({length:5},(_,index)=>({label:String(index)}))});
  page.move(-6);assert.equal(page.selection,4);page.move(6);assert.equal(page.selection,0);
  assert.throws(()=>fixture({pageSize:0}),/positive integer/);
});
