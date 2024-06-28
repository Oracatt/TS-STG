#pragma once
#include "common/public/guiddef.h"
#include "common/public/interface/iunknown.h"

#define IMPL_IUNKNOWN_DEFAULT()                                                                                        \
private:                                                                                                               \
    std::atomic_uint32_t mRef = 0;                                                                                     \
                                                                                                                       \
public:                                                                                                                \
    uint32_t AddRef() override                                                                                         \
    {                                                                                                                  \
        return ++mRef;                                                                                                 \
    }                                                                                                                  \
                                                                                                                       \
    uint32_t Release() override                                                                                        \
    {                                                                                                                  \
        uint32_t ref = --mRef;                                                                                         \
        if (ref == 0)                                                                                                  \
        {                                                                                                              \
            delete this;                                                                                               \
        }                                                                                                              \
        return ref;                                                                                                    \
    }                                                                                                                  \
                                                                                                                       \
    bool QueryInterface(const GUID& guid, void** ppv) override                                                         \
    {                                                                                                                  \
        auto func = guid::GetInterfaceQueryFunc(guid);                                                                 \
        if (func)                                                                                                      \
        {                                                                                                              \
            auto ptr = func(static_cast<IUnknown*>(this));                                                             \
            if (ptr)                                                                                                   \
            {                                                                                                          \
                this->AddRef();                                                                                        \
            }                                                                                                          \
            *ppv = ptr;                                                                                                \
            return true;                                                                                               \
        }                                                                                                              \
        *ppv = nullptr;                                                                                                \
        return false;                                                                                                  \
    }