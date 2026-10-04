#include "tsstg/backend.hpp"
#include "tsstg/geometry.hpp"
#include "quickjs.h"
#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstring>
#include <set>
#include <stdexcept>
#include <utility>

namespace tsstg {
namespace {
class Value {
public:
    Value(JSContext* context, JSValue value) : context_(context), value_(value) {}
    ~Value() { JS_FreeValue(context_, value_); }
    Value(const Value&) = delete;
    Value& operator=(const Value&) = delete;
    Value(Value&& other) noexcept : context_(other.context_), value_(other.value_) { other.value_ = JS_UNDEFINED; }
    JSValue get() const { return value_; }
private:
    JSContext* context_;
    JSValue value_;
};

class QuickJSBackend final : public ScriptBackend {
public:
    explicit QuickJSBackend(HostServices& services) : services_(services) {
        runtime_ = JS_NewRuntime();
        if (!runtime_) throw std::runtime_error("Cannot allocate QuickJS runtime");
        JS_SetMemoryLimit(runtime_, 256 * 1024 * 1024);
        JS_SetMaxStackSize(runtime_, 1024 * 1024);
        context_ = JS_NewContext(runtime_);
        if (!context_) { JS_FreeRuntime(runtime_); throw std::runtime_error("Cannot allocate QuickJS context"); }
        JS_SetContextOpaque(context_, this);
        JS_SetModuleLoaderFunc(runtime_, normalizeModule, loadModule, this);
        JS_SetInterruptHandler(runtime_, interrupt, this);
        JS_SetHostPromiseRejectionTracker(runtime_, trackRejection, this);
        try { installApi(); } catch (...) { JS_FreeContext(context_); JS_FreeRuntime(runtime_); throw; }
    }
    ~QuickJSBackend() override {
        for (auto& pending : rejections_) { JS_FreeValue(context_, pending.first); JS_FreeValue(context_, pending.second); }
        JS_FreeValue(context_, game_);
        JS_FreeContext(context_);
        JS_FreeRuntime(runtime_);
    }
    const char* name() const override { return "QuickJS-NG 0.10.1"; }
    void load(const std::filesystem::path& entry) override {
        beginCall();
        const auto source = services_.readModule(entry);
        const auto filename = entry.generic_u8string();
        Value result(context_, JS_Eval(context_, source.data(), source.size(), filename.c_str(), JS_EVAL_TYPE_MODULE));
        check(result.get());
        drainJobs();
        if (JS_PromiseState(context_, result.get()) == JS_PROMISE_REJECTED) {
            Value reason(context_, JS_PromiseResult(context_, result.get()));
            throw std::runtime_error(describe(reason.get()));
        }
        if (JS_PromiseState(context_, result.get()) == JS_PROMISE_PENDING)
            throw std::runtime_error("Entry module has an unresolved top-level await");
        Value global(context_, JS_GetGlobalObject(context_));
        game_ = JS_GetPropertyStr(context_, global.get(), "__tsstg_game");
        check(game_);
        if (!JS_IsObject(game_)) throw std::runtime_error("Entry must set globalThis.__tsstg_game");
        for (const char* method : {"update", "render"}) {
            Value fn(context_, JS_GetPropertyStr(context_, game_, method));
            check(fn.get());
            if (!JS_IsFunction(context_, fn.get())) throw std::runtime_error(std::string("Game requires function: ") + method);
        }
    }
    void update(std::uint32_t inputMask) override {
        JSValue input = JS_NewUint32(context_, inputMask);
        Value result(context_, call("update", 1, &input));
    }
    std::vector<DrawCommand> render() override {
        const auto renderStart=std::chrono::steady_clock::now();
        Value list(context_, call("render"));
        const auto decodeStart=std::chrono::steady_clock::now();
        if (!JS_IsArray(list.get())) throw std::runtime_error("render() must return an array of command arrays");
        const auto count = length(list.get());
        if (count > 200000) throw std::runtime_error("render() exceeds 200000 command limit");
        std::vector<DrawCommand> commands;
        commands.reserve(count);
        bool scissor = false, blend = false, shader = false;
        double alphaCutoff = 0;
        std::uint32_t activeTarget = 0;
        for (std::uint32_t index = 0; index < count; ++index) {
            try {
                Value item(context_, JS_GetPropertyUint32(context_, list.get(), index));
                check(item.get());
                if (!JS_IsArray(item.get())) throw std::runtime_error("Command is not an array");
                auto property = [&](std::uint32_t n) { return Value(context_, JS_GetPropertyUint32(context_, item.get(), n)); };
                Value kindValue = property(0);
                const auto kind = string(kindValue.get());
                DrawCommand command{};
                unsigned size = 0, numbers = 0, offset = 1, colorIndex = 0;
                if (kind == "clear") { command.kind = DrawKind::Clear; size = 2; colorIndex = 1; }
                else if (kind == "circle") { command.kind = DrawKind::Circle; size = 5; numbers = 3; colorIndex = 4; }
                else if (kind == "ring") { command.kind = DrawKind::Ring; size = 6; numbers = 4; colorIndex = 5; }
                else if (kind == "line") { command.kind = DrawKind::Line; size = 7; numbers = 5; colorIndex = 6; }
                else if (kind == "point") { command.kind = DrawKind::Point; size = 4; numbers = 2; colorIndex = 3; }
                else if (kind == "alphaTest") { command.kind=DrawKind::AlphaTest;size=2;numbers=1; }
                else if(kind=="shaderBegin") {
                    if(shader)throw std::runtime_error("Shader scopes cannot be nested");
                    if(alphaCutoff!=0)throw std::runtime_error("Custom shaders require alpha testing to be disabled");
                    command.kind=DrawKind::ShaderBegin;size=3;Value id=property(1);command.resource=unsignedNumber(id.get());services_.validateShader(command.resource);
                    Value uniforms=property(2);
                    if(!JS_IsArray(uniforms.get())||length(uniforms.get())>128)throw std::runtime_error("Shader uniforms require an array of at most 128 entries");
                    std::set<std::string> names;
                    for(std::uint32_t i=0;i<length(uniforms.get());++i){
                        Value row(context_,JS_GetPropertyUint32(context_,uniforms.get(),i));
                        if(!JS_IsArray(row.get())||length(row.get())!=3)throw std::runtime_error("Shader uniform must contain name,type,values");
                        Value name(context_,JS_GetPropertyUint32(context_,row.get(),0)),type(context_,JS_GetPropertyUint32(context_,row.get(),1)),values(context_,JS_GetPropertyUint32(context_,row.get(),2));
                        ShaderUniform uniform{};uniform.name=string(name.get());const auto uniformType=string(type.get());
                        if(uniform.name.empty()||uniform.name.size()>128||uniform.name.find_first_not_of("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_")!=std::string::npos||!names.insert(uniform.name).second)throw std::runtime_error("Invalid or duplicate shader uniform name");
                        static const std::array<std::string,9> types{"float","vec2","vec3","vec4","int","ivec2","ivec3","ivec4","mat4"};
                        const auto found=std::find(types.begin(),types.end(),uniformType);if(found==types.end())throw std::runtime_error("Unknown shader uniform type");
                        uniform.type=static_cast<int>(found-types.begin());const unsigned componentCount=uniform.type==8?16:uniform.type%4+1;
                        if(!JS_IsArray(values.get())||length(values.get())!=componentCount)throw std::runtime_error("Wrong shader uniform component count");
                        for(unsigned n=0;n<componentCount;++n){Value value(context_,JS_GetPropertyUint32(context_,values.get(),n));const double v=number(value.get());
                            if(std::abs(v)>10000000||(uniform.type>=4&&uniform.type<=7&&std::floor(v)!=v))throw std::runtime_error("Invalid shader uniform component");uniform.values[n]=static_cast<float>(v);}
                        command.uniforms.push_back(std::move(uniform));
                    }
                    shader=true;
                }
                else if(kind=="shaderEnd") {if(!shader)throw std::runtime_error("No shader scope to end");command.kind=DrawKind::ShaderEnd;size=1;shader=false;}
                else if (kind == "lineStrip") {
                    command.kind=DrawKind::LineStrip;size=2;Value vertices=property(1);
                    if(!JS_IsArray(vertices.get())||length(vertices.get())>65536) throw std::runtime_error("Line strip requires at most 65536 vertices");
                    for(std::uint32_t i=0;i<length(vertices.get());++i) {
                        Value row(context_,JS_GetPropertyUint32(context_,vertices.get(),i));
                        if(!JS_IsArray(row.get())||length(row.get())!=3) throw std::runtime_error("Line strip vertex must contain x,y,color");
                        Value x(context_,JS_GetPropertyUint32(context_,row.get(),0)), y(context_,JS_GetPropertyUint32(context_,row.get(),1)), color(context_,JS_GetPropertyUint32(context_,row.get(),2));
                        const auto px=number(x.get()),py=number(y.get());
                        if(std::abs(px)>10000000||std::abs(py)>10000000) throw std::runtime_error("Line coordinate exceeds supported range");
                        command.vertices.push_back({static_cast<float>(px),static_cast<float>(py),0,0,unsignedNumber(color.get())});
                    }
                }
                else if (kind == "rect") { command.kind = DrawKind::Rect; size = 6; numbers = 4; colorIndex = 5; }
                else if (kind == "text") { command.kind = DrawKind::Text; size = 6; numbers = 3; offset = 2; colorIndex = 5;
                    Value text = property(1); command.text = string(text.get());
                    if (command.text.size() > 16384) throw std::runtime_error("Text command exceeds 16384 bytes");
                    if (length(item.get()) == 7) { size = 7; Value font = property(6); command.resource = unsignedNumber(font.get()); services_.validateFont(command.resource); }
                }
                else if (kind == "triangle") { command.kind = DrawKind::Triangle; size = 8; numbers = 6; colorIndex = 7; }
                else if (kind == "scissor") { command.kind = DrawKind::Scissor; size = 5; numbers = 4;
                    if (scissor) throw std::runtime_error("Nested scissors are unsupported"); scissor = true; }
                else if (kind == "scissorEnd") { command.kind = DrawKind::ScissorEnd; size = 1;
                    if (!scissor) throw std::runtime_error("scissorEnd has no matching scissor"); scissor = false; }
                else if (kind == "sprite") { command.kind = DrawKind::Sprite; size = 8; numbers = 5; offset = 2; colorIndex = 7;
                    Value id = property(1); command.resource = unsignedNumber(id.get()); services_.validateTexture(command.resource);
                }
                else if (kind == "spriteRegion") { command.kind = DrawKind::SpriteRegion; size = 12; numbers = 9; offset = 2; colorIndex = 11;
                    Value id = property(1); command.resource = unsignedNumber(id.get()); services_.validateTexture(command.resource);
                }
                else if (kind == "blend") { command.kind = DrawKind::Blend; size = 2;
                    if (blend) throw std::runtime_error("Nested blend modes are unsupported"); blend = true;
                    Value mode = property(1); command.text = string(mode.get());
                    if (command.text != "alpha" && command.text != "add" && command.text != "multiply") throw std::runtime_error("Unknown blend mode");
                }
                else if (kind == "blendEnd") { command.kind = DrawKind::BlendEnd; size = 1;
                    if (!blend) throw std::runtime_error("blendEnd has no matching blend"); blend = false;
                }
                else if (kind == "blendFactors") {
                    command.kind=DrawKind::BlendFactors; size=7;
                    if (blend) throw std::runtime_error("Nested blend modes are unsupported"); blend=true;
                    static const std::set<std::string> factors{"zero","one","srcColor","oneMinusSrcColor","srcAlpha","oneMinusSrcAlpha","dstAlpha","oneMinusDstAlpha","dstColor","oneMinusDstColor"};
                    static const std::set<std::string> equations{"add","subtract","reverseSubtract","min","max"};
                    for (unsigned i=0;i<6;++i) { Value mode=property(i+1); command.modes[i]=string(mode.get());
                        if (!(i==2||i==5?equations:factors).count(command.modes[i])) throw std::runtime_error("Invalid blend factor/equation"); }
                }
                else if (kind == "targetBegin") {
                    command.kind=DrawKind::TargetBegin; size=length(item.get())==2?2:3;
                    if (activeTarget || scissor || blend) throw std::runtime_error("Targets cannot nest or cross scissor/blend boundaries");
                    Value id=property(1); command.resource=unsignedNumber(id.get()); services_.validateRenderTarget(command.resource);
                    activeTarget=command.resource; command.color=0;
                    if (size==3) colorIndex=2;
                }
                else if (kind == "targetEnd") {
                    command.kind=DrawKind::TargetEnd; size=1;
                    if (!activeTarget || scissor || blend) throw std::runtime_error("targetEnd requires an active target and closed scissor/blend");
                    activeTarget=0;
                }
                else if (kind == "sampler") {
                    command.kind=DrawKind::Sampler; size=5;
                    Value id=property(1); command.resource=unsignedNumber(id.get()); services_.validateTexture(command.resource);
                    for (unsigned i=0;i<3;++i) { Value mode=property(i+2); command.modes[i]=string(mode.get()); }
                    if (command.modes[0]!="point" && command.modes[0]!="bilinear" && command.modes[0]!="anisotropic4x") throw std::runtime_error("Unknown sampler filter");
                    for (unsigned i=1;i<3;++i) if(command.modes[i]!="clamp"&&command.modes[i]!="wrap"&&command.modes[i]!="mirror") throw std::runtime_error("Unknown sampler address mode");
                }
                else if (kind == "quad" || kind == "statefulQuad") {
                    const bool scoped=kind=="statefulQuad";
                    command.kind=scoped?DrawKind::StatefulQuad:DrawKind::Quad;size=scoped?18:17;
                    Value id=property(1);command.resource=unsignedNumber(id.get());if(command.resource)services_.validateTexture(command.resource);
                    Value local=property(2);
                    if(!JS_IsArray(local.get())||length(local.get())!=8)throw std::runtime_error("Quad local corners must contain eight numbers");
                    auto binary32=[&](JSValueConst value){const double n=number(value);
                        if(std::abs(n)>10000000)throw std::runtime_error("Quad coordinate exceeds supported range");return static_cast<float>(n);};
                    QuadGeometry quad;
                    for(unsigned i=0;i<8;++i){Value value(context_,JS_GetPropertyUint32(context_,local.get(),i));quad.local[i]=binary32(value.get());}
                    float transform[5]{};
                    for(unsigned i=0;i<5;++i){Value value=property(i+3);transform[i]=binary32(value.get());}
                    quad.x=transform[0];quad.y=transform[1];quad.scale=transform[2];quad.offsetX=transform[3];quad.offsetY=transform[4];
                    for(unsigned i=0;i<4;++i){Value uv=property(i+8),color=property(i+12);quad.uv[i]=binary32(uv.get());quad.colors[i]=unsignedNumber(color.get());}
                    Value snap=property(16);if(!JS_IsBool(snap.get()))throw std::runtime_error("Quad pixelSnap must be a boolean");quad.pixelSnap=JS_ToBool(context_,snap.get())!=0;
                    const auto vertices=expandQuad(quad);
                    for(const auto& vertex:vertices)if(!std::isfinite(vertex.x)||!std::isfinite(vertex.y)||std::abs(vertex.x)>10000000||std::abs(vertex.y)>10000000)throw std::runtime_error("Quad result exceeds supported mesh coordinate range");
                    for(unsigned i=0;i<4;++i){command.values[i*2]=vertices[i].x;command.values[i*2+1]=vertices[i].y;command.quadColors[i]=vertices[i].color;}
                    for(unsigned i=0;i<4;++i)command.matrix[i]=quad.uv[i];
                    if(scoped){
                        if(blend)throw std::runtime_error("Nested blend modes are unsupported");
                        Value state=property(17);
                        if(!JS_IsArray(state.get())||length(state.get())!=10)throw std::runtime_error("Stateful quad state must contain cutoff, six blend factors/equations and three sampler modes");
                        auto stateProperty=[&](std::uint32_t n){return Value(context_,JS_GetPropertyUint32(context_,state.get(),n));};
                        Value cutoff=stateProperty(0);const auto threshold=number(cutoff.get());
                        if(threshold<0||threshold>1)throw std::runtime_error("Invalid alpha cutoff for stateful quad");
                        command.matrix[13]=static_cast<float>(threshold);
                        static const std::set<std::string> factors{"zero","one","srcColor","oneMinusSrcColor","srcAlpha","oneMinusSrcAlpha","dstAlpha","oneMinusDstAlpha","dstColor","oneMinusDstColor"};
                        static const std::set<std::string> equations{"add","subtract","reverseSubtract","min","max"};
                        for(unsigned i=0;i<6;++i){Value mode=stateProperty(i+1);command.modes[i]=string(mode.get());
                            if(!(i==2||i==5?equations:factors).count(command.modes[i]))throw std::runtime_error("Invalid blend factor/equation");}
                        Value filter=stateProperty(7),wrapU=stateProperty(8),wrapV=stateProperty(9);
                        const auto filtering=string(filter.get());
                        if(filtering!="point"&&filtering!="bilinear"&&filtering!="anisotropic4x")throw std::runtime_error("Unknown sampler filter");
                        command.matrix[10]=filtering=="point"?0.f:filtering=="bilinear"?1.f:2.f;
                        for(unsigned i=0;i<2;++i){const auto addressing=string(i?wrapV.get():wrapU.get());
                            if(addressing!="clamp"&&addressing!="wrap"&&addressing!="mirror")throw std::runtime_error("Unknown sampler address mode");
                            command.matrix[11+i]=addressing=="clamp"?0.f:addressing=="wrap"?1.f:2.f;}
                    }
                }
                else if (kind == "mesh" || kind == "mesh3d") {
                    const bool projected=kind=="mesh3d";
                    command.kind=projected?DrawKind::Mesh3D:DrawKind::Mesh; size=projected?5:4;
                    Value id=property(1); command.resource=unsignedNumber(id.get()); if(command.resource) services_.validateTexture(command.resource);
                    Value vertices=property(2), indices=property(3);
                    if (!JS_IsArray(vertices.get())||!JS_IsArray(indices.get())) throw std::runtime_error("Mesh vertices and indices must be arrays");
                    const auto vertexCount=length(vertices.get()), indexCount=length(indices.get());
                    if(vertexCount>65536||indexCount>393216||indexCount%3) throw std::runtime_error("Invalid mesh size or triangle index count");
                    command.vertices.reserve(vertexCount); command.indices.reserve(indexCount);
                    for(std::uint32_t i=0;i<vertexCount;++i) {
                        Value row(context_,JS_GetPropertyUint32(context_,vertices.get(),i));
                        const unsigned coordinates=projected?5:4;
                        if(!JS_IsArray(row.get())||length(row.get())!=coordinates+1) throw std::runtime_error(projected?"Projected mesh vertex must contain x,y,z,u,v,color":"Mesh vertex must contain x,y,u,v,color");
                        float values[5]{};
                        for(unsigned j=0;j<coordinates;++j){Value value(context_,JS_GetPropertyUint32(context_,row.get(),j)); const double v=number(value.get());
                            if(std::abs(v)>10000000) throw std::runtime_error("Mesh coordinate exceeds supported range"); values[j]=static_cast<float>(v);}
                        Value color(context_,JS_GetPropertyUint32(context_,row.get(),coordinates));
                        command.vertices.push_back({values[0],values[1],values[projected?3:2],values[projected?4:3],unsignedNumber(color.get()),projected?values[2]:0});
                    }
                    for(std::uint32_t i=0;i<indexCount;++i){Value value(context_,JS_GetPropertyUint32(context_,indices.get(),i)); const auto n=unsignedNumber(value.get());
                        if(n>=vertexCount) throw std::runtime_error("Mesh index outside vertex array"); command.indices.push_back(n);}
                    if(projected){Value matrix=property(4);if(!JS_IsArray(matrix.get())||length(matrix.get())!=16)throw std::runtime_error("Projected mesh MVP must contain 16 column-major numbers");
                        for(unsigned i=0;i<16;++i){Value value(context_,JS_GetPropertyUint32(context_,matrix.get(),i));const double n=number(value.get());
                            if(std::abs(n)>10000000)throw std::runtime_error("Mesh matrix exceeds supported range");command.matrix[i]=static_cast<float>(n);}}
                }
                else throw std::runtime_error("Unknown drawing command: " + kind);
                if(activeTarget && command.resource==activeTarget && (command.kind==DrawKind::Mesh||command.kind==DrawKind::Mesh3D||command.kind==DrawKind::Quad||command.kind==DrawKind::StatefulQuad||command.kind==DrawKind::Sprite||command.kind==DrawKind::SpriteRegion))
                    throw std::runtime_error("Cannot sample the active render target");
                if (length(item.get()) != size) throw std::runtime_error("Wrong argument count for " + kind);
                for (unsigned n = 0; n < numbers; ++n) {
                    Value value = property(n + offset);
                    const auto numberValue = number(value.get());
                    if (std::abs(numberValue) > 10000000) throw std::runtime_error("Drawing coordinate exceeds supported range");
                    command.values[n] = static_cast<float>(numberValue);
                }
                if (colorIndex) { Value color = property(colorIndex); command.color = unsignedNumber(color.get()); }
                const auto& v = command.values;
                if(command.kind==DrawKind::AlphaTest){if(shader&&v[0]!=0)throw std::runtime_error("Custom shaders cannot enable implicit alpha testing");alphaCutoff=v[0];}
                if(shader&&command.kind==DrawKind::StatefulQuad&&command.matrix[13]!=0)throw std::runtime_error("Custom shaders cannot enable scoped alpha testing");
                if(command.kind==DrawKind::StatefulQuad)alphaCutoff=0;
                if ((command.kind == DrawKind::AlphaTest && (v[0]<0||v[0]>1)) ||
                    (command.kind == DrawKind::Circle && v[2] < 0) ||
                    (command.kind == DrawKind::Ring && (v[2] < 0 || v[3] < v[2])) ||
                    (command.kind == DrawKind::Line && v[4] < 0) ||
                    (command.kind == DrawKind::Text && (v[2] <= 0 || v[2] > 4096)) ||
                    ((command.kind == DrawKind::Rect || command.kind == DrawKind::Scissor || command.kind == DrawKind::Sprite) && (v[2] < 0 || v[3] < 0)) ||
                    (command.kind == DrawKind::SpriteRegion && (v[2] < 0 || v[3] < 0 || v[6] < 0 || v[7] < 0)))
                    throw std::runtime_error("Invalid drawing dimensions for " + kind);
                commands.push_back(std::move(command));
            } catch (const std::exception& error) {
                throw std::runtime_error("render command " + std::to_string(index) + ": " + error.what());
            }
        }
        if (scissor) throw std::runtime_error("render() leaves scissor unclosed");
        if (blend) throw std::runtime_error("render() leaves blend mode unclosed");
        if (activeTarget) throw std::runtime_error("render() leaves render target unclosed");
        if (shader) throw std::runtime_error("render() leaves shader unclosed");
        timings_={std::chrono::duration<double,std::milli>(decodeStart-renderStart).count(),std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-decodeStart).count()};
        return commands;
    }
    std::array<double,2> renderTimings() const override { return timings_; }
    std::string snapshot() override {
        Value method(context_, JS_GetPropertyStr(context_, game_, "snapshot"));
        check(method.get());
        if (JS_IsUndefined(method.get())) return "null";
        Value result(context_, call("snapshot"));
        Value json(context_, JS_JSONStringify(context_, result.get(), JS_UNDEFINED, JS_UNDEFINED));
        check(json.get());
        if (JS_IsUndefined(json.get())) throw std::runtime_error("snapshot() must return JSON-serializable data");
        return string(json.get());
    }
private:
    enum Operation { Quit, Log, ReadText, WriteText, LoadTexture, LoadSound, LoadMusic, PlaySound, StopSound, PlayMusic, StopMusic, SetMusicLoop, SeekMusic, GetMusicTime, LoadFont, CreateRenderTarget, CreateTexture, UpdateTexture, ReadTexturePixels, UnloadTexture, UnloadSound, UnloadMusic, UnloadFont, PauseSound, ResumeSound, IsSoundPlaying, PauseMusic, ResumeMusic, CreateShader, UnloadShader, CreateTextLayout, RasterizeTextLayout, DestroyTextLayout, HasSystemFont, EncodeText, RasterizeBitmapText, UpdateTextureRegion, SetMusicVolume };
    HostServices& services_;
    JSRuntime* runtime_ = nullptr;
    JSContext* context_ = nullptr;
    JSValue game_ = JS_UNDEFINED;
    std::chrono::steady_clock::time_point deadline_{};
    std::vector<std::pair<JSValue, JSValue>> rejections_;
    std::array<double,2> timings_{};

