..\..\..\tools\bgfx\shaderc.exe -f vs.sc -o vs.bin --type vertex --platform asm.js --profile 120 --varyingdef
..\..\..\tools\bgfx\shaderc.exe -f ps.sc -o ps.bin --type fragment --platform asm.js --profile 120 --varyingdef

..\..\..\tools\bgfx\bin2c.exe -f vs.bin -o vs.h -n vs_data
..\..\..\tools\bgfx\bin2c.exe -f ps.bin -o ps.h -n ps_data