cmake_minimum_required(VERSION 3.24)
project(TS_STG VERSION 0.1.0 LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
include(FetchContent)
include(CTest)

if(WIN32 AND MSVC AND CMAKE_SIZEOF_VOID_P EQUAL 8)
  set(TSSTG_V8_DEFAULT ON)
else()
  set(TSSTG_V8_DEFAULT OFF)
endif()
option(TSSTG_ENABLE_V8 "Build the embedded V8 JIT backend" ${TSSTG_V8_DEFAULT})
set(TSSTG_V8_SDK "${CMAKE_BINARY_DIR}/v8-sdk" CACHE PATH "Pinned V8 headers and static library")
if(TSSTG_ENABLE_V8)
  if(MSVC)
    # The pinned Windows V8 library uses the static CRT. Compile the host and
    # its dependencies with the same allocator/runtime instead of mixing CRTs.
    set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded")
  endif()
  if(NOT WIN32 OR NOT MSVC OR NOT CMAKE_SIZEOF_VOID_P EQUAL 8)
    message(FATAL_ERROR "The pinned V8 SDK currently supports Windows x64 with MSVC. Use TSSTG_ENABLE_V8=OFF for QuickJS-only builds.")
  endif()
  if(NOT EXISTS "${TSSTG_V8_SDK}/v8-host.lib" OR NOT EXISTS "${TSSTG_V8_SDK}/include/v8.h")
    find_program(TSSTG_POWERSHELL NAMES pwsh powershell REQUIRED)
    execute_process(COMMAND "${TSSTG_POWERSHELL}" -NoProfile -NonInteractive -File
      "${CMAKE_CURRENT_SOURCE_DIR}/tools/fetch-v8-sdk.ps1" -Destination "${TSSTG_V8_SDK}" -Librarian "${CMAKE_AR}"
      RESULT_VARIABLE TSSTG_V8_FETCH_RESULT)
    if(NOT TSSTG_V8_FETCH_RESULT EQUAL 0)
      message(FATAL_ERROR "Pinned V8 SDK download failed; see the preceding diagnostic.")
    endif()
  endif()
endif()

# Immutable upstream commits: raylib 5.5 and QuickJS-NG v0.10.1.
# Override FETCHCONTENT_SOURCE_DIR_RAYLIB / QUICKJS for offline builds.
set(BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(BUILD_GAMES OFF CACHE BOOL "" FORCE)
set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
set(QJS_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(QJS_BUILD_LIBC OFF CACHE BOOL "" FORCE)
FetchContent_Declare(raylib
  URL https://codeload.github.com/raysan5/raylib/tar.gz/c1ab645ca298a2801097931d1079b10ff7eb9df8
  URL_HASH SHA256=be3443c3fb97f7cbd18ae3f0ea2a73e6c1486128df33b639dce7e44070fc285d
  TIMEOUT 180 INACTIVITY_TIMEOUT 30
  DOWNLOAD_EXTRACT_TIMESTAMP TRUE)
FetchContent_Declare(quickjs
  URL https://codeload.github.com/quickjs-ng/quickjs/tar.gz/3c9afc9943323ee9c7dbd123c0cd991448f4b6c2
  URL_HASH SHA256=0af6f985be7030a7a9d12b92c25c2bc9f7dd716829c5074a81d7c4a4452040c8
  TIMEOUT 180 INACTIVITY_TIMEOUT 30
  DOWNLOAD_EXTRACT_TIMESTAMP TRUE)
foreach(dependency raylib quickjs)
  FetchContent_GetProperties(${dependency})
  if(NOT ${dependency}_POPULATED)
    FetchContent_Populate(${dependency})
    add_subdirectory(${${dependency}_SOURCE_DIR} ${${dependency}_BINARY_DIR} EXCLUDE_FROM_ALL)
  endif()
endforeach()

add_executable(ts-stg
  native/src/main.cpp
  native/src/host.cpp
  native/src/frame_stream.cpp
  native/src/geometry.cpp
  native/src/text_win32.cpp
  native/src/text_gdi.cpp
  native/src/quickjs_backend.cpp)
if(MSVC)
  set_source_files_properties(native/src/geometry.cpp PROPERTIES COMPILE_OPTIONS "/fp:strict")
else()
  set_source_files_properties(native/src/geometry.cpp PROPERTIES COMPILE_OPTIONS "-ffp-contract=off;-fno-fast-math")
endif()
target_include_directories(ts-stg PRIVATE native/include ${raylib_SOURCE_DIR}/src)
target_link_libraries(ts-stg PRIVATE raylib qjs)
if(TSSTG_ENABLE_V8)
  target_sources(ts-stg PRIVATE native/src/v8_backend.cpp)
  target_include_directories(ts-stg SYSTEM PRIVATE "${TSSTG_V8_SDK}/include")
  target_compile_definitions(ts-stg PRIVATE TSSTG_HAS_V8 V8_PROMISE_INTERNAL_FIELD_COUNT=1)
  target_link_libraries(ts-stg PRIVATE "${TSSTG_V8_SDK}/v8-host.lib" winmm dbghelp shlwapi)
endif()
if(WIN32)
  target_link_libraries(ts-stg PRIVATE d2d1 dwrite windowscodecs ole32 gdi32)
endif()
if(MSVC)
  target_compile_options(ts-stg PRIVATE /W4 /utf-8 /EHsc)
  target_compile_definitions(ts-stg PRIVATE NOMINMAX _CRT_SECURE_NO_WARNINGS)
  target_link_options(ts-stg PRIVATE /STACK:8388608)
  target_link_options(ts-stg PRIVATE "/MANIFEST:EMBED" "/MANIFESTINPUT:${CMAKE_CURRENT_SOURCE_DIR}/native/windows.manifest")
  set_property(TARGET ts-stg APPEND PROPERTY LINK_DEPENDS "${CMAKE_CURRENT_SOURCE_DIR}/native/windows.manifest")
else()
  target_compile_options(ts-stg PRIVATE -Wall -Wextra -Wpedantic)
endif()

if(BUILD_TESTING)
  add_executable(tsstg-frame-stream native/tests/frame_stream.cpp native/src/frame_stream.cpp)
  target_include_directories(tsstg-frame-stream PRIVATE native/include)
  if(MSVC)
    target_compile_options(tsstg-frame-stream PRIVATE /W4 /utf-8 /EHsc)
  endif()
  add_test(NAME native.frame-stream-protocol COMMAND tsstg-frame-stream)
  foreach(stream_failure missing-value relative remote empty-name nested headless)
    if(stream_failure STREQUAL "missing-value")
      set(stream_arguments --frame-stream)
    elseif(stream_failure STREQUAL "relative")
      set(stream_arguments --frame-stream preview)
    elseif(stream_failure STREQUAL "remote")
      set(stream_arguments --frame-stream "\\\\server\\pipe\\preview")
    elseif(stream_failure STREQUAL "empty-name")
      set(stream_arguments --frame-stream "\\\\.\\pipe\\")
    elseif(stream_failure STREQUAL "nested")
      set(stream_arguments --frame-stream "\\\\.\\pipe\\nested\\preview")
    else()
      set(stream_arguments --headless --frame-stream "\\\\.\\pipe\\preview")
    endif()
    add_test(NAME native.reject-frame-stream-${stream_failure} COMMAND ts-stg --root ${CMAKE_CURRENT_SOURCE_DIR} ${stream_arguments})
    set_tests_properties(native.reject-frame-stream-${stream_failure} PROPERTIES WILL_FAIL TRUE TIMEOUT 10)
  endforeach()
  # The original native tests explicitly exercise QuickJS; the same fixtures
  # also run on V8, including failures and command validation, when available.
  function(add_script_test)
    cmake_parse_arguments(SCRIPT "" "NAME" "COMMAND" ${ARGN})
    add_test(NAME "${SCRIPT_NAME}" COMMAND ${SCRIPT_COMMAND} --backend quickjs)
    if(TSSTG_ENABLE_V8)
      add_test(NAME "${SCRIPT_NAME}.v8" COMMAND ${SCRIPT_COMMAND} --backend v8)
      set_property(GLOBAL APPEND PROPERTY TSSTG_SCRIPT_TESTS "${SCRIPT_NAME}")
    endif()
  endfunction()
  add_executable(tsstg-quad-oracle native/tests/quad_oracle.cpp native/src/geometry.cpp)
  target_include_directories(tsstg-quad-oracle PRIVATE native/include)
  add_executable(tsstg-distortion-oracle native/tests/distortion_oracle.cpp)
  add_executable(tsstg-bullet-oracle native/tests/bullet_oracle.cpp)
  add_executable(tsstg-laser-oracle native/tests/laser_oracle.cpp)
  add_executable(tsstg-music-transport native/tests/music_transport.cpp)
  target_include_directories(tsstg-music-transport PRIVATE native/include)
  target_link_libraries(tsstg-music-transport PRIVATE raylib)
  if(MSVC)
    target_compile_options(tsstg-music-transport PRIVATE /W4 /utf-8 /EHsc)
  endif()
  # This fixture opens only an audio device, using a generated silent WAV.
  # Headless script fixtures cannot exercise the streaming PCM buffers.
  add_test(NAME native.music-transport COMMAND tsstg-music-transport)
  set_tests_properties(native.music-transport PROPERTIES SKIP_RETURN_CODE 77 TIMEOUT 15 RUN_SERIAL TRUE)
  if(WIN32)
    add_executable(tsstg-rush-warp-oracle native/tests/rush_warp_d3d11_oracle.cpp)
    target_link_libraries(tsstg-rush-warp-oracle PRIVATE d3d11 dxgi d3dcompiler)
    if(MSVC)
      target_compile_options(tsstg-rush-warp-oracle PRIVATE /W4 /utf-8 /EHsc)
      target_compile_definitions(tsstg-rush-warp-oracle PRIVATE NOMINMAX)
    endif()
    add_executable(tsstg-rush-presentation-oracle native/tests/rush_presentation_oracle.cpp)
    if(MSVC)
      target_compile_options(tsstg-rush-presentation-oracle PRIVATE /fp:strict /W4 /utf-8 /EHsc)
    endif()
  endif()
  if(EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/native/tests/th20_player_oracle.cpp")
    add_executable(ts-stg-th20-player-oracle native/tests/th20_player_oracle.cpp)
    if(MSVC)
      target_compile_options(ts-stg-th20-player-oracle PRIVATE /fp:strict /utf-8)
    else()
      target_compile_options(ts-stg-th20-player-oracle PRIVATE -ffp-contract=off)
    endif()
  endif()
  if(MSVC)
    target_compile_options(tsstg-distortion-oracle PRIVATE /fp:strict /utf-8)
    target_compile_options(tsstg-bullet-oracle PRIVATE /fp:strict /utf-8)
    target_compile_options(tsstg-laser-oracle PRIVATE /fp:strict /utf-8)
  else()
    target_compile_options(tsstg-distortion-oracle PRIVATE -ffp-contract=off)
    target_compile_options(tsstg-bullet-oracle PRIVATE -ffp-contract=off)
    target_compile_options(tsstg-laser-oracle PRIVATE -ffp-contract=off)
  endif()
  find_program(TSSTG_NODE node)
  if(TSSTG_NODE)
    if(WIN32)
      add_test(NAME native.frame-stream-pixels COMMAND ${TSSTG_NODE}
        ${CMAKE_CURRENT_SOURCE_DIR}/native/tests/frame-stream.mjs $<TARGET_FILE:ts-stg> quickjs)
      set_tests_properties(native.frame-stream-pixels PROPERTIES TIMEOUT 40 RUN_SERIAL TRUE)
      if(TSSTG_ENABLE_V8)
        add_test(NAME native.frame-stream-pixels.v8 COMMAND ${TSSTG_NODE}
          ${CMAKE_CURRENT_SOURCE_DIR}/native/tests/frame-stream.mjs $<TARGET_FILE:ts-stg> v8)
        set_tests_properties(native.frame-stream-pixels.v8 PROPERTIES TIMEOUT 40 RUN_SERIAL TRUE)
      endif()
      add_test(NAME native.rush-presentation-differential COMMAND ${TSSTG_NODE}
        ${CMAKE_CURRENT_SOURCE_DIR}/tools/verify-rushboss-presentation.mjs --oracle $<TARGET_FILE:tsstg-rush-presentation-oracle>
        --host $<TARGET_FILE:ts-stg> --out ${CMAKE_CURRENT_BINARY_DIR}/presentation-numerics)
    endif()
    add_test(NAME native.quad-binary32-differential COMMAND ${TSSTG_NODE}
      ${CMAKE_CURRENT_SOURCE_DIR}/tools/verify-quad.mjs --numeric-only --oracle $<TARGET_FILE:tsstg-quad-oracle>)
    add_test(NAME native.th20-distortion-differential COMMAND ${TSSTG_NODE}
      ${CMAKE_CURRENT_SOURCE_DIR}/tools/verify-distortion.mjs $<TARGET_FILE:tsstg-distortion-oracle> $<TARGET_FILE:ts-stg>)
    add_test(NAME native.th20-bullet-differential COMMAND ${TSSTG_NODE}
      ${CMAKE_CURRENT_SOURCE_DIR}/tools/verify-bullet-motion.mjs $<TARGET_FILE:tsstg-bullet-oracle> $<TARGET_FILE:ts-stg>)
    add_test(NAME native.th20-laser-differential COMMAND ${TSSTG_NODE}
      ${CMAKE_CURRENT_SOURCE_DIR}/tools/verify-laser-path.mjs $<TARGET_FILE:tsstg-laser-oracle> $<TARGET_FILE:ts-stg>)
  endif()
  add_script_test(NAME native.host-smoke COMMAND ts-stg native/tests/smoke.js
    --root ${CMAKE_CURRENT_SOURCE_DIR} --headless --frames 4 --input 16
    --snapshot ${CMAKE_CURRENT_BINARY_DIR}/native-smoke.json)
  add_script_test(NAME native.default-entry COMMAND ts-stg
    --root ${CMAKE_CURRENT_SOURCE_DIR}/native/tests/default-project --headless --frames 2
    --snapshot ${CMAKE_CURRENT_BINARY_DIR}/native-default-entry.json)
  add_script_test(NAME native.reject-invalid-command COMMAND ts-stg native/tests/invalid-command.js
    --root ${CMAKE_CURRENT_SOURCE_DIR} --headless --frames 1)
  set_tests_properties(native.reject-invalid-command PROPERTIES WILL_FAIL TRUE)
  add_script_test(NAME native.propagate-script-error COMMAND ts-stg native/tests/script-error.js
    --root ${CMAKE_CURRENT_SOURCE_DIR} --headless --frames 1)
  set_tests_properties(native.propagate-script-error PROPERTIES WILL_FAIL TRUE)
  add_script_test(NAME native.reject-traversal COMMAND ts-stg native/tests/traversal.js
    --root ${CMAKE_CURRENT_SOURCE_DIR} --headless --frames 1)
  set_tests_properties(native.reject-traversal PROPERTIES WILL_FAIL TRUE)
  add_script_test(NAME native.unhandled-rejection COMMAND ts-stg native/tests/unhandled-rejection.js
    --root ${CMAKE_CURRENT_SOURCE_DIR} --headless --frames 1)
  set_tests_properties(native.unhandled-rejection PROPERTIES WILL_FAIL TRUE)
  add_script_test(NAME native.unbalanced-blend COMMAND ts-stg native/tests/unbalanced-blend.js
    --root ${CMAKE_CURRENT_SOURCE_DIR} --headless --frames 1)
  set_tests_properties(native.unbalanced-blend PROPERTIES WILL_FAIL TRUE)
  add_script_test(NAME native.media COMMAND ts-stg native/tests/media.js
    --root ${CMAKE_CURRENT_SOURCE_DIR} --headless --frames 4
    --snapshot ${CMAKE_CURRENT_BINARY_DIR}/native-media.json)
  add_script_test(NAME native.audio-pause COMMAND ts-stg native/tests/audio-pause.js
    --root ${CMAKE_CURRENT_SOURCE_DIR} --headless --frames 15
    --snapshot ${CMAKE_CURRENT_BINARY_DIR}/native-audio-pause.json)
  add_script_test(NAME native.audio-volume COMMAND ts-stg native/tests/audio-volume.js
    --root ${CMAKE_CURRENT_SOURCE_DIR} --headless --frames 6
    --snapshot ${CMAKE_CURRENT_BINARY_DIR}/native-audio-volume.json)
  if(WIN32)
    add_script_test(NAME native.system-vector-text COMMAND ts-stg native/tests/system-text.js
      --root ${CMAKE_CURRENT_SOURCE_DIR} --headless --frames 2
      --snapshot ${CMAKE_CURRENT_BINARY_DIR}/native-system-vector-text.json)
    add_script_test(NAME native.system-bitmap-text COMMAND ts-stg native/tests/bitmap-text.js
      --root ${CMAKE_CURRENT_SOURCE_DIR} --headless --frames 2
      --snapshot ${CMAKE_CURRENT_BINARY_DIR}/native-system-bitmap-text.json)
  endif()
  add_script_test(NAME native.pixels-and-lifetimes COMMAND ts-stg native/tests/pixels.js
    --root ${CMAKE_CURRENT_SOURCE_DIR} --headless --frames 2
    --snapshot ${CMAKE_CURRENT_BINARY_DIR}/native-pixels.json)
  add_script_test(NAME native.texture-region COMMAND ts-stg native/tests/texture-region.js
    --root ${CMAKE_CURRENT_SOURCE_DIR} --headless --frames 2
    --snapshot ${CMAKE_CURRENT_BINARY_DIR}/native-texture-region.json)
  add_test(NAME native.external-project COMMAND ${CMAKE_COMMAND}
    -DHOST_EXECUTABLE=$<TARGET_FILE:ts-stg> -DSOURCE_ROOT=${CMAKE_CURRENT_SOURCE_DIR}
    -DBINARY_ROOT=${CMAKE_CURRENT_BINARY_DIR} -P ${CMAKE_CURRENT_SOURCE_DIR}/native/tests/external-project-test.cmake)
  foreach(boundary old-subpath alias-escape project-escape library-escape)
    add_test(NAME native.external-reject-${boundary} COMMAND ${CMAKE_COMMAND}
      -DHOST_EXECUTABLE=$<TARGET_FILE:ts-stg> -DSOURCE_ROOT=${CMAKE_CURRENT_SOURCE_DIR}
      -DBINARY_ROOT=${CMAKE_CURRENT_BINARY_DIR} -DTEST_CASE=${boundary}
      -P ${CMAKE_CURRENT_SOURCE_DIR}/native/tests/external-project-test.cmake)
  endforeach()
  add_script_test(NAME native.thlib-replay COMMAND ts-stg tests/fixtures/replay-native.js
    --root ${CMAKE_CURRENT_SOURCE_DIR} --headless --frames 1800)
  add_script_test(NAME native.mesh-target COMMAND ts-stg native/tests/mesh-target.js
    --root ${CMAKE_CURRENT_SOURCE_DIR} --headless --frames 4)
  add_script_test(NAME native.mesh3d COMMAND ts-stg native/tests/mesh3d.js
    --root ${CMAKE_CURRENT_SOURCE_DIR} --headless --frames 2)
  add_script_test(NAME native.alpha-test COMMAND ts-stg native/tests/alpha-test.js
    --root ${CMAKE_CURRENT_SOURCE_DIR} --headless --frames 2)
  add_script_test(NAME native.quad COMMAND ts-stg native/tests/quad.js
    --root ${CMAKE_CURRENT_SOURCE_DIR} --headless --frames 2)
  add_script_test(NAME native.stateful-quad COMMAND ts-stg native/tests/stateful-quad.js
    --root ${CMAKE_CURRENT_SOURCE_DIR} --headless --frames 2 --input 1)
  foreach(quad_invalid invalid-state invalid-cutoff invalid-sampler nested feedback)
    add_script_test(NAME native.reject-stateful-quad-${quad_invalid} COMMAND ts-stg native/tests/stateful-quad-${quad_invalid}.js
      --root ${CMAKE_CURRENT_SOURCE_DIR} --headless --frames 1)
    set_tests_properties(native.reject-stateful-quad-${quad_invalid} PROPERTIES WILL_FAIL TRUE)
  endforeach()
  add_script_test(NAME native.reject-quad-boolean COMMAND ts-stg native/tests/quad-invalid.js
    --root ${CMAKE_CURRENT_SOURCE_DIR} --headless --frames 1)
  set_tests_properties(native.reject-quad-boolean PROPERTIES WILL_FAIL TRUE)
  add_script_test(NAME native.reject-quad-feedback COMMAND ts-stg native/tests/quad-feedback.js
    --root ${CMAKE_CURRENT_SOURCE_DIR} --headless --frames 1)
  set_tests_properties(native.reject-quad-feedback PROPERTIES WILL_FAIL TRUE)
  add_script_test(NAME native.reject-alpha-threshold COMMAND ts-stg native/tests/alpha-test-invalid.js
    --root ${CMAKE_CURRENT_SOURCE_DIR} --headless --frames 1)
  set_tests_properties(native.reject-alpha-threshold PROPERTIES WILL_FAIL TRUE)
  add_script_test(NAME native.profile COMMAND ts-stg native/tests/smoke.js
    --root ${CMAKE_CURRENT_SOURCE_DIR} --headless --frames 4 --input 16 --profile-warmup 1
    --profile ${CMAKE_CURRENT_BINARY_DIR}/native-profile.json)
  add_script_test(NAME native.reject-mesh3d-matrix COMMAND ts-stg native/tests/bad-mesh3d.js
    --root ${CMAKE_CURRENT_SOURCE_DIR} --headless --frames 1)
  set_tests_properties(native.reject-mesh3d-matrix PROPERTIES WILL_FAIL TRUE)
  add_script_test(NAME native.reject-mesh-index COMMAND ts-stg native/tests/mesh-invalid.js
    --root ${CMAKE_CURRENT_SOURCE_DIR} --headless --frames 1)
  set_tests_properties(native.reject-mesh-index PROPERTIES WILL_FAIL TRUE)
  add_script_test(NAME native.reject-target-feedback COMMAND ts-stg native/tests/target-feedback.js
    --root ${CMAKE_CURRENT_SOURCE_DIR} --headless --frames 1)
  set_tests_properties(native.reject-target-feedback PROPERTIES WILL_FAIL TRUE)
  add_script_test(NAME native.shader COMMAND ts-stg native/tests/shader.js
    --root ${CMAKE_CURRENT_SOURCE_DIR} --headless --frames 2)
  foreach(shader_invalid RANGE 0 9)
    add_script_test(NAME native.reject-shader-${shader_invalid} COMMAND ts-stg native/tests/shader-invalid.js
      --root ${CMAKE_CURRENT_SOURCE_DIR} --headless --frames 1 --input ${shader_invalid})
    set_tests_properties(native.reject-shader-${shader_invalid} PROPERTIES WILL_FAIL TRUE)
  endforeach()
  add_script_test(NAME native.backend-esm-contract COMMAND ts-stg native/tests/backend.js
    --root ${CMAKE_CURRENT_SOURCE_DIR} --headless --frames 8 --input 16)
  foreach(backend_failure unresolved-await missing-render)
    add_script_test(NAME native.reject-backend-${backend_failure} COMMAND ts-stg native/tests/backend-${backend_failure}.js
      --root ${CMAKE_CURRENT_SOURCE_DIR} --headless --frames 1)
    set_tests_properties(native.reject-backend-${backend_failure} PROPERTIES WILL_FAIL TRUE)
  endforeach()
  if(TSSTG_ENABLE_V8)
    get_property(TSSTG_SCRIPT_TEST_NAMES GLOBAL PROPERTY TSSTG_SCRIPT_TESTS)
    foreach(script_test IN LISTS TSSTG_SCRIPT_TEST_NAMES)
      get_test_property("${script_test}" WILL_FAIL script_will_fail)
      if(script_will_fail)
        set_tests_properties("${script_test}.v8" PROPERTIES WILL_FAIL TRUE)
      endif()
    endforeach()
    add_test(NAME native.v8-backend-contract COMMAND ts-stg native/tests/backend-v8.js
      --root ${CMAKE_CURRENT_SOURCE_DIR} --headless --frames 1 --backend v8)
  endif()
endif()
