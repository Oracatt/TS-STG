#pragma once
#include <cstdint>
#include <atomic>
#include "common/guid.h"

namespace tsstg
{
    DEFINE_CLASS_GUID(IUnknown, 0xb6a3e64ce75c8230ULL, 0xb382c010acdeb7cfULL);
    class IUnknown
    {
    public:
        virtual ~IUnknown() {}
        virtual uint32_t AddRef() = 0;
        virtual uint32_t Release() = 0;
        virtual bool QueryInterface(const GUID& guid, void** ppv) = 0;
    };
} // namespace tsstg