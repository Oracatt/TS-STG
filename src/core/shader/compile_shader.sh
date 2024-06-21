../../../tools/bgfx/shaderc -f vs.sc -o vs.bin --type vertex --platform asm.js --profile 300_es --varyingdef
../../../tools/bgfx/shaderc -f ps.sc -o ps.bin --type vertex --platform asm.js --profile 300_es --varyingdef

../../../tools/bgfx/bin2c -f vs.bin -o vs.h -n vs_data
../../../tools/bgfx/bin2c -f ps.bin -o ps.h -n ps_data