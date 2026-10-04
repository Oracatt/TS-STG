cmake_minimum_required(VERSION 3.24)
project(TSSTG_OriginalBitmapTextOracle LANGUAGES CXX)
if(NOT WIN32 OR NOT CMAKE_SIZEOF_VOID_P EQUAL 4)
  message(FATAL_ERROR "The original Bitmap ABI requires a separate Win32 build")
endif()
set(REFERENCE_ROOT "D:/AIWorkspace/Touhou20Reconstruction/source_reconstruction" CACHE PATH "Read-only reconstruction sources")
set(CMAKE_CXX_STANDARD 17)
file(READ "${REFERENCE_ROOT}/text_renderer/raster.cpp" ORIGINAL_RASTER)
string(FIND "${ORIGINAL_RASTER}" "RasterizedText rasterize_text(" RASTER_START)
string(FIND "${ORIGINAL_RASTER}" "void upload_text_bitmap(" RASTER_END)
math(EXPR RASTER_LENGTH "${RASTER_END}-${RASTER_START}")
string(SUBSTRING "${ORIGINAL_RASTER}" ${RASTER_START} ${RASTER_LENGTH} RASTER_FUNCTION)
# Keep the actual original pixel algorithm. Its application-global mutex is
# irrelevant for this isolated, single-threaded diagnostic process.
string(REPLACE "    std::lock_guard lock(runtime::shared_locks().slot(18));" "" RASTER_FUNCTION "${RASTER_FUNCTION}")
file(WRITE "${CMAKE_CURRENT_BINARY_DIR}/original_raster_function.cpp"
  "#include \"raster.hpp\"\n#include \"fonts.hpp\"\n#include <cwchar>\n#include <emmintrin.h>\nnamespace th20::source::text { float next_outline_scale=1.f;\n${RASTER_FUNCTION}\n}\n")
add_executable(tsstg-original-bitmap-text-oracle main.cpp
  "${CMAKE_CURRENT_BINARY_DIR}/original_raster_function.cpp"
  "${REFERENCE_ROOT}/text_renderer/bitmap.cpp"
  "${REFERENCE_ROOT}/platform_window/fonts.cpp")
target_include_directories(tsstg-original-bitmap-text-oracle PRIVATE
  "${REFERENCE_ROOT}/text_renderer" "${REFERENCE_ROOT}/platform_window")
target_link_libraries(tsstg-original-bitmap-text-oracle PRIVATE gdi32 user32)
target_compile_options(tsstg-original-bitmap-text-oracle PRIVATE /W4 /utf-8 /fp:strict /EHsc)
