cmake_minimum_required(VERSION 3.10)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_BUILD_TYPE RelWithDebInfo)
 
project(testproj)
 
file(GLOB_RECURSE WASM_SOURCES src/core/*.cpp)
add_executable(testproj ${WASM_SOURCES})

add_subdirectory(src/thirdparty/physx)
add_subdirectory(src/thirdparty/bgfx)

target_link_libraries(testproj PRIVATE physx bgfx bimg bx)

target_include_directories(testproj PRIVATE
	src/thirdparty/bgfx/bgfx/include
	src/thirdparty/bgfx/bimg/include
	src/thirdparty/bgfx/bx/include)

if(EMSCRIPTEN)
	set_target_properties(testproj PROPERTIES PREFIX "" SUFFIX ".html")
	set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -s INITIAL_MEMORY=268435456 -s ALLOW_MEMORY_GROWTH=1 -s ASSERTIONS=1")
endif()
