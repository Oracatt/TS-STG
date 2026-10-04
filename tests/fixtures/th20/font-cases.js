export function* fontCases(font){
 const text=font>=2&&font<=5||font===10||font===11?'12,345.67/8':'Abg 12.\nT';
 for(const screenScale of [1,1.5,2])for(const alignX of [0,1,2])for(const alignY of [0,1,2])for(const rotation of [0,.375]){
  yield {text,screenScale,options:{font,x:123.25,y:-4.125,scaleX:.625,scaleY:1.125,alignX,alignY,rotation,color:0x807030ff,shadowColor:0x50010408}};
 }
}
