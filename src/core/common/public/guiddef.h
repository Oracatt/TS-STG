#pragma once
#include "types.h"
#include <map>
#include <cstdint>

#define MAKE_GUID(hguid, lguid)                                                                                        \
    {                                                                                                                  \
        ((uint64_t)hguid >> 32) & 0xffffffff, ((uint64_t)hguid >> 16) & 0xffff, (((uint64_t)hguid) & 0xffff),          \
        {                                                                                                              \
            (((uint64_t)lguid >> 56) & 0xff), (((uint64_t)lguid >> 48) & 0xff), (((uint64_t)lguid >> 40) & 0xff),      \
                (((uint64_t)lguid >> 32) & 0xff), (((uint64_t)lguid >> 24) & 0xff), (((uint64_t)lguid >> 16) & 0xff),  \
                (((uint64_t)lguid >> 8) & 0xff), (((uint64_t)lguid) & 0xff)                                            \
        }                                                                                                              \
    }

#define GUID_OF(cls) TypeGUID<cls>::guid

#define DEFINE_IUNKNOWN_GUID(cls, hguid, lguid)                                                                        \
    class cls;                                                                                                         \
    template<> struct TypeGUID<cls>                                                                                    \
    {                                                                                                                  \
        static constexpr GUID guid = MAKE_GUID(hguid, lguid);                                                          \
    };                                                                                                                 \
    static guid::GUIDRegister _gGUIDRegister_##cls(GUID_OF(cls), +[](IUnknown* thiz) -> void* { return thiz; });

#define DEFINE_CLASS_GUID(cls, hguid, lguid)                                                                           \
    class cls;                                                                                                         \
    template<> struct TypeGUID<cls>                                                                                    \
    {                                                                                                                  \
        static constexpr GUID guid = MAKE_GUID(hguid, lguid);                                                          \
    };                                                                                                                 \
    static guid::GUIDRegister _gGUIDRegister_##cls(                                                                    \
        GUID_OF(cls), +[](IUnknown* thiz) -> void* { return dynamic_cast<cls*>(thiz); });

#define DEFINE_CLASS_GUID_ANONYMOUS(cls)                                                                               \
    class cls;                                                                                                         \
    template<> struct TypeGUID<cls>                                                                                    \
    {                                                                                                                  \
        static constexpr GUID guid = guid::GenerateAnonmousGUIDFromClassName(#cls);                                    \
    };                                                                                                                 \
    static guid::GUIDRegister _gGUIDRegister_##cls(                                                                    \
        GUID_OF(cls), +[](IUnknown* thiz) -> void* { return dynamic_cast<cls*>(thiz); });

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

    template<class T> struct TypeGUID;

    namespace guid
    {
        TSSTG_API InterfaceQueryFunc GetInterfaceQueryFunc(const GUID& guid);
        TSSTG_API void SetInterfaceQueryFunc(const GUID& guid, InterfaceQueryFunc func);

        struct GUIDRegister
        {
            GUIDRegister(const GUID& guid, InterfaceQueryFunc func)
            {
                guid::SetInterfaceQueryFunc(guid, func);
            }
        };

        template<size_t N> constexpr uint64_t GetStringHash(const char (&str)[N], uint64_t hash = 0)
        {
            // for (size_t i = 0; i < N; ++i)
            // {
            //     hash = (hash * 131) + str[i];
            // }
            // return hash;
            return 0;
        }

        template<size_t N> constexpr GUID GenerateAnonmousGUIDFromClassName(const char (&clsName)[N])
        {
            constexpr uint64_t hash1 = GetStringHash(clsName);
            constexpr uint64_t hash2 = GetStringHash(clsName, 0x9e3779b97f4a7c15);
            return MAKE_GUID(hash1, hash2);
        }
    } // namespace guid
} // namespace tsstg