    void beginCall() { deadline_ = std::chrono::steady_clock::now() + std::chrono::seconds(5); }
    static int interrupt(JSRuntime*, void* opaque) {
        const auto& self = *static_cast<QuickJSBackend*>(opaque);
        return std::chrono::steady_clock::now() > self.deadline_;
    }
    static void trackRejection(JSContext* context, JSValueConst promise, JSValueConst reason, bool handled, void* opaque) {
        auto& self = *static_cast<QuickJSBackend*>(opaque);
        if (handled) {
            for (auto it = self.rejections_.begin(); it != self.rejections_.end(); ++it) {
                if (JS_VALUE_GET_PTR(it->first) == JS_VALUE_GET_PTR(promise)) {
                    JS_FreeValue(context, it->first); JS_FreeValue(context, it->second);
                    self.rejections_.erase(it); break;
                }
            }
        } else self.rejections_.emplace_back(JS_DupValue(context, promise), JS_DupValue(context, reason));
    }
    std::string describe(JSValueConst error) {
        std::string message = "JavaScript exception";
        if (const char* text = JS_ToCString(context_, error)) { message = text; JS_FreeCString(context_, text); }
        if (!JS_IsObject(error)) return message;
        Value stack(context_, JS_GetPropertyStr(context_, error, "stack"));
        if (!JS_IsException(stack.get()) && !JS_IsUndefined(stack.get())) {
            if (const char* text = JS_ToCString(context_, stack.get())) { message += "\n"; message += text; JS_FreeCString(context_, text); }
        }
        return message;
    }
    [[noreturn]] void throwException() {
        Value error(context_, JS_GetException(context_));
        throw std::runtime_error(describe(error.get()));
    }
    void check(JSValueConst value) { if (JS_IsException(value)) throwException(); }
    std::string string(JSValueConst value) {
        check(value);
        if (!JS_IsString(value)) throw std::runtime_error("Expected a string");
        std::size_t size = 0;
        const char* data = JS_ToCStringLen(context_, &size, value);
        if (!data) throwException();
        std::string result(data, size);
        JS_FreeCString(context_, data);
        return result;
    }
    double number(JSValueConst value) {
        check(value);
        if (!JS_IsNumber(value)) throw std::runtime_error("Expected a number");
        double result = 0;
        if (JS_ToFloat64(context_, &result, value) < 0) throwException();
        if (!std::isfinite(result)) throw std::runtime_error("Expected a finite number");
        return result;
    }
    std::uint32_t unsignedNumber(JSValueConst value) {
        const auto result = number(value);
        if (result < 0 || result > 4294967295.0 || std::floor(result) != result)
            throw std::runtime_error("Expected an unsigned 32-bit integer");
        return static_cast<std::uint32_t>(result);
    }
    std::uint32_t length(JSValueConst value) {
        Value length(context_, JS_GetPropertyStr(context_, value, "length"));
        return unsignedNumber(length.get());
    }
    void drainJobs() {
        unsigned count = 0;
        for (;;) {
            JSContext* context = nullptr;
            const int status = JS_ExecutePendingJob(runtime_, &context);
            if (status < 0) throwException();
            if (!status) break;
            if (++count > 10000) throw std::runtime_error("Exceeded 10000 pending JavaScript jobs in one frame");
        }
        if (!rejections_.empty()) throw std::runtime_error("Unhandled promise rejection: " + describe(rejections_.front().second));
    }
    JSValue call(const char* name, int argc = 0, JSValueConst* argv = nullptr) {
        beginCall();
        Value method(context_, JS_GetPropertyStr(context_, game_, name));
        check(method.get());
        if (!JS_IsFunction(context_, method.get())) throw std::runtime_error(std::string("Game method is not a function: ") + name);
        JSValue result = JS_Call(context_, method.get(), game_, argc, argv);
        check(result);
        try {
            if (JS_IsPromise(result)) throw std::runtime_error(std::string(name) + "() must be synchronous");
            drainJobs();
        } catch (...) { JS_FreeValue(context_, result); throw; }
        return result;
    }
    static char* normalizeModule(JSContext* context, const char* base, const char* name, void* opaque) {
        auto& self = *static_cast<QuickJSBackend*>(opaque);
        try {
            const auto path = self.services_.resolveModule(name, base).generic_u8string();
            return js_strdup(context, path.c_str());
        } catch (const std::exception& error) { JS_ThrowReferenceError(context, "%s", error.what()); return nullptr; }
    }
    static JSModuleDef* loadModule(JSContext* context, const char* name, void* opaque) {
        auto& self = *static_cast<QuickJSBackend*>(opaque);
        try {
            const auto source = self.services_.readModule(std::filesystem::u8path(name));
            Value result(context, JS_Eval(context, source.data(), source.size(), name, JS_EVAL_TYPE_MODULE | JS_EVAL_FLAG_COMPILE_ONLY));
            if (JS_IsException(result.get())) return nullptr;
            auto* module = static_cast<JSModuleDef*>(JS_VALUE_GET_PTR(result.get()));
            Value meta(context, JS_GetImportMeta(context, module));
            JS_SetPropertyStr(context, meta.get(), "url", JS_NewString(context, name));
            return module;
        } catch (const std::exception& error) { JS_ThrowReferenceError(context, "%s", error.what()); return nullptr; }
    }
    static JSValue api(JSContext* context, JSValueConst, int argc, JSValueConst* argv, int magic) {
        auto& self = *static_cast<QuickJSBackend*>(JS_GetContextOpaque(context));
        try {
            auto argument = [&](int index) -> JSValueConst {
                if (index >= argc) throw std::runtime_error("Missing native API argument");
                return argv[index];
            };
            auto volume = [&](bool required = false) {
                const double value = argc > 1 || required ? self.number(argument(1)) : 1.0;
                if (value < 0 || value > 1) throw std::runtime_error("Volume must be between 0 and 1");
                return static_cast<float>(value);
            };
            switch (magic) {
            case Quit: self.services_.requestQuit(); break;
            case Log: self.services_.log(self.string(argument(0))); break;
            case ReadText: {
                const auto text = self.services_.readText(self.string(argument(0)));
                return JS_NewStringLen(context, text.data(), text.size());
            }
            case WriteText: self.services_.writeText(self.string(argument(0)), self.string(argument(1))); break;
            case LoadTexture: {
                std::uint32_t width=0,height=0;
                if(argc>1){width=self.unsignedNumber(argument(1));height=self.unsignedNumber(argument(2));
                    if(width<1||height<1||width>4096||height>4096) throw std::runtime_error("Texture canvas dimensions must be in 1..4096");}
                return JS_NewUint32(context, self.services_.loadTexture(self.string(argument(0)),static_cast<int>(width),static_cast<int>(height)));
            }
            case LoadSound: return JS_NewUint32(context, self.services_.loadSound(self.string(argument(0))));
            case LoadMusic: return JS_NewUint32(context, self.services_.loadMusic(self.string(argument(0))));
            case LoadFont: {
                auto size = argc > 1 ? self.unsignedNumber(argv[1]) : 32;
                if (size < 8 || size > 256) throw std::runtime_error("Font size must be between 8 and 256");
                return JS_NewUint32(context, self.services_.loadFont(self.string(argument(0)), static_cast<int>(size)));
            }
            case HasSystemFont:{
                const auto family=self.string(argument(0));if(family.empty()||family.size()>256||family.find('\0')!=std::string::npos)throw std::runtime_error("Invalid system font family");
                return JS_NewBool(context,self.services_.hasSystemFont(family));
            }
            case EncodeText:{
                const auto text=self.string(argument(0));if(text.size()>16384)throw std::runtime_error("Text encoding exceeds 16384 bytes");
                const auto codePage=self.unsignedNumber(argument(1));const auto bytes=self.services_.encodeText(text,codePage);
                return JS_NewUint8ArrayCopy(context,bytes.data(),bytes.size());
            }
            case CreateTextLayout: case RasterizeTextLayout: case RasterizeBitmapText: {
                const auto options=argc>1?argv[1]:JS_UNDEFINED;
                if(!JS_IsUndefined(options)&&(!JS_IsObject(options)||JS_IsArray(options)))throw std::runtime_error("Text options must be an object");
                auto property=[&](const char* name){return Value(context,JS_IsUndefined(options)?JS_UNDEFINED:JS_GetPropertyStr(context,options,name));};
                auto stringOption=[&](const char* name,const std::string& fallback){Value value=property(name);self.check(value.get());if(JS_IsUndefined(value.get()))return fallback;
                    auto result=self.string(value.get());if(result.empty()||result.size()>256||result.find('\0')!=std::string::npos)throw std::runtime_error(std::string("Invalid text option: ")+name);return result;};
                auto numberOption=[&](const char* name,double fallback,double minimum,double maximum,bool integer=false){Value value=property(name);self.check(value.get());if(JS_IsUndefined(value.get()))return fallback;
                    const auto result=self.number(value.get());if(result<minimum||result>maximum||(integer&&std::floor(result)!=result))throw std::runtime_error(std::string("Invalid text option: ")+name);return result;};
                if(magic==RasterizeBitmapText){
                    const auto text=self.string(argument(0));if(text.size()>16384)throw std::runtime_error("Bitmap text exceeds 16384 bytes");
                    BitmapTextOptions settings;settings.fontFamily=stringOption("fontFamily",settings.fontFamily);
                    settings.width=static_cast<int>(numberOption("width",settings.width,1,4096,true));settings.height=static_cast<int>(numberOption("height",settings.height,1,4096,true));
                    settings.x=static_cast<int>(numberOption("x",settings.x,-10000000,10000000,true));settings.y=static_cast<int>(numberOption("y",settings.y,-10000000,10000000,true));
                    settings.fontSize=static_cast<int>(numberOption("fontSize",settings.fontSize,1,4096,true));settings.fontWeight=static_cast<int>(numberOption("fontWeight",settings.fontWeight,0,1000,true));
                    settings.spacing=static_cast<int>(numberOption("spacing",settings.spacing,-4096,4096,true));
                    settings.charSet=static_cast<std::uint32_t>(numberOption("charSet",settings.charSet,0,255,true));settings.quality=static_cast<std::uint32_t>(numberOption("quality",settings.quality,0,6,true));
                    settings.pitchAndFamily=static_cast<std::uint32_t>(numberOption("pitchAndFamily",settings.pitchAndFamily,0,255,true));settings.codePage=static_cast<std::uint32_t>(numberOption("codePage",settings.codePage,1,65535,true));
                    Value fill=property("fill"),background=property("background");self.check(fill.get());self.check(background.get());
                    if(!JS_IsUndefined(fill.get()))settings.fill=self.unsignedNumber(fill.get());if(!JS_IsUndefined(background.get()))settings.background=self.unsignedNumber(background.get());
                    Value allowFontSubstitution=property("allowFontSubstitution");self.check(allowFontSubstitution.get());
                    if(!JS_IsUndefined(allowFontSubstitution.get())){if(!JS_IsBool(allowFontSubstitution.get()))throw std::runtime_error("Bitmap allowFontSubstitution must be a boolean");settings.allowFontSubstitution=JS_ToBool(context,allowFontSubstitution.get())!=0;}
                    Value initialPixels=property("pixels");self.check(initialPixels.get());
                    if(!JS_IsUndefined(initialPixels.get())){
                        const auto type=JS_GetTypedArrayType(initialPixels.get());if(type!=JS_TYPED_ARRAY_UINT8&&type!=JS_TYPED_ARRAY_UINT8C)throw std::runtime_error("Bitmap pixels must be a Uint8Array or Uint8ClampedArray");
                        std::size_t length=0;const auto* data=JS_GetUint8Array(context,&length,initialPixels.get());if(!data)return JS_EXCEPTION;
                        if(length!=static_cast<std::size_t>(settings.width)*settings.height*4)throw std::runtime_error("Bitmap initial pixels require exactly width*height*4 RGBA bytes");
                        settings.pixels.assign(data,data+length);
                    }
                    const auto raster=self.services_.rasterizeBitmapText(text,settings);Value result(context,JS_NewObject(context));self.check(result.get());
                    JS_SetPropertyStr(context,result.get(),"width",JS_NewInt32(context,raster.width));JS_SetPropertyStr(context,result.get(),"height",JS_NewInt32(context,raster.height));
                    JS_SetPropertyStr(context,result.get(),"extentWidth",JS_NewInt32(context,raster.extentWidth));JS_SetPropertyStr(context,result.get(),"extentHeight",JS_NewInt32(context,raster.extentHeight));
                    Value pixels(context,JS_NewUint8ArrayCopy(context,raster.pixels.data(),raster.pixels.size()));self.check(pixels.get());
                    JS_SetPropertyStr(context,result.get(),"pixels",JS_DupValue(context,pixels.get()));return JS_DupValue(context,result.get());
                }
                if(magic==CreateTextLayout){
                    const auto text=self.string(argument(0));if(text.size()>16384)throw std::runtime_error("Text layout exceeds 16384 bytes");
                    TextLayoutOptions settings;
                    settings.fontFamily=stringOption("fontFamily",settings.fontFamily);settings.locale=stringOption("locale",settings.locale);
                    settings.horizontalAlign=stringOption("horizontalAlign",settings.horizontalAlign);settings.verticalAlign=stringOption("verticalAlign",settings.verticalAlign);
                    if(settings.horizontalAlign!="left"&&settings.horizontalAlign!="center"&&settings.horizontalAlign!="right")throw std::runtime_error("Unknown text horizontal alignment");
                    if(settings.verticalAlign!="top"&&settings.verticalAlign!="center"&&settings.verticalAlign!="bottom")throw std::runtime_error("Unknown text vertical alignment");
                    settings.fontSize=static_cast<float>(numberOption("fontSize",settings.fontSize,1,4096));
                    settings.width=static_cast<float>(numberOption("width",settings.width,0.0001,10000000));settings.height=static_cast<float>(numberOption("height",settings.height,0.0001,10000000));
                    return JS_NewUint32(context,self.services_.createTextLayout(text,settings));
                }
                TextRasterOptions settings;
                settings.width=static_cast<int>(numberOption("width",settings.width,1,4096,true));settings.height=static_cast<int>(numberOption("height",settings.height,1,4096,true));
                settings.x=static_cast<float>(numberOption("x",settings.x,-10000000,10000000));settings.y=static_cast<float>(numberOption("y",settings.y,-10000000,10000000));
                settings.layoutX=static_cast<float>(numberOption("layoutX",settings.layoutX,-10000000,10000000));settings.layoutY=static_cast<float>(numberOption("layoutY",settings.layoutY,-10000000,10000000));
                settings.scale=static_cast<float>(numberOption("scale",settings.scale,-10000,10000));settings.rotation=static_cast<float>(numberOption("rotation",settings.rotation,-10000000,10000000));
                settings.strokeWidth=static_cast<float>(numberOption("strokeWidth",settings.strokeWidth,0,4096));
                Value fill=property("fill"),outline=property("outline"),premultiplied=property("premultiplied");self.check(fill.get());self.check(outline.get());self.check(premultiplied.get());
                if(!JS_IsUndefined(fill.get()))settings.fill=self.unsignedNumber(fill.get());if(!JS_IsUndefined(outline.get()))settings.outline=self.unsignedNumber(outline.get());
                if(!JS_IsUndefined(premultiplied.get())){if(!JS_IsBool(premultiplied.get()))throw std::runtime_error("Text premultiplied option must be a boolean");settings.premultiplied=JS_ToBool(context,premultiplied.get())!=0;}
                const auto image=self.services_.rasterizeTextLayout(self.unsignedNumber(argument(0)),settings);
                Value result(context,JS_NewObject(context));self.check(result.get());
                JS_SetPropertyStr(context,result.get(),"texture",JS_NewUint32(context,image.texture));JS_SetPropertyStr(context,result.get(),"x",JS_NewInt32(context,image.x));JS_SetPropertyStr(context,result.get(),"y",JS_NewInt32(context,image.y));
                JS_SetPropertyStr(context,result.get(),"width",JS_NewInt32(context,image.width));JS_SetPropertyStr(context,result.get(),"height",JS_NewInt32(context,image.height));
                return JS_DupValue(context,result.get());
            }
            case DestroyTextLayout:self.services_.destroyTextLayout(self.unsignedNumber(argument(0)));break;
            case CreateRenderTarget: {
                const auto width=self.unsignedNumber(argument(0)),height=self.unsignedNumber(argument(1));
                if(width<1||height<1||width>4096||height>4096) throw std::runtime_error("Render target dimensions must be in 1..4096");
                return JS_NewUint32(context,self.services_.createRenderTarget(static_cast<int>(width),static_cast<int>(height)));
            }
            case CreateTexture: case UpdateTexture: case UpdateTextureRegion: {
                const int pixelArgument=magic==CreateTexture?2:magic==UpdateTextureRegion?5:1;
                const auto type=JS_GetTypedArrayType(argument(pixelArgument));
                if(type!=JS_TYPED_ARRAY_UINT8&&type!=JS_TYPED_ARRAY_UINT8C)throw std::runtime_error("Pixels must be a Uint8Array or Uint8ClampedArray");
                std::size_t length=0;const auto* data=JS_GetUint8Array(context,&length,argument(pixelArgument));
                if(!data)return JS_EXCEPTION;
                if(length>4096ull*4096*4)throw std::runtime_error("Pixel data exceeds 4096x4096 RGBA limit");
                const std::vector<std::uint8_t> pixels(data,data+length);
                if(magic==CreateTexture){const auto width=self.unsignedNumber(argument(0)),height=self.unsignedNumber(argument(1));
                    if(width<1||height<1||width>4096||height>4096)throw std::runtime_error("Texture dimensions must be in 1..4096");
                    return JS_NewUint32(context,self.services_.createTexture(static_cast<int>(width),static_cast<int>(height),pixels));}
                if(magic==UpdateTextureRegion){
                    const auto x=self.unsignedNumber(argument(1)),y=self.unsignedNumber(argument(2)),width=self.unsignedNumber(argument(3)),height=self.unsignedNumber(argument(4));
                    if(x>4096||y>4096||width<1||height<1||width>4096||height>4096)throw std::runtime_error("Texture region coordinates and dimensions must be within 4096");
                    self.services_.updateTextureRegion(self.unsignedNumber(argument(0)),static_cast<int>(x),static_cast<int>(y),static_cast<int>(width),static_cast<int>(height),pixels);
                }else self.services_.updateTexture(self.unsignedNumber(argument(0)),pixels);break;
            }
            case ReadTexturePixels: {
                const auto pixels=self.services_.readTexturePixels(argc?self.unsignedNumber(argument(0)):0);
                Value result(context,JS_NewObject(context));self.check(result.get());
                JS_SetPropertyStr(context,result.get(),"width",JS_NewInt32(context,pixels.width));
                JS_SetPropertyStr(context,result.get(),"height",JS_NewInt32(context,pixels.height));
                Value bytes(context,JS_NewUint8ArrayCopy(context,pixels.pixels.data(),pixels.pixels.size()));self.check(bytes.get());
                JS_SetPropertyStr(context,result.get(),"pixels",JS_DupValue(context,bytes.get()));return JS_DupValue(context,result.get());
            }
            case UnloadTexture:self.services_.unloadTexture(self.unsignedNumber(argument(0)));break;
            case UnloadSound:self.services_.unloadSound(self.unsignedNumber(argument(0)));break;
            case UnloadMusic:self.services_.unloadMusic(self.unsignedNumber(argument(0)));break;
            case UnloadFont:self.services_.unloadFont(self.unsignedNumber(argument(0)));break;
            case CreateShader:{
                const auto fragment=self.string(argument(0));
                const auto vertex=argc>1&&!JS_IsNull(argv[1])&&!JS_IsUndefined(argv[1])?self.string(argv[1]):std::string();
                return JS_NewUint32(context,self.services_.createShader(vertex,fragment));
            }
            case UnloadShader:self.services_.unloadShader(self.unsignedNumber(argument(0)));break;
            case PlaySound: {
                const auto pan=argc>2?self.number(argv[2]):0.5;
                if(pan<0||pan>1) throw std::runtime_error("Pan must be between 0 and 1");
                if(argc>3&&!JS_IsBool(argv[3]))throw std::runtime_error("Loop must be boolean");
                self.services_.playSound(self.unsignedNumber(argument(0)), volume(),static_cast<float>(pan),argc>3&&JS_ToBool(context,argv[3]));break;
            }
            case StopSound: self.services_.stopSound(self.unsignedNumber(argument(0)));break;
            case PauseSound:self.services_.pauseSound(self.unsignedNumber(argument(0)));break;
            case ResumeSound:self.services_.resumeSound(self.unsignedNumber(argument(0)));break;
            case IsSoundPlaying:return JS_NewBool(context,self.services_.isSoundPlaying(self.unsignedNumber(argument(0))));
            case PlayMusic: self.services_.playMusic(self.unsignedNumber(argument(0)), volume()); break;
            case SetMusicVolume:self.services_.setMusicVolume(self.unsignedNumber(argument(0)),volume(true));break;
            case StopMusic: self.services_.stopMusic(self.unsignedNumber(argument(0))); break;
            case PauseMusic:self.services_.pauseMusic(self.unsignedNumber(argument(0)));break;
            case ResumeMusic:self.services_.resumeMusic(self.unsignedNumber(argument(0)));break;
            case SetMusicLoop: self.services_.setMusicLoop(self.unsignedNumber(argument(0)),static_cast<float>(self.number(argument(1))),static_cast<float>(self.number(argument(2))));break;
            case SeekMusic: self.services_.seekMusic(self.unsignedNumber(argument(0)),static_cast<float>(self.number(argument(1))));break;
            case GetMusicTime: return JS_NewFloat64(context,self.services_.getMusicTime(self.unsignedNumber(argument(0))));
            default: throw std::runtime_error("Unknown native API operation");
            }
            return JS_UNDEFINED;
        } catch (const std::exception& error) { return JS_ThrowInternalError(context, "%s", error.what()); }
    }
    void installApi() {
        Value global(context_, JS_GetGlobalObject(context_));
        Value native(context_, JS_NewObject(context_));
        JS_SetPropertyStr(context_, native.get(), "version", JS_NewString(context_, "0.1.0"));
        JS_SetPropertyStr(context_, native.get(), "backend", JS_NewString(context_, "quickjs"));
        JS_SetPropertyStr(context_, native.get(), "width", JS_NewInt32(context_, 960));
        JS_SetPropertyStr(context_, native.get(), "height", JS_NewInt32(context_, 720));
        const struct { const char* name; int arguments; Operation operation; } functions[] = {
            {"quit",0,Quit},{"log",1,Log},{"readText",1,ReadText},{"writeText",2,WriteText},
            {"loadTexture",1,LoadTexture},{"loadSound",1,LoadSound},{"loadMusic",1,LoadMusic},
            {"playSound",1,PlaySound},{"stopSound",1,StopSound},{"playMusic",1,PlayMusic},{"stopMusic",1,StopMusic},{"loadFont",1,LoadFont},{"createRenderTarget",2,CreateRenderTarget}
            ,{"setMusicLoop",3,SetMusicLoop},{"seekMusic",2,SeekMusic},{"getMusicTime",1,GetMusicTime},{"setMusicVolume",2,SetMusicVolume}
            ,{"createTexture",3,CreateTexture},{"updateTexture",2,UpdateTexture},{"readTexturePixels",0,ReadTexturePixels}
            ,{"updateTextureRegion",6,UpdateTextureRegion}
            ,{"unloadTexture",1,UnloadTexture},{"unloadSound",1,UnloadSound},{"unloadMusic",1,UnloadMusic},{"unloadFont",1,UnloadFont}
            ,{"pauseSound",1,PauseSound},{"resumeSound",1,ResumeSound},{"isSoundPlaying",1,IsSoundPlaying},{"pauseMusic",1,PauseMusic},{"resumeMusic",1,ResumeMusic}
            ,{"createTextLayout",1,CreateTextLayout},{"rasterizeTextLayout",1,RasterizeTextLayout},{"destroyTextLayout",1,DestroyTextLayout}
            ,{"hasSystemFont",1,HasSystemFont},{"encodeText",2,EncodeText},{"rasterizeBitmapText",1,RasterizeBitmapText}
            ,{"createShader",1,CreateShader},{"unloadShader",1,UnloadShader}
        };
        for (const auto& function : functions)
            JS_SetPropertyStr(context_, native.get(), function.name,
                JS_NewCFunctionMagic(context_, api, function.name, function.arguments, JS_CFUNC_generic_magic, function.operation));
        JS_SetPropertyStr(context_, global.get(), "tsstg", JS_DupValue(context_, native.get()));
        // A small console keeps portable modules useful without importing a host-specific module.
        beginCall();
        const char* bootstrap = "globalThis.console = Object.freeze({ log: (...v) => tsstg.log(v.map(String).join(' ')), warn: (...v) => tsstg.log(v.map(String).join(' ')), error: (...v) => tsstg.log(v.map(String).join(' ')) }); Object.freeze(tsstg);";
        Value result(context_, JS_Eval(context_, bootstrap, std::strlen(bootstrap), "<host>", JS_EVAL_TYPE_GLOBAL));
        check(result.get());
    }
};
}
std::unique_ptr<ScriptBackend> makeQuickJSBackend(HostServices& services) {
    return std::make_unique<QuickJSBackend>(services);
}
}
