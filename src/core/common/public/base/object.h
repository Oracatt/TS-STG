#pragma once
#include "iunknown.h"
#include "iweakreference.h"

#define GENERATE_OBJECT_BODY()                                                                                         \
    template<class T, class... Args> friend ComPtr<T> CreateObject(Args&&...);                                         \
                                                                                                                       \
private:                                                                                                               \
    class WeakRefResolver : public virtual IWeakReference                                                              \
    {                                                                                                                  \
    private:                                                                                                           \
        ComPtr<IUnknown> mRefSource;                                                                                   \
        std::atomic_uint32_t mRef = 0;                                                                                 \
                                                                                                                       \
    public:                                                                                                            \
        WeakRefResolver(IUnknown* source) : mRefSource(source) {}                                                      \
                                                                                                                       \
        void SetExpired()                                                                                              \
        {                                                                                                              \
            mRefSource.Reset();                                                                                        \
        }                                                                                                              \
                                                                                                                       \
        bool Resolve(const GUID& guid, void** ppv) override                                                            \
        {                                                                                                              \
            if (!mRefSource)                                                                                           \
            {                                                                                                          \
                *ppv = nullptr;                                                                                        \
                return false;                                                                                          \
            }                                                                                                          \
            return mRefSource->QueryInterface(guid, ppv);                                                              \
        }                                                                                                              \
                                                                                                                       \
        uint32_t AddRef() override                                                                                     \
        {                                                                                                              \
            return ++mRef;                                                                                             \
        }                                                                                                              \
                                                                                                                       \
        uint32_t Release() override                                                                                    \
        {                                                                                                              \
            uint32_t ref = --mRef;                                                                                     \
            if (ref == 0)                                                                                              \
            {                                                                                                          \
                delete this;                                                                                           \
            }                                                                                                          \
            return ref;                                                                                                \
        }                                                                                                              \
                                                                                                                       \
        bool QueryInterface(const GUID& guid, void** ppv) override                                                     \
        {                                                                                                              \
            auto it = gInterfaceQueryFuncTable.find(guid);                                                             \
            if (it != gInterfaceQueryFuncTable.end())                                                                  \
            {                                                                                                          \
                auto ptr = it->second(static_cast<IUnknown*>(this));                                                   \
                if (ptr)                                                                                               \
                {                                                                                                      \
                    this->AddRef();                                                                                    \
                }                                                                                                      \
                *ppv = ptr;                                                                                            \
                return true;                                                                                           \
            }                                                                                                          \
            *ppv = nullptr;                                                                                            \
            return false;                                                                                              \
        }                                                                                                              \
    };                                                                                                                 \
                                                                                                                       \
private:                                                                                                               \
    std::atomic_uint32_t mRef = 0;                                                                                     \
    ComPtr<WeakRefResolver> mWeakRef;                                                                                  \
                                                                                                                       \
public:                                                                                                                \
    uint32_t AddRef() override                                                                                         \
    {                                                                                                                  \
        uint32_t ref = ++mRef;                                                                                         \
        if (ref == 1 && !mWeakRef)                                                                                     \
        {                                                                                                              \
            mWeakRef = new WeakRefResolver(this);                                                                      \
        }                                                                                                              \
        return ref;                                                                                                    \
    }                                                                                                                  \
                                                                                                                       \
    uint32_t Release() override                                                                                        \
    {                                                                                                                  \
        uint32_t ref = --mRef;                                                                                         \
        if (ref == 0)                                                                                                  \
        {                                                                                                              \
            if (mWeakRef)                                                                                              \
            {                                                                                                          \
                mWeakRef->SetExpired();                                                                                \
            }                                                                                                          \
            delete this;                                                                                               \
        }                                                                                                              \
        return ref;                                                                                                    \
    }                                                                                                                  \
                                                                                                                       \
    bool QueryInterface(const GUID& guid, void** ppv) override                                                         \
    {                                                                                                                  \
        auto it = gInterfaceQueryFuncTable.find(guid);                                                                 \
        if (it != gInterfaceQueryFuncTable.end())                                                                      \
        {                                                                                                              \
            auto ptr = it->second(static_cast<IUnknown*>(this));                                                       \
            if (ptr)                                                                                                   \
            {                                                                                                          \
                this->AddRef();                                                                                        \
            }                                                                                                          \
            *ppv = ptr;                                                                                                \
            return true;                                                                                               \
        }                                                                                                              \
        *ppv = nullptr;                                                                                                \
        return false;                                                                                                  \
    }                                                                                                                  \
                                                                                                                       \
    bool GetWeakReference(IWeakReference** ppv) override                                                               \
    {                                                                                                                  \
        return mWeakRef.As(ppv);                                                                                       \
    }                                                                                                                  \
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
    class Object : public virtual IUnknown, public virtual IWeakReferenceSource
    {
        GENERATE_OBJECT_BODY();

    public:
        Object(const Object&) = delete;
        Object(Object&&) = delete;
        Object& operator=(const Object&) = delete;
        Object& operator=(Object&&) = delete;
    };

    template<class T, class... Args> ComPtr<T> CreateObject(Args&&... args)
    {
        return new T(std::forward<Args>(args)...);
    }
} // namespace tsstg