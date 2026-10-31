#include "tsstg/models.hpp"
#include "raylib.h"
#include "raymath.h"
#include "rlgl.h"
#include "external/glad.h"
// cgltf is already compiled by the pinned raylib rmodels translation unit.
#include "external/cgltf.h"
#include <algorithm>
#include <cmath>
#include <fstream>
#include <limits>
#include <map>
#include <type_traits>
#include <stdexcept>

namespace tsstg {
namespace {
constexpr std::size_t maxBytes=64*1024*1024, maxTriangles=200000;
Matrix matrix(const std::array<float,16>& m) {return {m[0],m[4],m[8],m[12],m[1],m[5],m[9],m[13],m[2],m[6],m[10],m[14],m[3],m[7],m[11],m[15]};}
Color color(std::uint32_t c) {return {static_cast<unsigned char>(c>>24),static_cast<unsigned char>(c>>16),static_cast<unsigned char>(c>>8),static_cast<unsigned char>(c)};}
const char* vertexSource=R"(#version 330
in vec3 vertexPosition;
in vec3 vertexNormal;
in vec2 vertexTexCoord;
in vec4 vertexColor;
uniform mat4 mvp;
uniform mat4 matModel;
uniform mat4 matNormal;
out vec2 uv;
out vec3 normal;
out vec3 world;
out vec4 tint;
void main(){uv=vertexTexCoord;normal=normalize((matNormal*vec4(vertexNormal,0.0)).xyz);
world=(matModel*vec4(vertexPosition,1.0)).xyz;tint=vertexColor;gl_Position=mvp*vec4(vertexPosition,1.0);}
)";
const char* fragmentSource=R"(#version 330
in vec2 uv;
in vec3 normal;
in vec3 world;
in vec4 tint;
uniform sampler2D texture0;
uniform vec4 colDiffuse;
uniform vec3 eye;
uniform vec3 sun;
uniform vec3 ambient;
uniform vec3 sunlight;
uniform vec3 fogColor;
uniform vec2 fogRange;
uniform float exposure;
uniform vec3 emission;
uniform float alphaCutoff;
uniform float unlit;
out vec4 finalColor;
void main(){vec4 base=texture(texture0,uv)*colDiffuse*tint;if(base.a<alphaCutoff)discard;
vec3 n=normalize(normal);
vec3 light=mix(ambient+sunlight*max(dot(n,normalize(sun)),0.0),vec3(1.0),unlit);
vec3 rgb=(base.rgb*light+emission)*exposure;
float fog=smoothstep(fogRange.x,fogRange.y,length(world-eye));
finalColor=vec4(mix(rgb,fogColor,fog),1.0);}
)";
struct Part { Mesh mesh{}; Material material{}; Vector3 emission{};float cutoff=0,unlit=0; };
struct Resource {
    bool headless;ModelInfo info;std::vector<Part> parts;std::vector<Texture2D> textures;
    explicit Resource(bool value):headless(value){}
    ~Resource(){if(!headless){for(auto& p:parts){UnloadMesh(p.mesh);if(p.material.maps)MemFree(p.material.maps);}for(auto t:textures)UnloadTexture(t);}}
};
void check(bool valid,const char* message){if(!valid)throw std::runtime_error(message);}
const cgltf_accessor* attribute(const cgltf_primitive& p,cgltf_attribute_type type){for(std::size_t i=0;i<p.attributes_count;i++)if(p.attributes[i].type==type&&p.attributes[i].index==0)return p.attributes[i].data;return nullptr;}
void values(const cgltf_accessor* a,std::size_t index,float* out,std::size_t count){check(cgltf_accessor_read_float(a,index,out,count)!=0,"Invalid model accessor");for(std::size_t i=0;i<count;i++)check(std::isfinite(out[i])&&std::abs(out[i])<=10000000,"Nonfinite or excessive model coordinate");}
}
void validateModelMatrix(const std::array<float,16>& m,bool affine){
    for(float x:m)check(std::isfinite(x)&&std::abs(x)<=10000000,"Invalid model matrix");
    if(affine){check(std::abs(m[3])+std::abs(m[7])+std::abs(m[11])+std::abs(m[15]-1)<.00001f,"Model transform must be affine");check(std::abs(MatrixDeterminant(matrix(m)))>1e-12f,"Model transform must be invertible");}
}
void validateModelLighting(const std::array<float,18>& p){
    for(float x:p)check(std::isfinite(x)&&std::abs(x)<=10000000,"Invalid model lighting");
    check(p[3]*p[3]+p[4]*p[4]+p[5]*p[5]>1e-12f,"Model light direction must be nonzero");
    for(int i=6;i<15;i++)check(p[i]>=0&&p[i]<=4,"Model light and fog values must be in 0..4");
    check(p[15]>=0&&p[16]>p[15]&&p[17]>=0&&p[17]<=4,"Invalid model fog range or exposure");
}
struct ModelStore::Impl {
    bool headless,active=false;std::map<std::uint32_t,std::unique_ptr<Resource>> resources;Shader shader{};
    Matrix projection{},modelview{};GLboolean depth{},mask{},cull{},blend{};GLint depthFunction{};
    explicit Impl(bool value):headless(value){}
    ~Impl(){resources.clear();if(shader.id)UnloadShader(shader);}
    void ensureShader(){if(shader.id)return;shader=LoadShaderFromMemory(vertexSource,fragmentSource);check(shader.id&&shader.id!=rlGetShaderIdDefault(),"Cannot compile model shader");
        shader.locs[SHADER_LOC_MATRIX_MODEL]=GetShaderLocation(shader,"matModel");shader.locs[SHADER_LOC_MATRIX_NORMAL]=GetShaderLocation(shader,"matNormal");}
    void uniform(const char* name,const float* value,int type){SetShaderValue(shader,GetShaderLocation(shader,name),value,type);}
};
ModelStore::ModelStore(bool headless):impl_(std::make_unique<Impl>(headless)){}
ModelStore::~ModelStore()=default;
const ModelInfo& ModelStore::info(std::uint32_t id) const {const auto found=impl_->resources.find(id);if(found==impl_->resources.end())throw std::runtime_error("Unknown model id: "+std::to_string(id));return found->second->info;}
void ModelStore::unload(std::uint32_t id){info(id);impl_->resources.erase(id);}
ModelInfo ModelStore::load(std::uint32_t id,const std::filesystem::path& path){
    check(path.extension()==".glb","Models must be self-contained .glb files");check(std::filesystem::is_regular_file(path),"Model file not found");
    const auto size=std::filesystem::file_size(path);check(size>=20&&size<=maxBytes,"Model size must be 20 bytes..64 MiB");
    std::ifstream stream(path,std::ios::binary);std::vector<char> bytes(static_cast<std::size_t>(size));check(static_cast<bool>(stream.read(bytes.data(),bytes.size())),"Cannot read model");
    cgltf_options options{};cgltf_data* parsed=nullptr;
    check(cgltf_parse(&options,bytes.data(),bytes.size(),&parsed)==cgltf_result_success,"Invalid GLB model");
    const auto cleanup=[](cgltf_data* p){cgltf_free(p);};std::unique_ptr<cgltf_data,decltype(cleanup)> data(parsed,cleanup);
    check(data->file_type==cgltf_file_type_glb&&data->buffers_count==1&&!data->buffers[0].uri,"Model buffers must be embedded in GLB");
    check(!data->extensions_required_count&&!data->skins_count&&!data->animations_count,"Required extensions, skins and animations are not supported by static models");
    check(cgltf_load_buffers(&options,data.get(),nullptr)==cgltf_result_success&&cgltf_validate(data.get())==cgltf_result_success,"Invalid GLB buffer/accessor data");
    check(data->nodes_count<=2048&&data->meshes_count<=256&&data->images_count<=32,"Model has too many nodes, meshes or images");
    auto resource=std::make_unique<Resource>(impl_->headless);resource->info.id=id;
    resource->info.minimum.fill(std::numeric_limits<float>::max());resource->info.maximum.fill(-std::numeric_limits<float>::max());
    for(std::size_t i=0;i<data->images_count;i++){
        const auto& source=data->images[i];check(!source.uri&&source.buffer_view&&source.mime_type,"Model images must be embedded PNG or JPEG");
        const std::string mime=source.mime_type;check(mime=="image/png"||mime=="image/jpeg","Only PNG/JPEG model images are supported");
        check(source.buffer_view->size<=maxBytes,"Model image too large");
        auto image=LoadImageFromMemory(mime=="image/png"?".png":".jpg",static_cast<const unsigned char*>(cgltf_buffer_view_data(source.buffer_view)),static_cast<int>(source.buffer_view->size));
        if(!image.data||image.width>4096||image.height>4096){if(image.data)UnloadImage(image);throw std::runtime_error("Model image must decode within 4096x4096");}
        Texture2D texture{};if(!impl_->headless){texture=LoadTextureFromImage(image);GenTextureMipmaps(&texture);SetTextureFilter(texture,TEXTURE_FILTER_TRILINEAR);SetTextureWrap(texture,TEXTURE_WRAP_REPEAT);}
        UnloadImage(image);resource->textures.push_back(texture);
    }
    std::vector<cgltf_node*> nodes;
    const auto visit=[&](auto&& self,cgltf_node* node,std::size_t depth)->void {check(depth<128,"Model node hierarchy too deep or cyclic");check(std::find(nodes.begin(),nodes.end(),node)==nodes.end(),"Model node reused or cyclic");nodes.push_back(node);for(std::size_t i=0;i<node->children_count;i++)self(self,node->children[i],depth+1);};
    if(data->scene){for(std::size_t i=0;i<data->scene->nodes_count;i++)visit(visit,data->scene->nodes[i],0);}else for(std::size_t i=0;i<data->nodes_count;i++)if(!data->nodes[i].parent)visit(visit,&data->nodes[i],0);
    for(const auto* node:nodes)if(node->mesh){
        {std::size_t depth=0;for(auto* parent=node;parent;parent=parent->parent)check(++depth<128,"Cyclic or excessive parent hierarchy");}
        std::array<float,16> world{};cgltf_node_transform_world(node,world.data());validateModelMatrix(world,true);
        const auto transform=matrix(world),normalTransform=MatrixTranspose(MatrixInvert(transform));
        for(std::size_t j=0;j<node->mesh->primitives_count;j++){
            const auto& source=node->mesh->primitives[j];check(source.type==cgltf_primitive_type_triangles&&!source.targets_count&&!source.has_draco_mesh_compression,"Only static uncompressed triangle primitives are supported");
            const auto* positions=attribute(source,cgltf_attribute_type_position);check(positions&&positions->type==cgltf_type_vec3,"Model requires VEC3 positions");
            const auto* normals=attribute(source,cgltf_attribute_type_normal);const auto* uv=attribute(source,cgltf_attribute_type_texcoord);const auto* colors=attribute(source,cgltf_attribute_type_color);
            check((!normals||(normals->type==cgltf_type_vec3&&normals->count==positions->count))&&(!uv||(uv->type==cgltf_type_vec2&&uv->count==positions->count))&&(!colors||((colors->type==cgltf_type_vec3||colors->type==cgltf_type_vec4)&&colors->count==positions->count)),"Invalid model vertex attributes");
            const auto count=source.indices?source.indices->count:positions->count;check(count&&count%3==0&&count/3<=maxTriangles-resource->info.triangles,"Model triangle budget exceeded");
            if(source.indices)check(source.indices->type==cgltf_type_scalar&&!source.indices->normalized&&(source.indices->component_type==cgltf_component_type_r_8u||source.indices->component_type==cgltf_component_type_r_16u||source.indices->component_type==cgltf_component_type_r_32u),"Model indices must be unsigned scalar values");
            resource->parts.emplace_back();auto& part=resource->parts.back();part.mesh.vertexCount=static_cast<int>(count);part.mesh.triangleCount=static_cast<int>(count/3);
            std::vector<float> vertices(count*3),normalValues(count*3),texcoords(count*2);std::vector<unsigned char> vertexColors(count*4,255);
            for(std::size_t k=0;k<count;k++){
                const auto index=source.indices?cgltf_accessor_read_index(source.indices,k):k;check(index<positions->count,"Model index out of range");
                float value[4]{};values(positions,index,value,3);const auto point=Vector3Transform({value[0],value[1],value[2]},transform);
                for(int n=0;n<3;n++){const float v=n==0?point.x:n==1?point.y:point.z;check(std::isfinite(v)&&std::abs(v)<=10000000,"Invalid transformed model position");vertices[k*3+n]=v;resource->info.minimum[n]=std::min(resource->info.minimum[n],v);resource->info.maximum[n]=std::max(resource->info.maximum[n],v);}
                if(normals){values(normals,index,value,3);const auto n=Vector3Normalize(Vector3Transform({value[0],value[1],value[2]},normalTransform));normalValues[k*3]=n.x;normalValues[k*3+1]=n.y;normalValues[k*3+2]=n.z;}
                if(uv){values(uv,index,value,2);texcoords[k*2]=value[0];texcoords[k*2+1]=value[1];}
                if(colors){value[3]=1;values(colors,index,value,colors->type==cgltf_type_vec4?4:3);for(int n=0;n<4;n++)vertexColors[k*4+n]=static_cast<unsigned char>(std::lround(std::clamp(value[n],0.f,1.f)*255));}
            }
            if(!normals)for(std::size_t k=0;k<count;k+=3){const auto point=[&](int n){return Vector3{vertices[(k+n)*3],vertices[(k+n)*3+1],vertices[(k+n)*3+2]};};const auto n=Vector3Normalize(Vector3CrossProduct(Vector3Subtract(point(1),point(0)),Vector3Subtract(point(2),point(0))));for(int q=0;q<3;q++){normalValues[(k+q)*3]=n.x;normalValues[(k+q)*3+1]=n.y;normalValues[(k+q)*3+2]=n.z;}}
            if(!impl_->headless){
                const auto copy=[](const auto& v){void* p=MemAlloc(static_cast<unsigned int>(v.size()*sizeof(v[0])));if(!p)throw std::bad_alloc();std::copy(v.begin(),v.end(),static_cast<typename std::decay_t<decltype(v)>::value_type*>(p));return p;};
                part.mesh.vertices=static_cast<float*>(copy(vertices));part.mesh.normals=static_cast<float*>(copy(normalValues));part.mesh.texcoords=static_cast<float*>(copy(texcoords));part.mesh.colors=static_cast<unsigned char*>(copy(vertexColors));UploadMesh(&part.mesh,false);
                part.material=LoadMaterialDefault();
            }
            if(const auto* m=source.material){
                check(m->alpha_mode!=cgltf_alpha_mode_blend,"Transparent BLEND models are not supported; use OPAQUE or MASK");
                part.cutoff=m->alpha_mode==cgltf_alpha_mode_mask?m->alpha_cutoff:0;part.unlit=m->unlit?1.f:0.f;
                part.emission={m->emissive_factor[0],m->emissive_factor[1],m->emissive_factor[2]};
                if(m->has_pbr_metallic_roughness){const auto& pbr=m->pbr_metallic_roughness;
                    if(!impl_->headless){const auto* c=pbr.base_color_factor;part.material.maps[MATERIAL_MAP_ALBEDO].color={static_cast<unsigned char>(std::clamp(c[0],0.f,1.f)*255),static_cast<unsigned char>(std::clamp(c[1],0.f,1.f)*255),static_cast<unsigned char>(std::clamp(c[2],0.f,1.f)*255),static_cast<unsigned char>(std::clamp(c[3],0.f,1.f)*255)};}
                    if(pbr.base_color_texture.texture){check(!pbr.base_color_texture.has_transform&&pbr.base_color_texture.texcoord==0,"Model base color texture requires untransformed TEXCOORD_0");const auto* image=pbr.base_color_texture.texture->image;check(image,"Model base color image is missing");if(!impl_->headless)part.material.maps[MATERIAL_MAP_ALBEDO].texture=resource->textures.at(static_cast<std::size_t>(image-data->images));}
                }
            }
            resource->info.meshes++;resource->info.vertices+=static_cast<std::uint32_t>(positions->count);resource->info.triangles+=static_cast<std::uint32_t>(count/3);
        }
    }
    check(resource->info.meshes>0,"Model has no scene triangle meshes");const auto result=resource->info;impl_->resources.emplace(id,std::move(resource));return result;
}
void ModelStore::begin(const std::array<float,16>& vp,const std::array<float,18>& p){
    auto& s=*impl_;check(!s.active,"Model scene already active");validateModelMatrix(vp,false);validateModelLighting(p);s.active=true;if(s.headless)return;
    s.ensureShader();rlDrawRenderBatchActive();s.projection=rlGetMatrixProjection();s.modelview=rlGetMatrixModelview();
    s.depth=glIsEnabled(GL_DEPTH_TEST);s.cull=glIsEnabled(GL_CULL_FACE);s.blend=glIsEnabled(GL_BLEND);glGetBooleanv(GL_DEPTH_WRITEMASK,&s.mask);glGetIntegerv(GL_DEPTH_FUNC,&s.depthFunction);
    rlSetMatrixProjection(matrix(vp));rlSetMatrixModelview(MatrixIdentity());glEnable(GL_DEPTH_TEST);glDepthFunc(GL_LEQUAL);glDepthMask(GL_TRUE);glDisable(GL_CULL_FACE);glDisable(GL_BLEND);glClear(GL_DEPTH_BUFFER_BIT);
    s.uniform("eye",p.data(),SHADER_UNIFORM_VEC3);s.uniform("sun",p.data()+3,SHADER_UNIFORM_VEC3);s.uniform("ambient",p.data()+6,SHADER_UNIFORM_VEC3);s.uniform("sunlight",p.data()+9,SHADER_UNIFORM_VEC3);s.uniform("fogColor",p.data()+12,SHADER_UNIFORM_VEC3);s.uniform("fogRange",p.data()+15,SHADER_UNIFORM_VEC2);s.uniform("exposure",p.data()+17,SHADER_UNIFORM_FLOAT);
}
void ModelStore::draw(std::uint32_t id,const std::array<float,16>& transform,std::uint32_t tint){
    auto& s=*impl_;check(s.active,"Model requires a model scene");info(id);validateModelMatrix(transform,true);if(s.headless)return;
    const auto t=color(tint);for(auto& part:s.resources.at(id)->parts){auto material=part.material;material.shader=s.shader;auto& base=material.maps[MATERIAL_MAP_ALBEDO].color;const auto old=base;base={static_cast<unsigned char>(old.r*t.r/255),static_cast<unsigned char>(old.g*t.g/255),static_cast<unsigned char>(old.b*t.b/255),static_cast<unsigned char>(old.a*t.a/255)};
        s.uniform("emission",&part.emission.x,SHADER_UNIFORM_VEC3);s.uniform("alphaCutoff",&part.cutoff,SHADER_UNIFORM_FLOAT);s.uniform("unlit",&part.unlit,SHADER_UNIFORM_FLOAT);DrawMesh(part.mesh,material,matrix(transform));base=old;}
}
void ModelStore::end(){auto& s=*impl_;check(s.active,"No model scene to end");s.active=false;if(s.headless)return;rlDrawRenderBatchActive();rlSetMatrixProjection(s.projection);rlSetMatrixModelview(s.modelview);glDepthMask(s.mask);glDepthFunc(s.depthFunction);if(s.depth)glEnable(GL_DEPTH_TEST);else glDisable(GL_DEPTH_TEST);if(s.cull)glEnable(GL_CULL_FACE);else glDisable(GL_CULL_FACE);if(s.blend)glEnable(GL_BLEND);else glDisable(GL_BLEND);}
}
