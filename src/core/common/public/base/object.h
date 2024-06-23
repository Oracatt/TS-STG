#pragma once
#include "iunknown.h"

namespace tsstg
{
    template<class T> class ObjectPtr;

    class Object : public virtual IUnknown
    {
        template<class T, class... Args> friend ObjectPtr<T> CreateObject(Args&&...);

        IMPL_IUNKNOWN_REFCOUNTER();

        IMPL_IUNKNOWN_QUERY_BEGIN();
        IMPL_IUNKNOWN_QUERY(IUnknown);
        IMPL_IUNKNOWN_QUERY_END();

    private:
        Object();
        Object(const Object&) = delete;
        Object(Object&&) = delete;
        Object& operator=(const Object&) = delete;
        Object& operator=(Object&&) = delete;
    };

    template<class T, class... Args> ObjectPtr<T> CreateObject(Args&&... args)
    {
        return new T(std::forward<Args>(args)...);
    }
} // namespace tsstg