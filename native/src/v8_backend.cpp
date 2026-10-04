#include "tsstg/backend.hpp"
#include "tsstg/geometry.hpp"
#include "v8.h"
#include "v8-version-string.h"
#include "libplatform/libplatform.h"
#include <algorithm>
#include <chrono>
#include <cmath>
#include <condition_variable>
#include <cstring>
#include <map>
#include <mutex>
#include <set>
#include <stdexcept>
#include <thread>
#include <utility>

namespace tsstg {
namespace {
// The pinned Rusty V8 archive uses libc++ internally. Its upstream C bridge
// creates/deletes the platform without passing STL ownership objects across
// the MSVC/libc++ ABI boundary. Other V8 calls below use only handles/scalars.
extern "C" v8::Platform* v8__Platform__NewDefaultPlatform(int thread_pool_size, bool idle_task_support);
extern "C" void v8__Platform__DELETE(v8::Platform* platform);
// These helpers mirror the existing host boundary's value operations. They do
// not embed QuickJS: every value below is a V8 handle owned by the current scope.
using JSValue = v8::Local<v8::Value>;
using JSValueConst = JSValue;
struct JSContext { v8::Isolate* isolate; void* opaque; };
struct ScriptFailure : std::exception {
    const char* what() const noexcept override { return "JavaScript exception"; }
};
#define JS_UNDEFINED JSValue(v8::Undefined(v8::Isolate::GetCurrent()))
#define JS_EXCEPTION JSValue()
constexpr int JS_TYPED_ARRAY_UINT8 = 1, JS_TYPED_ARRAY_UINT8C = 2;
class Value {
public:
    Value(JSContext*, JSValue value) : value_(value) {}
    JSValue get() const { return value_; }
private:
    JSValue value_;
};
v8::Local<v8::Context> current(JSContext* c) { return c->isolate->GetCurrentContext(); }
v8::Local<v8::String> utf8(JSContext* c, const char* bytes, std::size_t size) {
    if(size > static_cast<std::size_t>(INT_MAX)) throw std::runtime_error("String exceeds V8 length limit");
    v8::Local<v8::String> value;
    if(!v8::String::NewFromUtf8(c->isolate,bytes,v8::NewStringType::kNormal,static_cast<int>(size)).ToLocal(&value)) throw ScriptFailure{};
    return value;
}
v8::Local<v8::String> utf8(JSContext* c, const char* bytes) { return utf8(c,bytes,std::strlen(bytes)); }
bool JS_IsUndefined(JSValue v) { return !v.IsEmpty() && v->IsUndefined(); }
bool JS_IsNull(JSValue v) { return !v.IsEmpty() && v->IsNull(); }
bool JS_IsArray(JSValue v) { return !v.IsEmpty() && v->IsArray(); }
bool JS_IsBool(JSValue v) { return !v.IsEmpty() && v->IsBoolean(); }
bool JS_IsObject(JSValue v) { return !v.IsEmpty() && v->IsObject(); }
bool JS_IsString(JSValue v) { return !v.IsEmpty() && v->IsString(); }
bool JS_IsNumber(JSValue v) { return !v.IsEmpty() && v->IsNumber(); }
bool JS_IsFunction(JSValue v) { return !v.IsEmpty() && v->IsFunction(); }
bool JS_IsPromise(JSValue v) { return !v.IsEmpty() && v->IsPromise(); }
JSValue JS_GetPropertyStr(JSContext* c, JSValue v, const char* key) {
    if(v.IsEmpty() || !v->IsObject()) throw std::runtime_error("Expected an object");
    JSValue result; if(!v.As<v8::Object>()->Get(current(c),utf8(c,key)).ToLocal(&result)) throw ScriptFailure{}; return result;
}
JSValue JS_GetPropertyUint32(JSContext* c, JSValue v, std::uint32_t key) {
    if(v.IsEmpty() || !v->IsObject()) throw std::runtime_error("Expected an object");
    JSValue result; if(!v.As<v8::Object>()->Get(current(c),key).ToLocal(&result)) throw ScriptFailure{}; return result;
}
void JS_SetPropertyStr(JSContext* c, JSValue v, const char* key, JSValue value) {
    if(!v.As<v8::Object>()->Set(current(c),utf8(c,key),value).FromMaybe(false)) throw ScriptFailure{};
}
JSValue JS_NewObject(JSContext* c) { return v8::Object::New(c->isolate); }
JSValue JS_NewStringLen(JSContext* c, const char* s, std::size_t n) { return utf8(c,s,n); }
JSValue JS_NewString(JSContext* c, const char* s) { return utf8(c,s); }
JSValue JS_NewInt32(JSContext* c, std::int32_t n) { return v8::Integer::New(c->isolate,n); }
JSValue JS_NewUint32(JSContext* c, std::uint32_t n) { return v8::Integer::NewFromUnsigned(c->isolate,n); }
JSValue JS_NewFloat64(JSContext* c, double n) { return v8::Number::New(c->isolate,n); }
JSValue JS_NewBool(JSContext* c, bool n) { return v8::Boolean::New(c->isolate,n); }
int JS_ToBool(JSContext* c, JSValue v) { return v->BooleanValue(c->isolate); }
JSValue JS_DupValue(JSContext*, JSValue v) { return v; }
void* JS_GetContextOpaque(JSContext* c) { return c->opaque; }
int JS_GetTypedArrayType(JSValue v) { return v->IsUint8Array()?JS_TYPED_ARRAY_UINT8:v->IsUint8ClampedArray()?JS_TYPED_ARRAY_UINT8C:0; }
const std::uint8_t* JS_GetUint8Array(JSContext*, std::size_t* size, JSValue v) {
    auto view=v.As<v8::ArrayBufferView>(); *size=view->ByteLength();
    if(view->Buffer()->WasDetached()) throw std::runtime_error("Pixel buffer is detached");
    static const std::uint8_t empty=0;
    return *size?static_cast<const std::uint8_t*>(view->Buffer()->Data())+view->ByteOffset():&empty;
}
JSValue JS_NewUint8ArrayCopy(JSContext* c, const std::uint8_t* data, std::size_t size) {
    auto buffer=v8::ArrayBuffer::New(c->isolate,size);
    if(size) std::memcpy(buffer->Data(),data,size);
    return v8::Uint8Array::New(buffer,0,size);
}
JSValue JS_ThrowInternalError(JSContext* c, const char*, const char* message) {
    c->isolate->ThrowException(v8::Exception::Error(utf8(c,message))); return JS_EXCEPTION;
}
class PlatformLifetime {
public:
    PlatformLifetime() {
        platform=v8__Platform__NewDefaultPlatform(0,false);
        v8::V8::InitializePlatform(platform);
        if(!v8::V8::Initialize()) throw std::runtime_error("Cannot initialize V8");
    }
    ~PlatformLifetime() { v8::V8::Dispose(); v8::V8::DisposePlatform(); v8__Platform__DELETE(platform); }
    v8::Platform* platform=nullptr;
};
PlatformLifetime& platformLifetime() { static PlatformLifetime lifetime; return lifetime; }

class V8Backend final : public ScriptBackend {
public:
    explicit V8Backend(HostServices& services) : services_(services) {
        platformLifetime();
        allocator_.reset(v8::ArrayBuffer::Allocator::NewDefaultAllocator());
        v8::Isolate::CreateParams parameters;
        parameters.array_buffer_allocator=allocator_.get();
        parameters.constraints.set_max_old_generation_size_in_bytes(256*1024*1024);
        parameters.constraints.set_max_young_generation_size_in_bytes(16*1024*1024);
        isolate_=v8::Isolate::New(parameters);
        if(!isolate_) throw std::runtime_error("Cannot allocate V8 isolate");
        try {
        bridge_={isolate_,this}; context_=&bridge_;
        isolate_->SetData(0,this);
        isolate_->SetMicrotasksPolicy(v8::MicrotasksPolicy::kExplicit);
        isolate_->SetPromiseRejectCallback(trackRejection);
        isolate_->SetPromiseHook(promiseHook);
        isolate_->SetHostInitializeImportMetaObjectCallback(importMeta);
        isolate_->SetHostImportModuleDynamicallyCallback(dynamicImport);
        {
            v8::Isolate::Scope isolateScope(isolate_); v8::HandleScope handles(isolate_);
            auto context=v8::Context::New(isolate_);
            if(context.IsEmpty()) throw std::runtime_error("Cannot allocate V8 context");
            contextHandle_.Reset(isolate_,context);
        }
        watchdog_=std::thread([this] { watchDeadline(); });
        Scope scope(*this); installApi();
        }
        catch(...) { cleanup(); throw; }
    }
    ~V8Backend() override { cleanup(); }
    const char* name() const override { return "V8 " V8_VERSION_STRING; }
    void load(const std::filesystem::path& entry) override {
        Scope scope(*this);
        auto module=compileModule(entry.generic_u8string());
        if(!module->InstantiateModule(current(context_),resolveModule).FromMaybe(false)) throwException();
        JSValue result; if(!module->Evaluate(current(context_)).ToLocal(&result)) throwException();
        drainJobs();
        if(result->IsPromise()) {
            auto promise=result.As<v8::Promise>();
            if(promise->State()==v8::Promise::kRejected) throw std::runtime_error(describe(promise->Result()));
            if(promise->State()==v8::Promise::kPending) throw std::runtime_error("Entry module has an unresolved top-level await");
        }
        auto global=current(context_)->Global();
        JSValue game;
        try { game=JS_GetPropertyStr(context_,global,"__tsstg_game"); }
        catch(const ScriptFailure&) { throwException(); }
        check(game);
        if(!JS_IsObject(game)) throw std::runtime_error("Entry must set globalThis.__tsstg_game");
        game_.Reset(isolate_,game);
        for(const char* method:{"update","render"}) {
            JSValue fn;
            try { fn=JS_GetPropertyStr(context_,game,method); }
            catch(const ScriptFailure&) { throwException(); }
            if(!JS_IsFunction(fn)) throw std::runtime_error(std::string("Game requires function: ")+method);
        }
    }
    void update(std::uint32_t inputMask) override {
        Scope scope(*this); JSValue input=JS_NewUint32(context_,inputMask); call("update",1,&input);
    }
    std::vector<DrawCommand> render() override {
        Scope scope(*this);
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
            } catch (const ScriptFailure&) {
                try { throwException(); }
                catch (const std::exception& error) {
                    throw std::runtime_error("render command " + std::to_string(index) + ": " + error.what());
                }
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
        Scope scope(*this);
        JSValue method;
        try { method=JS_GetPropertyStr(context_,game_.Get(isolate_),"snapshot"); }
        catch(const ScriptFailure&) { throwException(); }
        if(JS_IsUndefined(method)) return "null";
        auto result=call("snapshot");
        v8::Local<v8::String> json;
        if(!v8::JSON::Stringify(current(context_),result).ToLocal(&json)) {
            if(scope.catcher.HasCaught()) throwException();
            throw std::runtime_error("snapshot() must return JSON-serializable data");
        }
        return string(json);
    }
private:
    enum Operation { Quit, Log, ReadText, WriteText, LoadTexture, LoadSound, LoadMusic, PlaySound, StopSound, PlayMusic, StopMusic, SetMusicLoop, SeekMusic, GetMusicTime, LoadFont, CreateRenderTarget, CreateTexture, UpdateTexture, ReadTexturePixels, UnloadTexture, UnloadSound, UnloadMusic, UnloadFont, PauseSound, ResumeSound, IsSoundPlaying, PauseMusic, ResumeMusic, CreateShader, UnloadShader, CreateTextLayout, RasterizeTextLayout, DestroyTextLayout, HasSystemFont, EncodeText, RasterizeBitmapText, UpdateTextureRegion, SetMusicVolume };
    HostServices& services_;
    v8::Isolate* isolate_=nullptr;
    JSContext bridge_{};
    JSContext* context_=nullptr;
    std::unique_ptr<v8::ArrayBuffer::Allocator> allocator_;
    v8::Global<v8::Context> contextHandle_;
    v8::Global<v8::Value> game_;
    std::map<std::string,v8::Global<v8::Module>> modules_;
    struct Rejection { v8::Global<v8::Promise> promise; v8::Global<v8::Value> reason; };
    std::vector<Rejection> rejections_;
    struct Import { v8::Global<v8::Promise> evaluation; v8::Global<v8::Promise::Resolver> resolver; v8::Global<v8::Module> module; };
    std::vector<Import> imports_;
    std::array<double,2> timings_{};
    std::thread watchdog_;
    std::mutex deadlineMutex_;
    std::condition_variable deadlineChanged_;
    bool stopping_=false,armed_=false;
    std::chrono::steady_clock::time_point deadline_{};
    v8::TryCatch* catcher_=nullptr;
    unsigned jobCount_=0;
    bool jobsExceeded_=false;
    class Scope {
    public:
        explicit Scope(V8Backend& backend) : self(backend),isolateScope(self.isolate_),handles(self.isolate_),contextScope(self.contextHandle_.Get(self.isolate_)),catcher(self.isolate_) {
            self.catcher_=&catcher; self.beginCall(); self.jobCount_=0; self.jobsExceeded_=false;
        }
        ~Scope() {
            { std::lock_guard<std::mutex> lock(self.deadlineMutex_); self.armed_=false; }
            self.deadlineChanged_.notify_one(); self.catcher_=nullptr;
            if(self.isolate_->IsExecutionTerminating()) self.isolate_->CancelTerminateExecution();
        }
        V8Backend& self;
        v8::Isolate::Scope isolateScope;
        v8::HandleScope handles;
        v8::Context::Scope contextScope;
        v8::TryCatch catcher;
    };
    void cleanup() {
        { std::lock_guard<std::mutex> lock(deadlineMutex_); stopping_=true; armed_=false; }
        deadlineChanged_.notify_one(); if(watchdog_.joinable()) watchdog_.join();
        imports_.clear(); rejections_.clear(); modules_.clear(); game_.Reset(); contextHandle_.Reset();
        if(isolate_) { isolate_->Dispose(); isolate_=nullptr; }
    }
    void beginCall() {
        { std::lock_guard<std::mutex> lock(deadlineMutex_); deadline_=std::chrono::steady_clock::now()+std::chrono::seconds(5); armed_=true; }
        deadlineChanged_.notify_one();
    }
    void watchDeadline() {
        std::unique_lock<std::mutex> lock(deadlineMutex_);
        while(!stopping_) {
            if(!armed_) { deadlineChanged_.wait(lock,[this]{return stopping_||armed_;}); continue; }
            const auto deadline=deadline_;
            if(deadlineChanged_.wait_until(lock,deadline,[this,deadline]{return stopping_||!armed_||deadline_!=deadline;})) continue;
            if(armed_) { isolate_->TerminateExecution(); armed_=false; }
        }
    }
    std::string describe(JSValue error) {
        if(error.IsEmpty()) return "JavaScript exception";
        v8::String::Utf8Value text(isolate_,error);
        std::string message=*text?std::string(*text,text.length()):"JavaScript exception";
        if(error->IsObject()) {
            JSValue stack;
            if(error.As<v8::Object>()->Get(current(context_),utf8(context_,"stack")).ToLocal(&stack) && !stack->IsUndefined()) {
                v8::String::Utf8Value stackText(isolate_,stack);
                if(*stackText) { message+='\n'; message.append(*stackText,stackText.length()); }
            }
        }
        return message;
    }
    [[noreturn]] void throwException() {
        if(isolate_->IsExecutionTerminating()) {
            isolate_->CancelTerminateExecution();
            throw std::runtime_error(jobsExceeded_?"Exceeded 10000 pending JavaScript jobs in one frame":"JavaScript execution exceeded 5 seconds");
        }
        throw std::runtime_error(catcher_&&catcher_->HasCaught()?describe(catcher_->Exception()):"JavaScript exception");
    }
    void check(JSValue value) { if(value.IsEmpty()) throwException(); }
    std::string string(JSValue value) {
        check(value); if(!JS_IsString(value)) throw std::runtime_error("Expected a string");
        v8::String::Utf8Value bytes(isolate_,value); if(!*bytes) throwException();
        return std::string(*bytes,bytes.length());
    }
    double number(JSValue value) {
        check(value); if(!JS_IsNumber(value)) throw std::runtime_error("Expected a number");
        const auto result=value.As<v8::Number>()->Value();
        if(!std::isfinite(result)) throw std::runtime_error("Expected a finite number"); return result;
    }
    std::uint32_t unsignedNumber(JSValue value) {
        const auto n=number(value); if(n<0||n>4294967295.0||std::floor(n)!=n) throw std::runtime_error("Expected an unsigned 32-bit integer");
        return static_cast<std::uint32_t>(n);
    }
    std::uint32_t length(JSValue value) {
        check(value); if(value->IsArray()) return value.As<v8::Array>()->Length();
        return unsignedNumber(JS_GetPropertyStr(context_,value,"length"));
    }
    static V8Backend& owner(v8::Isolate* isolate) { return *static_cast<V8Backend*>(isolate->GetData(0)); }
    static void trackRejection(v8::PromiseRejectMessage message) {
        auto& self=owner(v8::Isolate::GetCurrent()); const auto promise=message.GetPromise();
        if(message.GetEvent()==v8::kPromiseHandlerAddedAfterReject) {
            self.rejections_.erase(std::remove_if(self.rejections_.begin(),self.rejections_.end(),[&](const auto& row){return row.promise.Get(self.isolate_)==promise;}),self.rejections_.end());
        } else if(message.GetEvent()==v8::kPromiseRejectWithNoHandler) {
            self.rejections_.push_back({v8::Global<v8::Promise>(self.isolate_,promise),v8::Global<v8::Value>(self.isolate_,message.GetValue())});
        }
    }
    static void promiseHook(v8::PromiseHookType type,v8::Local<v8::Promise>,v8::Local<v8::Value>) {
        if(type!=v8::PromiseHookType::kBefore) return;
        auto& self=owner(v8::Isolate::GetCurrent());
        if(++self.jobCount_>10000) { self.jobsExceeded_=true; self.isolate_->TerminateExecution(); }
    }
    void drainJobs() {
        for(unsigned pass=0;;++pass) {
            isolate_->PerformMicrotaskCheckpoint();
            if(isolate_->IsExecutionTerminating()||(catcher_&&catcher_->HasCaught())) throwException();
            bool settled=false;
            for(auto it=imports_.begin();it!=imports_.end();) {
                auto evaluation=it->evaluation.Get(isolate_);
                if(evaluation->State()==v8::Promise::kPending) { ++it; continue; }
                auto resolver=it->resolver.Get(isolate_);
                auto ok=evaluation->State()==v8::Promise::kFulfilled?resolver->Resolve(current(context_),it->module.Get(isolate_)->GetModuleNamespace()):resolver->Reject(current(context_),evaluation->Result());
                if(ok.IsNothing()) throwException(); it=imports_.erase(it); settled=true;
            }
            if(!settled) break;
            if(pass>10000) throw std::runtime_error("Exceeded 10000 pending JavaScript jobs in one frame");
        }
        if(!rejections_.empty()) throw std::runtime_error("Unhandled promise rejection: "+describe(rejections_.front().reason.Get(isolate_)));
    }
    JSValue call(const char* name,int argc=0,JSValue* argv=nullptr) {
        auto game=game_.Get(isolate_); JSValue method;
        try { method=JS_GetPropertyStr(context_,game,name); }
        catch(const ScriptFailure&) { throwException(); }
        if(!JS_IsFunction(method)) throw std::runtime_error(std::string("Game method is not a function: ")+name);
        JSValue result; if(!method.As<v8::Function>()->Call(current(context_),game,argc,argv).ToLocal(&result)) throwException();
        if(JS_IsPromise(result)) throw std::runtime_error(std::string(name)+"() must be synchronous");
        drainJobs(); return result;
    }
    v8::Local<v8::Module> compileModule(const std::string& filename) {
        auto found=modules_.find(filename); if(found!=modules_.end()) return found->second.Get(isolate_);
        auto source=services_.readModule(std::filesystem::u8path(filename));
        v8::ScriptOrigin origin(utf8(context_,filename.data(),filename.size()),0,0,false,-1,JSValue(),false,false,true);
        v8::ScriptCompiler::Source script(utf8(context_,source.data(),source.size()),origin);
        v8::Local<v8::Module> module; if(!v8::ScriptCompiler::CompileModule(isolate_,&script).ToLocal(&module)) throwException();
        modules_.emplace(filename,v8::Global<v8::Module>(isolate_,module)); return module;
    }
    std::string moduleName(v8::Local<v8::Module> module) {
        for(const auto& row:modules_) if(row.second.Get(isolate_)==module) return row.first;
        throw std::runtime_error("Unknown module referrer");
    }
    static v8::MaybeLocal<v8::Module> resolveModule(v8::Local<v8::Context> context,v8::Local<v8::String> name,v8::Local<v8::FixedArray>,v8::Local<v8::Module> base) {
        auto& self=owner(context->GetIsolate());
        try { return self.compileModule(self.services_.resolveModule(self.string(name),self.moduleName(base)).generic_u8string()); }
        catch(const ScriptFailure&) { return {}; }
        catch(const std::exception& error) { JS_ThrowInternalError(self.context_,"%s",error.what()); return {}; }
    }
    static void importMeta(v8::Local<v8::Context> context,v8::Local<v8::Module> module,v8::Local<v8::Object> meta) {
        auto& self=owner(context->GetIsolate());
        try { const auto name=self.moduleName(module); JS_SetPropertyStr(self.context_,meta,"url",utf8(self.context_,name.data(),name.size())); }
        catch(const std::exception& error) { JS_ThrowInternalError(self.context_,"%s",error.what()); }
    }
    static v8::MaybeLocal<v8::Promise> dynamicImport(v8::Local<v8::Context> context,v8::Local<v8::Data>,JSValue base,v8::Local<v8::String> name,v8::Local<v8::FixedArray>) {
        auto& self=owner(context->GetIsolate()); v8::EscapableHandleScope handles(self.isolate_); v8::TryCatch catcher(self.isolate_);
        v8::Local<v8::Promise::Resolver> resolver; if(!v8::Promise::Resolver::New(context).ToLocal(&resolver)) return {};
        try {
            auto module=self.compileModule(self.services_.resolveModule(self.string(name),self.string(base)).generic_u8string());
            if(module->GetStatus()==v8::Module::kUninstantiated&&!module->InstantiateModule(context,resolveModule).FromMaybe(false)) throw ScriptFailure{};
            JSValue evaluation; if(!module->Evaluate(context).ToLocal(&evaluation)) throw ScriptFailure{};
            if(evaluation->IsPromise()) {
                // The import resolver owns rejection reporting, as required by
                // the dynamic import contract, rather than the evaluation promise.
                auto promise=evaluation.As<v8::Promise>(); promise->MarkAsHandled();
                self.rejections_.erase(std::remove_if(self.rejections_.begin(),self.rejections_.end(),[&](const auto& row){return row.promise.Get(self.isolate_)==promise;}),self.rejections_.end());
                self.imports_.push_back({v8::Global<v8::Promise>(self.isolate_,promise),v8::Global<v8::Promise::Resolver>(self.isolate_,resolver),v8::Global<v8::Module>(self.isolate_,module)});
            } else { if(resolver->Resolve(context,module->GetModuleNamespace()).IsNothing()) return {}; }
        } catch(const ScriptFailure&) { if(resolver->Reject(context,catcher.Exception()).IsNothing()) return {}; }
          catch(const std::exception& error) {
            auto reason=catcher.HasCaught()?catcher.Exception():v8::Exception::Error(utf8(self.context_,error.what()));
            if(resolver->Reject(context,reason).IsNothing()) return {};
        }
        return handles.Escape(resolver->GetPromise());
    }
    static void apiCallback(const v8::FunctionCallbackInfo<v8::Value>& info) {
        auto& self=owner(info.GetIsolate());
        std::vector<JSValue> arguments; arguments.reserve(info.Length()); for(int i=0;i<info.Length();++i) arguments.push_back(info[i]);
        try {
            auto result=api(self.context_,info.This(),info.Length(),arguments.data(),info.Data().As<v8::Integer>()->Value());
            if(!result.IsEmpty()) info.GetReturnValue().Set(result);
        } catch(const ScriptFailure&) { /* A V8 exception is already pending. */ }
          catch(const std::exception& error) { JS_ThrowInternalError(self.context_,"%s",error.what()); }
    }
    static JSValue api(JSContext* context, JSValueConst, int argc, JSValueConst* argv, int magic) {
        auto& self = *static_cast<V8Backend*>(JS_GetContextOpaque(context));
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
        } catch (const ScriptFailure&) { return JS_EXCEPTION; }
          catch (const std::exception& error) { return JS_ThrowInternalError(context, "%s", error.what()); }
    }
    void installApi() {
        auto global=current(context_)->Global(); auto native=v8::Object::New(isolate_);
        JS_SetPropertyStr(context_,native,"version",JS_NewString(context_,"0.1.0"));
        JS_SetPropertyStr(context_,native,"backend",JS_NewString(context_,"v8"));
        JS_SetPropertyStr(context_,native,"width",JS_NewInt32(context_,960));
        JS_SetPropertyStr(context_,native,"height",JS_NewInt32(context_,720));
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

        for(const auto& entry:functions) {
            v8::Local<v8::Function> fn;
            if(!v8::Function::New(current(context_),apiCallback,v8::Integer::New(isolate_,entry.operation),entry.arguments).ToLocal(&fn)) throwException();
            fn->SetName(utf8(context_,entry.name)); JS_SetPropertyStr(context_,native,entry.name,fn);
        }
        JS_SetPropertyStr(context_,global,"tsstg",native);
        const char* bootstrap="globalThis.console = Object.freeze({ log: (...v) => tsstg.log(v.map(String).join(' ')), warn: (...v) => tsstg.log(v.map(String).join(' ')), error: (...v) => tsstg.log(v.map(String).join(' ')) }); Object.freeze(tsstg);";
        v8::Local<v8::Script> script;
        if(!v8::Script::Compile(current(context_),utf8(context_,bootstrap)).ToLocal(&script)) throwException();
        if(script->Run(current(context_)).IsEmpty()) throwException();
    }
};
}
std::unique_ptr<ScriptBackend> makeV8Backend(HostServices& services) { return std::make_unique<V8Backend>(services); }
}
