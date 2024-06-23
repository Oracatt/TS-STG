#include "common/public/base/iunknown.h"
#include "common/public/base/iweakreference.h"
#include "common/public/interface/igameinstance.h"

namespace tsstg
{
    /*
        Base Interface
    */
    REGISTER_INTERFACE(IUnknown);
    REGISTER_INTERFACE(IWeakReference);
    REGISTER_INTERFACE(IWeakReferenceSource);

    /*
        Engine Interface
    */
    REGISTER_INTERFACE(IGameInstance);
}