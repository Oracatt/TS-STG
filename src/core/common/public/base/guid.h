#pragma once
#include <map>

#define MAKE_GUID(hguid, lguid)                                                                                        \
    {                                                                                                                  \
        ((uint64_t)hguid >> 32) & 0xffffffff, ((uint64_t)hguid >> 16) & 0xffff, (((uint64_t)hguid) & 0xffff),          \
        {                                                                                                              \
            (((uint64_t)lguid >> 56) & 0xff), (((uint64_t)lguid >> 48) & 0xff), (((uint64_t)lguid >> 40) & 0xff),      \
                (((uint64_t)lguid >> 32) & 0xff), (((uint64_t)lguid >> 24) & 0xff), (((uint64_t)lguid >> 16) & 0xff),  \
                (((uint64_t)lguid >> 8) & 0xff), (((uint64_t)lguid) & 0xff)                                            \
        }                                                                                                              \
    }

#define GUID_OF(interface) interface::kInterfaceGUID

#define DEFINE_INTERFACE_GUID(hguid, lguid)                                                                            \
public:                                                                                                                \
    static constexpr GUID kInterfaceGUID = MAKE_GUID(hguid, lguid);

#define REGISTER_INTERFACE(interface)                                                                                  \
    static InterfaceRegister _gInterfaceRegister_##interface(                                                          \
        interface::kInterfaceGUID, +[](IUnknown* thiz) -> void* { return dynamic_cast<interface*>(thiz); });

namespace tsstg
{
    class IUnknown;

    typedef void* (*InterfaceQueryFunc)(IUnknown*);

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

    constexpr bool operator<(const GUID& lhs, const GUID& rhs)
    {
        if (lhs.data1 != rhs.data1)
            return lhs.data1 < rhs.data1;
        if (lhs.data2 != rhs.data2)
            return lhs.data2 < rhs.data2;
        if (lhs.data3 != rhs.data3)
            return lhs.data3 < rhs.data3;

        for (int i = 0; i < 8; i++)
        {
            if (lhs.data4[i] != rhs.data4[i])
                return lhs.data4[i] < rhs.data4[i];
        }
        return false;
    }

    extern std::map<GUID, InterfaceQueryFunc> gInterfaceQueryFuncTable;

    struct InterfaceRegister
    {
        InterfaceRegister(const GUID& guid, InterfaceQueryFunc func)
        {
            if (gInterfaceQueryFuncTable.find(guid) == gInterfaceQueryFuncTable.end())
                gInterfaceQueryFuncTable.insert(std::make_pair(guid, func));
        }
    };
} // namespace tsstg