layout(location = 0) in vec3 a_position;
layout(location = 1) in vec4 a_color0;

#include "varying.def.sc"

void main()
{
    gl_Position = vec4(a_position, 1.0);
    v_color0 = a_color0;
}