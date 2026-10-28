#include "tsstg/display.hpp"
#include <cmath>
#include <iostream>
#include <stdexcept>
#include <string>

namespace {
void check(bool value, const char* message) { if (!value) throw std::runtime_error(message); }
bool equal(float a, float b) { return std::fabs(a-b) < .001f; }
}
int main() {
    try {
        tsstg::DisplayOptions display;
        display.mode = tsstg::WindowMode::BorderlessFullscreen;
        tsstg::setDisplaySize(display,"1280x960");
        check(display.width == 1280 && display.height == 960,"Window size parsing failed");
        check(display.mode == tsstg::WindowMode::BorderlessFullscreen,"Size must not reset the display mode");
        for (const std::string size : {"", "960", "960X720", "960x", "x720", "-960x720", "960x-720", "960x720x2", "+960x720", "960 x720", "0x720", "479x720", "960x359", "16385x720", "960x99999999999999999999"}) {
            bool rejected = false;
            try { tsstg::setDisplaySize(display,size); } catch (const std::runtime_error&) { rejected = true; }
            check(rejected,"Invalid window size was accepted");
            check(display.width == 1280 && display.height == 960,"Rejected size partially mutated the options");
        }
        const auto wide = tsstg::fitDisplayViewport(1920,1080);
        check(equal(wide.x,240) && equal(wide.y,0) && equal(wide.width,1440) && equal(wide.height,1080),"Widescreen must retain the complete 4:3 canvas");
        const auto tall = tsstg::fitDisplayViewport(720,1280);
        check(equal(tall.x,0) && equal(tall.y,370) && equal(tall.width,720) && equal(tall.height,540),"Portrait display must letterbox vertically");
        const auto small = tsstg::fitDisplayViewport(640,480);
        check(equal(small.x,0) && equal(small.y,0) && equal(small.width,640) && equal(small.height,480),"Original-style small window must scale the same canvas");
        const auto zero = tsstg::fitDisplayViewport(0,0);
        check(zero.width == 0 && zero.height == 0,"Empty surfaces must not produce invalid geometry");
        struct CanvasCase { int inputWidth, inputHeight, width, height; };
        for (const auto& test : {CanvasCase{960,720,960,720}, {640,480,960,720},
             {1920,1080,1440,1080}, {1920,1440,1920,1440}, {3840,2160,2880,2160},
             {1440,2560,1440,1080}, {2133,1600,2132,1599}, {7680,5760,3840,2880},
             {0,0,960,720}, {-1,720,960,720}}) {
            const auto size = tsstg::displayCanvasSize(test.inputWidth,test.inputHeight);
            check(size.width==test.width && size.height==test.height,"Physical canvas density or cap is incorrect");
            check(size.width*3==size.height*4,"Physical canvas must remain exactly 4:3");
        }
        std::cout << "Display size validation and aspect-preserving presentation passed\n";
        return 0;
    } catch (const std::exception& error) {
        std::cerr << error.what() << '\n';
        return 1;
    }
}
