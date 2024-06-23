#pragma once
#include <stdint.h>
#include <atomic>
#include <array>

#define MAKE_GUID(hguid, lguid)                                                                                        \
    {                                                                                                                  \
        ((uint64_t)hguid >> 32) & 0xffffffff, ((uint64_t)hguid >> 16) & 0xffff, (((uint64_t)hguid) & 0xffff),          \
        {                                                                                                              \
            (((uint64_t)lguid >> 56) & 0xff), (((uint64_t)lguid >> 48) & 0xff), (((uint64_t)lguid >> 40) & 0xff),      \
                (((uint64_t)lguid >> 32) & 0xff), (((uint64_t)lguid >> 24) & 0xff), (((uint64_t)lguid >> 16) & 0xff),  \
                (((uint64_t)lguid >> 8) & 0xff), (((uint64_t)lguid) & 0xff)                                            \
        }                                                                                                              \
    }

#define GUID_OF(interface) tsstg::kGUID##interface

#define DEFINE_INTERFACE_ROOT(interface, hguid, lguid)                                                                 \
    constexpr tsstg::GUID kGUID##interface = MAKE_GUID(hguid, lguid);                                                  \
    class interface

#define DEFINE_INTERFACE(interface, base, hguid, lguid)                                                                \
    constexpr tsstg::GUID kGUID##interface = MAKE_GUID(hguid, lguid);                                                  \
    class interface : public virtual base

#define IMPL_IUNKNOWN_REFCOUNTER()                                                                                     \
private:                                                                                                               \
    std::atomic_uint32_t mRef = 0;                                                                                     \
                                                                                                                       \
public:                                                                                                                \
    uint32_t AddRef() override                                                                                         \
    {                                                                                                                  \
        return ++mRef;                                                                                                 \
    }                                                                                                                  \
    uint32_t Release() override                                                                                        \
    {                                                                                                                  \
        uint32_t ref = --mRef;                                                                                         \
        if (ref == 0)                                                                                                  \
        {                                                                                                              \
            delete this;                                                                                               \
        }                                                                                                              \
        return ref;                                                                                                    \
    }

#define IMPL_IUNKNOWN_QUERY_BEGIN()                                                                                    \
public:                                                                                                                \
    bool QueryInterface(const GUID& guid, void** ppv) override                                                         \
    {
#define IMPL_IUNKNOWN_QUERY(interface)                                                                                 \
    if (guid == GUID_OF(interface))                                                                                    \
    {                                                                                                                  \
        this->AddRef();                                                                                                \
        *ppv = static_cast<interface*>(this);                                                                          \
        return true;                                                                                                   \
    }
#define IMPL_IUNKNOWN_QUERY_END()                                                                                      \
    *ppv = nullptr;                                                                                                    \
    return false;                                                                                                      \
    }

namespace tsstg
{
    struct GUID
    {
        uint32_t data1;
        uint16_t data2;
        uint16_t data3;
        uint8_t data4[8];
    };

    constexpr bool operator==(const GUID& lhs, const GUID& rhs)
    {
        return lhs.data1 == rhs.data1 && lhs.data2 == rhs.data2 && lhs.data3 == rhs.data3 &&
               std::equal(std::begin(lhs.data4), std::end(lhs.data4), std::begin(rhs.data4));
    }

    constexpr bool operator!=(const GUID& lhs, const GUID& rhs)
    {
        return !(lhs == rhs);
    }

    DEFINE_INTERFACE_ROOT(IUnknown, 0xb6a3e64ce75c8230ULL, 0xb382c010acdeb7cfULL)
    {
    public:
        virtual ~IUnknown() {}
        virtual uint32_t AddRef() = 0;
        virtual uint32_t Release() = 0;
        virtual bool QueryInterface(const GUID& guid, void** ppv) = 0;
    };
} // namespace tsstg