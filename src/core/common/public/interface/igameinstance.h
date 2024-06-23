#pragma once

#include "iunknown.h"

namespace tsstg
{
    class IGameInstance: public virtual IUnknown
    {
        DEFINE_INTERFACE_GUID(0x85e7d0f0b2f07d1dULL, 0x8a84d1e3e0f9702fULL);
    };
}