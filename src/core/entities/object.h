#pragma once
#include "common/public/interface/iunknown.h"
#include "common/public/interface/iweakreference.h"
#include "common/private/iunknown_impl.h"

#define GENERATE_OBJECT_BODY()                                                                                         \
    template<class T, class... Args> friend ComPtr<T> CreateObject(Args&&...);                                         \
                                                                                                                       \
private:                                                                                                               \
    void* operator new(size_t size)                                                                                    \
    {                                                                                                                  \
        return ::operator new(size);                                                                                   \
    }                                                                                                                  \
    void operator delete(void* ptr)                                                                                    \
    {                                                                                                                  \
        ::operator delete(ptr);                                                                                        \
    }                                                                                                                  \
    void* operator new[](size_t size) = delete;                                                                        \
    void operator delete[](void* ptr) = delete;

namespace tsstg
{
    DEFINE_CLASS_GUID_ANONYMOUS(Object)
    class Object : public virtual IUnknown, public virtual IWeakReferenceSource
    {
    private:
        IMPL_IUNKNOWN_DEFAULT();
        GENERATE_OBJECT_BODY();

    private:
        ComPtr<IWeakReference> mWeakRef;

    public:
        Object();
        ~Object();
        Object(const Object&) = delete;
        Object(Object&&) = delete;
        Object& operator=(const Object&) = delete;
        Object& operator=(Object&&) = delete;

        bool GetWeakReference(IWeakReference** ppv) override;
    };

    template<class T, class... Args> ComPtr<T> CreateObject(Args&&... args)
    {
        return new T(std::forward<Args>(args)...);
    }
} // namespace tsstg