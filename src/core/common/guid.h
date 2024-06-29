#pragma once
#include "types.h"
#include <map>
#include <cstdint>

#define MAKE_GUID(hguid, lguid)                                                                                        \
    {                                                                                                                  \
        (uint32_t)((hguid >> 32) & 0xffffffff), (uint16_t)((hguid >> 16) & 0xffff), (uint16_t)(hguid & 0xffff),        \
        {                                                                                                              \
            (uint8_t)((lguid >> 56) & 0xff), (uint8_t)((lguid >> 48) & 0xff), (uint8_t)((lguid >> 40) & 0xff),         \
                (uint8_t)((lguid >> 32) & 0xff), (uint8_t)((lguid >> 24) & 0xff), (uint8_t)((lguid >> 16) & 0xff),     \
                (uint8_t)((lguid >> 8) & 0xff), (uint8_t)((lguid) & 0xff)                                              \
        }                                                                                                              \
    }

#define GUID_OF(cls) TypeGUID<cls>::guid

#define DEFINE_CLASS_GUID(cls, hguid, lguid)                                                                           \
    class cls;                                                                                                         \
    template<> struct TypeGUID<cls>                                                                                    \
    {                                                                                                                  \
        static constexpr GUID guid = MAKE_GUID(hguid, lguid);                                                          \
    };                                                                                                                 \
    template<> struct GUIDType<hguid, lguid>                                                                           \
    {                                                                                                                  \
        using type = cls;                                                                                              \
    };

#define DEFINE_CLASS_GUID_ANONYMOUS(cls)                                                                               \
    class cls;                                                                                                         \
    template<> struct TypeGUID<cls>                                                                                    \
    {                                                                                                                  \
        static constexpr GUID guid = GenerateAnonmousGUIDFromClassName(#cls);                                          \
    };                                                                                                                 \
    template<> struct GUIDType<GetHighPartOfGUID(TypeGUID<cls>::guid), GetLowPartOfGUID(TypeGUID<cls>::guid)>          \
    {                                                                                                                  \
        using type = cls;                                                                                              \
    };

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
    template<uint64_t hguid, uint64_t lguid> struct GUIDType;

    constexpr uint64_t GetHighPartOfGUID(GUID guid)
    {
        return ((uint64_t)guid.data1) << 32 | ((uint64_t)guid.data2) << 16 | (uint64_t)guid.data3;
    }

    constexpr uint64_t GetLowPartOfGUID(GUID guid)
    {
        uint64_t ret = 0;
        for (int i = 0; i < 8; i++)
        {
            ret |= ((uint64_t)guid.data4[i]) << (56 - i * 8);
        }
        return ret;
    }

    template<size_t N> constexpr GUID GenerateAnonmousGUIDFromClassName(const char (&clsName)[N])
    {
        uint64_t hash1 = 0;
        uint64_t hash2 = 0x9e3779b97f4a7c15;
        for (size_t i = 0; i < N - 1; ++i)
        {
            hash1 = (hash1 * 131) + clsName[i];
            hash2 = (hash2 * 131) + clsName[i];
        }
        return MAKE_GUID(hash1, hash2);
    }
} // namespace tsstg