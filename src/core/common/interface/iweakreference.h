#pragma once
#include "iunknown.h"

namespace tsstg
{
    DEFINE_CLASS_GUID(IWeakReference, 0xd2c86dec4b8f8ef7ULL, 0xee8f0aebff519a66ULL);
    class IWeakReference : public virtual IUnknown
    {
    public:
        virtual bool Resolve(const GUID& guid, void** ppv) = 0;
    };

    DEFINE_CLASS_GUID(IWeakReferenceSource, 0xf52f291d70a2fc42ULL, 0xc18e4aa73822c8e8ULL);
    class IWeakReferenceSource : public virtual IUnknown
    {
    public:
        virtual bool GetWeakReference(IWeakReference** ppv) = 0;
    };
} // namespace tsstg