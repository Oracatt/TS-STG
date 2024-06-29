cmake_minimum_required(VERSION 3.10)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_BUILD_TYPE RelWithDebInfo)
 
project(tsstg)
 
file(GLOB_RECURSE WASM_SOURCES src/core/*.cpp)
add_executable(tsstg ${WASM_SOURCES})

add_subdirectory(src/thirdparty/physx)
add_subdirectory(src/thirdparty/bgfx)

target_link_libraries(tsstg PRIVATE physx bgfx bimg bx)

target_include_directories(tsstg PRIVATE
	src/core
	src/thirdparty/bgfx/bgfx/include
	src/thirdparty/bgfx/bimg/include
	src/thirdparty/bgfx/bx/include)

if(EMSCRIPTEN)
	set_target_properties(tsstg PROPERTIES PREFIX "" SUFFIX ".html")
	set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -s USE_SDL=2 -s INITIAL_MEMORY=268435456 -s ALLOW_MEMORY_GROWTH=1 -s ASSERTIONS=1 -s USE_WEBGL2=1 -s FULL_ES3=1 -s WASM=1 -O2")
endif()
