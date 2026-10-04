// Only the surrounding engine services are mocked. OnUpdate is extracted
// verbatim from the user's read-only original Dialog.h by the verification tool.
#include <iostream>
#include <vector>
struct Controller {bool control=false,z=false;bool IsLControlDown(){return control;}bool IsZPressed(){return z;}};
struct Player {Controller controller;Controller* GetController(){return &controller;}} originalPlayer;
Player* player=&originalPlayer;
struct Sound {void Play(){}} se_plst;
struct Dialog {
 int step=-1,coldFrame=30,autoNextFrame=300;bool complete=false;std::vector<int> cold;
 void StepChange(int index){coldFrame=cold.at(index);complete=index+1==static_cast<int>(cold.size());}
 void OnUpdate()
#include "dialogue-update.inc"
};
int main(){int cases;std::cin>>cases;for(int c=0;c<cases;c++){
 int count,frames;std::cin>>count>>frames;Dialog dialogue;dialogue.cold.resize(count);for(auto& v:dialogue.cold)std::cin>>v;dialogue.StepChange(++dialogue.step);
 for(int frame=0;frame<frames;frame++){int mask;std::cin>>mask;player->controller.control=(mask&1)!=0;player->controller.z=(mask&2)!=0;if(!dialogue.complete)dialogue.OnUpdate();
 std::cout<<dialogue.step<<' '<<dialogue.coldFrame<<' '<<dialogue.autoNextFrame<<' '<<dialogue.complete<<' ';}std::cout<<'\n';
}}
