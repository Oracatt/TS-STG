#pragma once

#include "common/interface/iunknown.h"

namespace tsstg
{
    DEFINE_CLASS_GUID(IGameInstance, 0x85e7d0f0b2f07d1dULL, 0x8a84d1e3e0f9702fULL);
    class IGameInstance : public virtual IUnknown
    {
    };
} // namespace tsstg